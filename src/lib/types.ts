export type Role = "user" | "assistant";

export interface Attachment {
  name: string;
  mediaType: string; // e.g. "application/pdf", "image/png", "text/plain"
  base64: string; // raw file bytes, base64-encoded, no data-URL prefix
}

export type Provider = "anthropic" | "openrouter";

export interface ModelUsageBreakdown {
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  // OpenRouter returns real per-response cost directly (usage.cost) -- when
  // present, use it as-is instead of computing from src/lib/pricing.ts's
  // static table, which only covers Anthropic's fixed model list and can't
  // realistically cover OpenRouter's hundreds of models and their own
  // provider-side pricing changes.
  cost?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  // Per-model breakdown for this turn -- a turn can span more than one model
  // if a phase transition mid-turn moves to a phase configured with a
  // different model. Cost must be computed per entry, never off the totals
  // above blended against a single price.
  byModel: ModelUsageBreakdown[];
}

export interface ChatMessage {
  role: Role;
  content: string;
  attachments?: Attachment[];
  at?: string; // ISO timestamp -- sent time for user messages, received time for assistant
  usage?: TokenUsage; // assistant messages only -- total across all tool-call rounds this turn
}

export interface SkeletonPointer {
  id: string;
  text: string;
}

export interface SkeletonSection {
  heading: string;
  pointers: SkeletonPointer[];
}

// One entry per skeleton revision -- captured automatically whenever
// save_skeleton overwrites a non-empty skeleton. `skeleton` is the FULL
// snapshot as it stood right before this round's feedback was applied, and
// `feedback` is the exact compiled message that prompted the revision (each
// line already names the heading and quotes the exact pointer text it was
// about, from SkeletonEditor's compileFeedback()). Pointer ids are NOT
// stable across rounds (a fresh id is minted every save_skeleton call), so
// this is keyed by round/heading, not by pointer identity -- see
// SkeletonEditor's history UI for how "still unaddressed" is derived (exact
// text match against a past round's quoted pointer, not a guess).
export interface SkeletonHistoryEntry {
  round: number;
  at: string;
  skeleton: SkeletonSection[];
  feedback: string;
}

export const PHASES = [
  "objective",
  "problem_statement",
  "sizing",
  "scope",
  "context_loading",
  "skeleton_draft",
  "skeleton_revision",
  "full_prd",
  "full_prd_verify",
  "output",
] as const;

export type Phase = (typeof PHASES)[number];

// Phases the drafting model is actually allowed to report itself via
// update_phase_progress. full_prd_verify is deliberately excluded -- it's
// marked complete by the app (see runChatTurn's auto-verify block in
// claude.ts), never by the model. If it were offered in that tool's enum,
// the model could plausibly call it (it sits right after "full_prd", a
// natural-looking next step) and set phaseState.current to it, which would
// make the auto-verify gate's `=== "full_prd"` check silently stop matching
// and skip verification with no visible sign anything was skipped.
export const MODEL_FACING_PHASES = PHASES.filter((p) => p !== "full_prd_verify");

export const PHASE_LABELS: Record<Phase, string> = {
  objective: "Objective",
  problem_statement: "Problem Statement",
  sizing: "Sizing",
  scope: "Scope",
  context_loading: "Context Loading",
  skeleton_draft: "Skeleton Draft",
  skeleton_revision: "Skeleton Revision",
  full_prd: "Full PRD",
  full_prd_verify: "Verification",
  output: "Output",
};

// A reply inside one verification thread -- either the PM weighing in
// ("actually this is fine because...", "yes please fix, also check X") or
// the judge answering a follow-up. Mirrors PrdCommentLayer's own Reply shape
// deliberately, since these threads render through the same anchor/popup
// machinery as a PM's own PRD comments.
export interface VerificationReply {
  id: string;
  author: "pm" | "judge";
  text: string;
  at: string;
}

