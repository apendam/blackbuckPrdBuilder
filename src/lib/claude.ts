import { buildSystemPrompt, riskySymbolPreamble, buildVerifierSystemPrompt } from "./systemPrompt";
import { TOOL_DEFS, VERIFICATION_TOOL_DEFS } from "./tools";
import { executeTool, TurnState } from "./toolExecutor";
import { savePrdMarkdown, readPrdMarkdown } from "./knowledgeBase";
import { anthropicAdapter } from "./providers/anthropic";
import { openrouterAdapter } from "./providers/openrouter";
import { CanonicalMessage, ProviderAdapter } from "./providers/types";
import {
  ChatMessage,
  PhaseState,
  INITIAL_PHASE_STATE,
  Phase,
  Provider,
  SkeletonSection,
  SkeletonHistoryEntry,
  TokenUsage,
  ModelUsageBreakdown,
  VerificationFinding,
  RawVerificationFinding,
} from "./types";
import { PhaseModelSetting } from "./modelSettings";

function newFindingId(): string {
  return `vf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Turns what the verifier reported into what the UI can actually anchor onto
// the document -- same {quote, occurrence} scheme PrdCommentLayer already
// uses for the PM's own comments. A model-supplied quote is a claim, not a
// guarantee: it can misquote, paraphrase, or hallucinate a passage that
// isn't really there. Rather than trust it blindly (which would either
// silently mis-anchor or throw when the UI tries to find a match that
// doesn't exist), verify it's a real substring of the actual PRD text first;
// if it isn't, the finding still stands, it just renders unanchored (general
// findings list) instead of highlighted in the document. Occurrence always
// resolves to the first match -- disambiguating a genuinely repeated quote
// would require the model to also count occurrences accurately, which is
// more failure-prone than picking the first (still-relevant) instance.
export function anchorFindings(prdText: string, raw: RawVerificationFinding[]): VerificationFinding[] {
  return raw.map((f) => {
    const quote = f.prdQuote.trim();
    const isRealMatch = quote.length > 0 && prdText.includes(quote);
    return {
      id: newFindingId(),
      author: "judge",
      section: f.section,
      category: f.category,
      summary: f.summary,
      whyItMatters: f.whyItMatters,
      citation: f.citation,
      prdQuote: isRealMatch ? quote : "",
      occurrence: 0,
      status: "open",
      replies: [],
      at: new Date().toISOString(),
    };
  });
}

const MAX_TOOL_ROUNDS = 25;
// A real run against the Gold/TZF PRD (3 focus areas -- dues, mandate,
// status/enum -- across 5+ repos) hit 10 rounds every time, still mid-
// investigation, never reaching report_verification_findings. This isn't a
// stuck loop (each round was still making fresh read_repo_file/search_repo
// calls, not repeating itself) -- 10 was just too tight for genuinely
// thorough cross-repo checking. Matched to the drafting loop's own budget
// since the verifier's job is comparably deep, just narrower in scope.
const MAX_VERIFY_ROUNDS = 25;

function adapterFor(provider: Provider): ProviderAdapter {
  return provider === "openrouter" ? openrouterAdapter : anthropicAdapter;
}

function toCanonicalHistory(history: ChatMessage[]): CanonicalMessage[] {
  return history.map((m) => ({
    role: m.role,
    text: m.content,
    attachments: m.attachments,
  }));
}

// Shared by runChatTurn and runVerificationPass so a turn that spans both
// (a full_prd draft immediately followed by its own verify pass) reports one
// combined, per-model usage total instead of two disjoint ones.
function addUsage(
  usageByModel: Map<string, ModelUsageBreakdown>,
  provider: Provider,
  model: string,
  usage: { inputTokens: number; outputTokens: number; cost?: number }
) {
  const key = `${provider}:${model}`;
  const existing =
    usageByModel.get(key) ?? ({ provider, model, inputTokens: 0, outputTokens: 0 } as ModelUsageBreakdown);
  existing.inputTokens += usage.inputTokens;
  existing.outputTokens += usage.outputTokens;
  if (usage.cost !== undefined) {
    existing.cost = (existing.cost ?? 0) + usage.cost;
  }
  usageByModel.set(key, existing);
}

function usageFromMap(usageByModel: Map<string, ModelUsageBreakdown>): TokenUsage {
  const byModel = Array.from(usageByModel.values());
  return {
    inputTokens: byModel.reduce((sum, m) => sum + m.inputTokens, 0),
    outputTokens: byModel.reduce((sum, m) => sum + m.outputTokens, 0),
    byModel,
  };
}

// Heuristic for "this reply is a complete full-PRD draft, not a clarifying
// question or a one-section revision" -- Phase 8 can span several
// conversational turns before the draft is actually ready, and running the
// (real, non-trivial cost) verify pass on every one of those would be
// wasteful. Not exact, but cheap and conservative: a real full PRD is long
// and multi-sectioned; nothing else in this phase looks like that.
function looksLikeFullDraft(text: string): boolean {
  const headingCount = (text.match(/^#{2,3}\s/gm) ?? []).length;
  return text.length > 2000 && headingCount >= 4;
}

export interface ChatTurnResult {
  reply: string;
  phaseState: PhaseState;
  title?: string;
  verticals?: string[];
  skeletonSections?: SkeletonSection[];
  skeletonHistory?: SkeletonHistoryEntry[];
  savedPrd?: { path: string };
  googleDocUrl?: string;
  verificationFindings?: VerificationFinding[];
  usage: TokenUsage;
}

// An independent model call, not the drafting model checking its own work --
// runs its own small tool loop against buildVerifierSystemPrompt() (which
// deliberately does NOT include the drafting skill or its worked examples)
// with only read/search/report tools available, and returns whatever it
// reports via report_verification_findings. Exported separately from
// runChatTurn so a manual "re-verify" action can call it directly against a
// saved PRD without re-running the whole drafting turn.
export async function runVerificationPass(
  prdText: string,
  modelSettings: Record<Phase, PhaseModelSetting>
): Promise<{
  findings: RawVerificationFinding[];
  usageByModel: Map<string, ModelUsageBreakdown>;
  // False if the loop ended (round budget exhausted, or the model just
  // stopped calling tools) without report_verification_findings ever being
  // called. That is NOT the same thing as "verified thoroughly, found
  // nothing" -- callers must not treat an incomplete pass as a clean one,
  // the same "never claim success you didn't actually see" rule this app
  // already applies to save_prd_markdown/create_google_doc.
  completed: boolean;
}> {
  const setting = modelSettings.full_prd_verify;
  const adapter = adapterFor(setting.provider);
  const verifyState: TurnState = { phaseState: { current: "full_prd_verify", completed: [] } };
  const ctx = { userId: "", conversationId: "" };
  const history: CanonicalMessage[] = [
    { role: "user", text: `Here is the PRD to verify:\n\n${prdText}` },
  ];
  const usageByModel = new Map<string, ModelUsageBreakdown>();
  let reported = false;

  for (let round = 0; round < MAX_VERIFY_ROUNDS && !reported; round++) {
    const result = await adapter.callOnce({
      model: setting.model,
      effort: setting.effort,
      systemPrompt: buildVerifierSystemPrompt(),
      history,
      tools: VERIFICATION_TOOL_DEFS,
    });
    addUsage(usageByModel, setting.provider, setting.model, result.usage);

    if (result.toolCalls.length === 0) break;

    history.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls });
    const toolResults = [];
    for (const call of result.toolCalls) {
      const content = call.parseError
        ? `ERROR: your arguments for ${call.name} failed to parse (${call.parseError}). Retry with a smaller/simpler payload.`
        : await executeTool(call.name, call.input, verifyState, ctx);
      toolResults.push({ toolCallId: call.id, content });
      // A malformed report_verification_findings call (parseError set) never
      // reaches executeTool, so verifyState.verificationFindings is never
      // populated -- counting it as "reported" anyway would return
      // completed:true with an empty findings array, which is exactly the
      // false-clean-pass this function's own contract forbids.
      if (call.name === "report_verification_findings" && !call.parseError) reported = true;
    }
    history.push({ role: "tool", toolResults });
  }

  return { findings: verifyState.verificationFindings ?? [], usageByModel, completed: reported };
}

// The one honest thing to show when the verifier ran but didn't finish --
// shared by runChatTurn's auto-verify block and the manual re-verify route
// so the two call sites can't drift into showing different wording for the
// identical "didn't finish" condition.
export function buildIncompleteVerificationFinding(): VerificationFinding[] {
  return [
    {
      id: newFindingId(),
      author: "judge",
      section: "Verification",
      category: "incomplete",
      summary: "The verification pass didn't finish reporting results.",
      whyItMatters:
        "This is not the same as a clean check -- it means the independent review ran out of room before it could report findings.",
      citation: "runVerificationPass exhausted its round budget without calling report_verification_findings",
      prdQuote: "",
      occurrence: 0,
      status: "open",
      replies: [],
      at: new Date().toISOString(),
    },
  ];
}

export async function runChatTurn(
  history: ChatMessage[],
  currentPhaseState: PhaseState,
  modelSettings: Record<Phase, PhaseModelSetting>,
  userId: string,
  conversationId: string,
  previousSkeleton?: SkeletonSection[],
  existingSkeletonHistory?: SkeletonHistoryEntry[],
  isFreshRevision?: boolean,
  // Carried across turns so a fresh auto-verify sweep (which re-checks the
  // WHOLE current draft and is authoritative on judge-authored findings)
  // doesn't wipe out any PM-authored findings that might exist -- PM
  // questions no longer create these directly (they're compiled into the
  // PM's own feedback message instead, alongside comments), but this stays
  // as a safe no-op preservation for anything already in that shape.
  existingVerificationFindings?: VerificationFinding[],
  // Set only by the explicit Finalize action -- the PM has already decided
  // to complete the PRD, so this turn skips the judge pass entirely (no
  // fresh findings, no stale-marker bookkeeping) rather than spending
  // another 10-25 minutes verifying on the way out the door.
  skipVerify?: boolean
): Promise<ChatTurnResult> {
  const canonicalHistory: CanonicalMessage[] = toCanonicalHistory(history);
  const state: TurnState = { phaseState: currentPhaseState };
  const lastUserMessage = [...history].reverse().find((m) => m.role === "user")?.content;
  const ctx = { userId, conversationId, previousSkeleton, existingSkeletonHistory, lastUserMessage };

  let finalText = "";
  // Keyed by `${provider}:${model}` -- a turn can span more than one
  // provider/model if a phase transition mid-turn (via update_phase_progress)
  // moves to a phase configured differently. Each provider adapter is called
  // fresh every round with the full canonical history, so switching providers
  // mid-turn just works -- neither adapter carries state across rounds.
  const usageByModel = new Map<string, ModelUsageBreakdown>();

  // Computed at most once per turn, on first use -- the dump is a handful of
  // synchronous grep subprocess calls against unchanging repo state, so
  // recomputing it on every one of up to MAX_TOOL_ROUNDS rounds (as an
  // earlier version of this did) would spawn the same processes dozens of
  // times over for an identical result.
  let riskyDump: string | null = null;
  function getRiskyDump(): string {
    if (riskyDump === null) riskyDump = riskySymbolPreamble();
    return riskyDump;
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Re-derived every round: if update_phase_progress fires mid-loop, the
    // very next round already uses the new phase's configured provider/model.
    const setting = modelSettings[state.phaseState.current];
    const adapter = adapterFor(setting.provider);
    const inFullPrd = state.phaseState.current === "full_prd";
    const result = await adapter.callOnce({
      model: setting.model,
      effort: setting.effort,
      systemPrompt:
        buildSystemPrompt({ freshRevisionNote: isFreshRevision }) + (inFullPrd ? getRiskyDump() : ""),
      history: canonicalHistory,
      tools: TOOL_DEFS,
    });

    addUsage(usageByModel, setting.provider, setting.model, result.usage);
    finalText = result.text;

    if (result.toolCalls.length === 0) {
      break;
    }

    canonicalHistory.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls });

    const toolResults = [];
    for (const call of result.toolCalls) {
      const content = call.parseError
        ? `ERROR: your arguments for ${call.name} failed to parse (${call.parseError}) -- this usually means the content was too large and got cut off mid-JSON. Nothing was saved. Retry this call, and if the content is very long, keep it more concise or split the work into smaller calls.`
        : await executeTool(call.name, call.input, state, ctx);
      toolResults.push({ toolCallId: call.id, content });
    }
    canonicalHistory.push({ role: "tool", toolResults });
  }

  // The loop can exhaust its round budget mid-verification (e.g. several
  // sequential live repo reads) with no natural text-only turn -- finalText
  // would otherwise be blank because the last round was pure tool calls.
  // Force one more turn with no tools so the PM always gets a real reply.
  //
  // A blank reply can also happen with rounds to spare: on a very long,
  // very deep turn (a Phase 8 expansion with dozens of prior tool rounds
  // ballooning the resent history into the millions of tokens) a model can
  // occasionally return zero text AND zero tool calls -- no error, no
  // truncation note, just a genuinely empty completion. That hits the
  // `toolCalls.length === 0` break above on its own with the round budget
  // untouched, and the PM was previously left staring at a blank bubble with
  // no error and no next step. Trigger the same forced-reply turn for any
  // blank finalText, not just when the round budget actually ran out.
  if (!finalText.trim()) {
    const setting = modelSettings[state.phaseState.current];
    const adapter = adapterFor(setting.provider);
    const wrapupSystem =
      buildSystemPrompt({ freshRevisionNote: isFreshRevision }) +
      "\n\n---\n\nYour last response this turn came back with no reply text for the PM to read -- whether because you're out of room for more tool calls, or the response just came back empty. Stop calling tools. In 2-4 sentences, summarize what you've verified so far and either ask the specific clarifying question you were building toward, or state your concrete next step -- don't leave the PM with no reply.";
    const result = await adapter.callOnce({
      model: setting.model,
      effort: setting.effort,
      systemPrompt: wrapupSystem,
      history: canonicalHistory,
      tools: null,
    });
    finalText = result.text;
    addUsage(usageByModel, setting.provider, setting.model, result.usage);
  }

  // Auto-save: while still mid-Phase-8 (PM hasn't approved/finalized yet),
  // the model just writes the PRD as chat text -- finalText genuinely IS the
  // PRD in that case, so the app saves it itself rather than waiting for an
  // explicit save_prd_markdown call. Once a Phase 9 finalize turn happens in
  // the SAME conversation (the model calls save_prd_markdown itself,
  // sometimes in the very same turn as a revision -- see the "inline
  // PRD-revision feedback" rule, which re-runs full Output right after
  // revising), state.savedPrd is already set by the time we get here, so
  // this is skipped -- finalText at that point is just a status summary, not
  // the PRD, and saving it would silently corrupt the file with a chat reply.
  if (!state.savedPrd && state.phaseState.current === "full_prd" && looksLikeFullDraft(finalText)) {
    const path = savePrdMarkdown(conversationId, finalText);
    state.savedPrd = { path };
  }

  // Auto-verify: runs off state.savedPrd, not off finalText or the current
  // phase -- state.savedPrd only ever becomes truthy as a direct result of
  // THIS turn (either the eager save above, or the model's own
  // save_prd_markdown call during Phase 9), so it's a reliable "PRD content
  // just changed" signal regardless of which phase the turn ends in. This
  // matters specifically because a revise-then-finalize turn ends in
  // "output" with a status-summary finalText -- gating on the final phase or
  // on looksLikeFullDraft(finalText) would silently skip verification on
  // exactly the turn that most needs it, leaving stale findings anchored to
  // prose that a rewrite may have already removed. Reads the file back
  // rather than trusting finalText, since finalText isn't reliably "the PRD"
  // in the Phase 9 case.
  let verificationFindings: VerificationFinding[] | undefined;
  if (state.savedPrd && !skipVerify) {
    const prdText = readPrdMarkdown(state.savedPrd.path);
    const verifyResult = await runVerificationPass(prdText, modelSettings);
    // An incomplete pass (round budget exhausted, or the model stopped
    // without ever calling report_verification_findings) is NOT the same as
    // "checked thoroughly, found nothing" -- surface that honestly as a
    // finding of its own rather than silently showing a clean panel, so the
    // PM knows to hit Re-verify rather than trusting a false all-clear.
    const freshJudgeFindings = verifyResult.completed
      ? anchorFindings(prdText, verifyResult.findings)
      : buildIncompleteVerificationFinding();
    // A fresh sweep re-derives every judge-authored finding from scratch and
    // is authoritative on those -- any PM-authored ones (a legacy shape;
    // "ask judge" questions are compiled into the PM's feedback message
    // instead of creating these directly now) aren't something this
    // redraft's sweep re-evaluated, so they're carried forward untouched
    // rather than silently dropped.
    const preservedPmFindings = (existingVerificationFindings ?? []).filter((f) => f.author === "pm");
    verificationFindings = [...freshJudgeFindings, ...preservedPmFindings];

    for (const entry of verifyResult.usageByModel.values()) {
      addUsage(usageByModel, entry.provider, entry.model, {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cost: entry.cost,
      });
    }
    if (!state.phaseState.completed.includes("full_prd_verify")) {
      state.phaseState = {
        ...state.phaseState,
        completed: [...state.phaseState.completed, "full_prd_verify"],
      };
    }
  } else if (
    !skipVerify &&
    state.phaseState.current === "full_prd" &&
    state.phaseState.completed.includes("full_prd_verify")
  ) {
    // This turn changed what's on screen (a revision, a clarifying
    // exchange) without re-running the check -- an earlier "verified"
    // mark no longer describes the CURRENT draft, so drop it rather than
    // let the PM see a stale checkmark next to content that was never
    // actually re-checked. It reappears once the next full-draft turn (or
    // a manual Re-verify) runs.
    state.phaseState = {
      ...state.phaseState,
      completed: state.phaseState.completed.filter((p) => p !== "full_prd_verify"),
    };
  }

  return {
    reply: finalText,
    phaseState: state.phaseState,
    title: state.title,
    verticals: state.verticals,
    skeletonSections: state.skeletonSections,
    skeletonHistory: state.skeletonHistory,
    savedPrd: state.savedPrd,
    googleDocUrl: state.googleDocUrl,
    verificationFindings,
    usage: usageFromMap(usageByModel),
  };
}

export { INITIAL_PHASE_STATE };
