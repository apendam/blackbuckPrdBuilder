import {
  readReferenceFile,
  listReferenceDir,
  readRepoFile,
  listRepoFiles,
  searchRepo,
  savePrdMarkdown,
} from "./knowledgeBase";
import { createGoogleDoc } from "./googleDocs";
import {
  PhaseState,
  PHASES,
  Phase,
  SkeletonSection,
  SkeletonHistoryEntry,
  RawVerificationFinding,
} from "./types";

function isKnownPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

let skeletonIdCounter = 0;
function nextSkeletonId(): string {
  skeletonIdCounter += 1;
  return `p${Date.now()}_${skeletonIdCounter}`;
}

// Mutable per-turn state, shared identically across every provider adapter --
// each tool call mutates this in place so the loop (whichever provider is
// driving it) can read back the final phase/title/skeleton/etc. once the turn
// ends. Keeping this here (not duplicated per adapter) is what guarantees
// tool behavior is identical no matter which model is answering.
export interface TurnState {
  phaseState: PhaseState;
  title?: string;
  verticals?: string[];
  skeletonSections?: SkeletonSection[];
  skeletonHistory?: SkeletonHistoryEntry[];
  savedPrd?: { path: string };
  googleDocUrl?: string;
  verificationFindings?: RawVerificationFinding[];
  // Guards against a pathological turn with multiple save_skeleton calls
  // recording more than one history entry -- only the first call in a turn
  // captures the "before" snapshot, which is what actually stood before this
  // turn started.
  historyRecordedThisTurn?: boolean;
}

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  // Skeleton + history as they stood when this turn started, and the PM
  // message that triggered it -- used by save_skeleton to record what
  // changed and why. Absent/empty on the very first draft, since there's
  // nothing to diff against yet.
  previousSkeleton?: SkeletonSection[];
  existingSkeletonHistory?: SkeletonHistoryEntry[];
  lastUserMessage?: string;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  state: TurnState,
  ctx: ToolExecutionContext
): Promise<string> {
  switch (name) {
    case "read_reference_file":
      return readReferenceFile(String(input.path ?? ""));
    case "list_reference_dir":
      return listReferenceDir(String(input.path ?? "")).join("\n") || "(empty)";
    case "read_repo_file":
      return readRepoFile(String(input.repo ?? ""), String(input.path ?? ""));
    case "list_repo_files":
      return listRepoFiles(String(input.repo ?? ""), String(input.path ?? ""));
    case "search_repo":
      return searchRepo(String(input.repo ?? ""), String(input.pattern ?? ""));
    case "report_verification_findings": {
      const raw = Array.isArray(input.findings) ? input.findings : [];
      state.verificationFindings = raw
        .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
        .map((f) => ({
          section: String(f.section ?? "Unspecified section"),
          category: String(f.category ?? "unspecified"),
          summary: String(f.summary ?? ""),
          whyItMatters: String(f.whyItMatters ?? ""),
          citation: String(f.citation ?? ""),
          prdQuote: String(f.prdQuote ?? ""),
        }));
      return "ok";
    }
    case "update_phase_progress": {
      const current = String(input.current_phase ?? "");
      const completed = Array.isArray(input.completed_phases)
        ? input.completed_phases.filter((p): p is string => typeof p === "string")
        : [];
      if (isKnownPhase(current)) {
        state.phaseState = {
          current,
          completed: completed.filter(isKnownPhase),
        };
      }
      return "ok";
    }
    case "set_title": {
      state.title = String(input.title ?? "").slice(0, 200) || undefined;
      return "ok";
    }
    case "set_verticals": {
      state.verticals = Array.isArray(input.verticals)
        ? input.verticals.filter((v): v is string => typeof v === "string")
        : undefined;
      return "ok";
    }
    case "save_skeleton": {
      if (!state.historyRecordedThisTurn && ctx.previousSkeleton && ctx.previousSkeleton.length > 0) {
        const existing = ctx.existingSkeletonHistory ?? [];
        state.skeletonHistory = [
          ...existing,
          {
            round: existing.length + 1,
            at: new Date().toISOString(),
            skeleton: ctx.previousSkeleton,
            feedback: ctx.lastUserMessage ?? "",
          },
        ];
        state.historyRecordedThisTurn = true;
      }

      const rawSections = Array.isArray(input.sections) ? input.sections : [];
      state.skeletonSections = rawSections
        .filter((s): s is { heading: unknown; pointers: unknown } => typeof s === "object" && s !== null)
        .map((s) => ({
          heading: String((s as { heading?: unknown }).heading ?? "Untitled section"),
          pointers: (Array.isArray((s as { pointers?: unknown }).pointers)
            ? (s as { pointers: unknown[] }).pointers
            : []
          )
            .filter((p): p is string => typeof p === "string")
            .map((text) => ({ id: nextSkeletonId(), text })),
        }));
      return "ok";
    }
    case "save_prd_markdown": {
      const content = String(input.content ?? "");
      const path = savePrdMarkdown(ctx.conversationId, content);
      state.savedPrd = { path };
      return `Saved to ${path}`;
    }
    case "create_google_doc": {
      const docTitle = String(input.title ?? state.title ?? "Untitled PRD");
      const content = String(input.content ?? "");
      try {
        const doc = await createGoogleDoc(ctx.userId, docTitle, content);
        state.googleDocUrl = doc.url;
        const notes: string[] = [];
        if (doc.hadTables) {
          notes.push("tables were rendered as monospace text blocks, not native Docs tables");
        }
        if (doc.hadMermaid) {
          notes.push(
            "Mermaid diagrams were inserted as raw source text (Docs can't render Mermaid) -- the Markdown copy has the real diagram"
          );
        }
        return `Created: ${doc.url}${notes.length ? " (note: " + notes.join("; ") + ")" : ""}`;
      } catch (err) {
        return `ERROR creating Google Doc: ${err instanceof Error ? err.message : "unknown error"}. Tell the PM this failed but the Markdown copy still stands.`;
      }
    }
    default:
      return `ERROR: unknown tool ${name}`;
  }
}