// One verification thread, anchored to an exact spot in the PRD the same way
// a PM's own comment is -- either opened by the judge (a flagged mismatch
// from re-deriving the PRD's risky sections against the live repos) or by
// the PM (pointing the judge at a passage it didn't flag, asking it to look).
// `category` is a free label ("contradiction", "omission", "incomplete",
// "question", ...) rather than a fixed enum -- PRDs are heterogeneous enough
// across verticals that a closed enum of finding shapes would either miss
// real shapes or grow without bound; the fields that matter (where, what,
// why, proof) stay fixed regardless of what kind of mismatch it turns out to
// be.
export interface VerificationFinding {
  id: string;
  author: "judge" | "pm";
  section: string; // e.g. "§7.8 Dues Clearance"
  category: string; // free label: "contradiction" | "omission" | "question" | ...
  summary: string; // one-sentence statement of the mismatch, or the PM's question
  whyItMatters: string; // concrete consequence if left as-is -- "" for a bare PM question
  citation: string; // repo/file:line the judge actually checked -- "" until answered
  // Exact verbatim PRD substring this concerns, and which occurrence of it
  // (0-indexed) -- same anchoring scheme as PrdCommentLayer's own comments,
  // so both render through the same TreeWalker marking pass. "" means
  // unanchored (the judge couldn't quote an exact match, or this is a
  // general finding not tied to one passage) -- rendered in the general
  // findings list rather than marked in the document.
  prdQuote: string;
  occurrence: number;
  status: "open" | "resolved" | "dismissed";
  replies: VerificationReply[];
  at: string;
}

// Exactly what report_verification_findings captures from the tool call --
// id/author/occurrence/status/replies/at aren't known yet at that point (the
// app assigns those once it anchors the quote against the real PRD text, see
// anchorFindings in claude.ts), so this is deliberately a narrower shape than
// VerificationFinding, not the same interface reused loosely.
export interface RawVerificationFinding {
  section: string;
  category: string;
  summary: string;
  whyItMatters: string;
  citation: string;
  prdQuote: string;
}

export interface PhaseState {
  current: Phase;
  completed: Phase[];
}

export const INITIAL_PHASE_STATE: PhaseState = {
  current: "objective",
  completed: [],
};

// Matches SKILL.md's Phase 4 vertical list and filename mapping table exactly.
export const VERTICALS = [
  "Sales",
  "Toll",
  "Fuel",
  "TZF",
  "Payments",
  "GPS",
  "Supply",
  "Load Board",
  "Finserve",
  "Frontend",
  "Android",
  "BB Pro",
] as const;

export type Vertical = (typeof VERTICALS)[number];

// Matches SKILL.md's "Vertical filename mapping" table exactly.
export const VERTICAL_FILENAMES: Record<Vertical, string> = {
  Sales: "sales.md",
  Toll: "toll.md",
  Fuel: "fuel.md",
  TZF: "tzf.md",
  Payments: "payments.md",
  GPS: "gps.md",
  Supply: "supply.md",
  "Load Board": "load-board.md",
  Finserve: "finserve.md",
  Frontend: "frontend.md",
  Android: "android.md",
  "BB Pro": "bb-pro.md",
};

export interface PhaseLogEntry {
  phase: Phase;
  at: string; // ISO timestamp
}

export interface ChatTurnRequest {
  conversationId: string;
  message: string;
  attachments?: Attachment[];
  at?: string; // ISO timestamp of when the PM sent this message, set client-side
  // Set only by the explicit Finalize action -- the PM has already decided
  // to complete the PRD (past any open findings, if they chose to), so this
  // turn should just do that: no fresh judge pass, no more back-and-forth.
  skipVerify?: boolean;
}

export interface ChatTurnResponse {
  reply: string;
  phaseState: PhaseState;
  title?: string;
  skeletonSections?: SkeletonSection[];
  skeletonHistory?: SkeletonHistoryEntry[];
  savedPrd?: { path: string };
  googleDocUrl?: string;
  verificationFindings?: VerificationFinding[];
  userAt: string;
  assistantAt: string;
  usage: TokenUsage;
}
