import {
  readReferenceFile,
  listReferenceDir,
  readRepoFile,
  listRepoFiles,
  searchRepo,
  savePrdMarkdown,
  writeSkillFile,
} from "./knowledgeBase";
import { createGoogleDoc } from "./googleDocs";
import { renderArchifyDiagram, ArchifyDiagramType } from "./archify";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root } from "mdast";
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

const ARCHIFY_TYPES = ["architecture", "workflow", "sequence", "dataflow", "lifecycle"] as const;
let archifyDiagramCounter = 0;
function nextArchifyDiagramId(conversationId: string): string {
  archifyDiagramCounter += 1;
  return `${conversationId}_${Date.now()}_${archifyDiagramCounter}`;
}

// Mechanical backstop for the "diagrams are Archify, not Mermaid" rule
// (SKILL.md / systemPrompt.ts) -- a live audit of already-saved PRDs found
// the drafting model doesn't reliably follow that instruction on its own
// (Mermaid is far more deeply trained-in as "how you draw a flowchart" than
// a brand-new in-context JSON schema is), so a stray ```mermaid fence would
// otherwise silently reach the saved PRD and, since the automatic
// create_google_doc path has no browser to render it, show up as raw text
// instead of an image in the Doc -- the exact bug this whole feature exists
// to prevent. Rejecting the save/export outright, with a specific fix
// instruction, forces the correction inside the SAME tool-loop turn instead
// of relying on the model remembering the rule unprompted every time.
//
// Detection parses the Markdown rather than pattern-matching it: a regex
// misses real fences written with tildes, uppercase, or indentation, and
// false-alarms on prose that merely mentions the syntax. A fence anywhere in
// the tree counts, including nested inside lists and blockquotes.
function hasMermaidFence(content: string): boolean {
  const tree = unified().use(remarkParse).parse(content) as Root;
  const stack: unknown[] = [...tree.children];
  while (stack.length > 0) {
    const node = stack.pop() as { type: string; lang?: string | null; children?: unknown[] };
    if (node.type === "code" && /^mermaid$/i.test(node.lang ?? "")) return true;
    if (node.children) stack.push(...node.children);
  }
  return false;
}

function rejectStrayMermaidFences(content: string): string | null {
  if (!hasMermaidFence(content)) return null;
  return (
    "ERROR: this content still has one or more ```mermaid code fences. Mermaid diagrams are no longer " +
    "supported for PRDs written by this tool -- they can't be embedded as real images in the Google Doc " +
    "export. Replace EVERY ```mermaid fence with a render_archify_diagram call (per " +
    "references/style/archify-diagrams.md), paste the exact fence it returns in its place, then retry this " +
    "call with the corrected content. Do not save/export until no ```mermaid fences remain."
  );
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
    case "render_archify_diagram": {
      const type = String(input.type ?? "");
      const title = String(input.title ?? "Diagram");
      const ir = input.ir;
      if (!(ARCHIFY_TYPES as readonly string[]).includes(type)) {
        return `ERROR: unknown diagram type "${type}". Must be one of ${ARCHIFY_TYPES.join(", ")}.`;
      }
      if (typeof ir !== "object" || ir === null || Array.isArray(ir)) {
        return `ERROR: "ir" must be a JSON object (the full Archify document), not a string or array.`;
      }
      const diagramId = nextArchifyDiagramId(ctx.conversationId);
      const result = await renderArchifyDiagram(type as ArchifyDiagramType, ir as Record<string, unknown>, diagramId);
      if (!result.ok) {
        const diagnosticsText = result.diagnostics ? `\nDiagnostics:\n${JSON.stringify(result.diagnostics, null, 2)}` : "";
        return `ERROR rendering diagram: ${result.error}${diagnosticsText}\nFix the IR per these diagnostics and call render_archify_diagram again with the corrected IR -- do not guess blindly at what's wrong.`;
      }
      const fence = "```archify\n" + JSON.stringify({ id: diagramId, title }) + "\n```";
      return `Rendered successfully. Paste this EXACT block into the PRD content at this point (do not modify it, do not describe the diagram as Mermaid):\n\n${fence}`;
    }
    case "apply_skill_change": {
      const filePath = String(input.path ?? "");
      const content = String(input.content ?? "");
      const summary = String(input.summary ?? "");
      const result = writeSkillFile(filePath, content);
      return result.startsWith("ERROR") ? result : `${result} -- ${summary}`;
    }
    case "save_prd_markdown": {
      const content = String(input.content ?? "");
      const rejection = rejectStrayMermaidFences(content);
      if (rejection) return rejection;
      const path = savePrdMarkdown(ctx.conversationId, content);
      state.savedPrd = { path };
      return `Saved to ${path}`;
    }
    case "create_google_doc": {
      const docTitle = String(input.title ?? state.title ?? "Untitled PRD");
      const content = String(input.content ?? "");
      const rejection = rejectStrayMermaidFences(content);
      if (rejection) return rejection;
      try {
        const doc = await createGoogleDoc(ctx.userId, docTitle, content);
        state.googleDocUrl = doc.url;
        const notes: string[] = [];
        if (doc.hadTables) {
          notes.push("tables were rendered as monospace text blocks, not native Docs tables");
        }
        if (doc.usedFallback) {
          notes.push(
            `the higher-fidelity import failed (${doc.fallbackReason ?? "unknown reason"}), so this Doc came from the fallback path -- diagrams appear as text stand-ins and tables as monospace text; tell the PM plainly that this Doc is the degraded version and they can retry the export from the PRD viewer`
          );
        }
        if (doc.hadUnrenderedMermaid) {
          notes.push(
            "one or more diagrams couldn't be embedded as real images in this Doc (their rendered image was missing, or a diagram failed to render) -- they were written as a plain text stand-in instead; tell the PM which section so they can re-run that diagram"
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
