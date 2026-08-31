import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";
import {
  readReferenceFile,
  listReferenceDir,
  readRepoFile,
  listRepoFiles,
  savePrdMarkdown,
  KNOWN_REPOS,
} from "./knowledgeBase";
import { createGoogleDoc } from "./googleDocs";
import {
  ChatMessage,
  PhaseState,
  INITIAL_PHASE_STATE,
  PHASES,
  Phase,
  Attachment,
  SkeletonSection,
} from "./types";
import { AVAILABLE_MODELS, PhaseModelSetting } from "./modelSettings";

const MAX_TOOL_ROUNDS = 12;

function modelSupportsEffort(model: string): boolean {
  return AVAILABLE_MODELS.find((m) => m.id === model)?.supportsEffort ?? false;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_DECODABLE_PREFIXES = ["text/", "application/json"];

function isImage(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

function isTextDecodable(mediaType: string): boolean {
  return TEXT_DECODABLE_PREFIXES.some((p) => mediaType.startsWith(p));
}

// Attached API docs / flow descriptions (phase 5) become real content blocks
// -- PDFs and images go in as Anthropic document/image blocks (so the model
// actually reads diagrams/screenshots, not just a filename), plain-text
// files get decoded and inlined into the text block. Order follows
// Anthropic's own guidance: documents/images before the text describing them.
function buildMessageContent(message: ChatMessage): string | Anthropic.ContentBlockParam[] {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return message.content;
  }

  const blocks: Anthropic.ContentBlockParam[] = [];
  let inlineText = "";

  for (const att of attachments) {
    if (att.mediaType === "application/pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: att.base64 },
      });
    } else if (isImage(att.mediaType)) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: att.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: att.base64,
        },
      });
    } else if (isTextDecodable(att.mediaType)) {
      try {
        const text = Buffer.from(att.base64, "base64").toString("utf-8");
        inlineText += `\n\n--- Attached file: ${att.name} ---\n${text}\n--- end ${att.name} ---`;
      } catch {
        inlineText += `\n\n[Could not decode attached file: ${att.name}]`;
      }
    } else {
      inlineText += `\n\n[Attached file "${att.name}" (${att.mediaType}) -- unsupported type, not included]`;
    }
  }

  blocks.push({ type: "text", text: message.content + inlineText });
  return blocks;
}

const tools: Anthropic.Tool[] = [
  {
    name: "read_reference_file",
    description:
      "Read a file under the prd-builder skill's references/ directory, e.g. 'system-map/README.md' or 'verticals/toll.md' or 'system-map/flows/fastag-onboarding-and-activation.md'.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to references/, e.g. 'verticals/tzf.md'" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_reference_dir",
    description: "List files in a references/ subdirectory, e.g. 'verticals' or 'system-map/flows'.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to references/" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_repo_file",
    description: `Read a file from a live local clone of one of Blackbuck's repos, to re-verify exact current behavior before citing it. Known repos: ${KNOWN_REPOS.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "One of the known repo names" },
        path: { type: "string", description: "File path relative to the repo root" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "list_repo_files",
    description: "List files/directories inside a repo at a given path, to find the right file before reading it.",
    input_schema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "One of the known repo names" },
        path: { type: "string", description: "Directory path relative to the repo root, '' for root" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "update_phase_progress",
    description:
      "Report the current PRD-writing phase and which phases are fully complete, so the UI progress sidebar stays accurate. Call this silently every time the phase changes, including entering phase 1.",
    input_schema: {
      type: "object",
      properties: {
        current_phase: { type: "string", enum: [...PHASES] },
        completed_phases: {
          type: "array",
          items: { type: "string", enum: [...PHASES] },
        },
      },
      required: ["current_phase", "completed_phases"],
    },
  },
  {
    name: "set_title",
    description:
      "Set a short human-readable title for this PRD, as soon as the objective (phase 1) is clear enough to name it -- e.g. 'FASTag Hotlist Replacement Bypass'. Call again later if the scope changes enough that the title no longer fits. Used for the drafts/completed-PRDs dashboard, not shown to the PM as a chat message.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short human-readable title, not kebab-case" },
      },
      required: ["title"],
    },
  },
  {
    name: "save_prd_markdown",
    description:
      "Save the finished PRD as a Markdown file, once the full PRD (phase 8) is confirmed ready and you've reached phase 9's output step. Always call this AND create_google_doc at phase 9 -- they're the two required outputs, not alternatives.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full PRD content in Markdown" },
      },
      required: ["content"],
    },
  },
  {
    name: "create_google_doc",
    description:
      "Create a Google Doc with the finished PRD content, at phase 9's output step. Always call this AND save_prd_markdown -- they're the two required outputs, not alternatives. If this fails (e.g. the PM hasn't granted Docs access), tell the PM plainly and still keep the Markdown output -- don't treat a Doc failure as blocking.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Google Doc title, human-readable" },
        content: { type: "string", description: "Full PRD content in Markdown -- converted to Doc formatting" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "set_verticals",
    description:
      "Record the confirmed vertical scope from phase 4, once the PM has confirmed it (after the system-map reverification step). Used for search/filtering on the drafts and completed-PRDs dashboard. Call again if scope changes later.",
    input_schema: {
      type: "object",
      properties: {
        verticals: {
          type: "array",
          items: {
            type: "string",
            enum: [
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
            ],
          },
        },
      },
      required: ["verticals"],
    },
  },
  {
    name: "save_skeleton",
    description:
      "Save the current skeleton as structured sections/pointers, at phase 6 (initial draft) and again after every phase 7 revision. This drives the PM's skeleton editor UI -- always call this instead of (or in addition to) describing the skeleton in chat text, so the PM can comment on/delete/add individual pointers directly rather than only replying in prose. Send the FULL current skeleton every time, not a diff.",
    input_schema: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Section heading, e.g. 'Objective', 'Product Features & Workflow'" },
              pointers: {
                type: "array",
                items: { type: "string" },
                description: "Short bullet-point lines under this heading -- the 1-3 sentence skeleton content, or sub-points once expanded",
              },
            },
            required: ["heading", "pointers"],
          },
        },
      },
      required: ["sections"],
    },
  },
];

function isKnownPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

export interface ChatTurnResult {
  reply: string;
  phaseState: PhaseState;
  title?: string;
  verticals?: string[];
  skeletonSections?: SkeletonSection[];
  savedPrd?: { path: string };
  googleDocUrl?: string;
}

let skeletonIdCounter = 0;
function nextSkeletonId(): string {
  skeletonIdCounter += 1;
  return `p${Date.now()}_${skeletonIdCounter}`;
}

export async function runChatTurn(
  history: ChatMessage[],
  currentPhaseState: PhaseState,
  modelSettings: Record<Phase, PhaseModelSetting>,
  userId: string,
  conversationId: string
): Promise<ChatTurnResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before starting a conversation."
    );
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: buildMessageContent(m),
  }));

  let phaseState: PhaseState = currentPhaseState;
  let title: string | undefined;
  let verticals: string[] | undefined;
  let skeletonSections: SkeletonSection[] | undefined;
  let savedPrd: { path: string } | undefined;
  let googleDocUrl: string | undefined;
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Re-derived every round: if update_phase_progress fires mid-loop, the
    // very next round already uses the new phase's configured model/effort.
    const { model, effort } = modelSettings[phaseState.current];
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools,
      messages,
      ...(modelSupportsEffort(model) ? { output_config: { effort } } : {}),
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    finalText = textBlocks.map((b) => b.text).join("\n\n");

    if (toolUseBlocks.length === 0) {
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const input = block.input as Record<string, unknown>;
      let result: string;
      switch (block.name) {
        case "read_reference_file":
          result = readReferenceFile(String(input.path ?? ""));
          break;
        case "list_reference_dir":
          result = listReferenceDir(String(input.path ?? "")).join("\n") || "(empty)";
          break;
        case "read_repo_file":
          result = readRepoFile(String(input.repo ?? ""), String(input.path ?? ""));
          break;
        case "list_repo_files":
          result = listRepoFiles(String(input.repo ?? ""), String(input.path ?? ""));
          break;
        case "update_phase_progress": {
          const current = String(input.current_phase ?? "");
          const completed = Array.isArray(input.completed_phases)
            ? input.completed_phases.filter((p): p is string => typeof p === "string")
            : [];
          if (isKnownPhase(current)) {
            phaseState = {
              current,
              completed: completed.filter(isKnownPhase),
            };
          }
          result = "ok";
          break;
        }
        case "set_title": {
          title = String(input.title ?? "").slice(0, 200) || undefined;
          result = "ok";
          break;
        }
        case "set_verticals": {
          verticals = Array.isArray(input.verticals)
            ? input.verticals.filter((v): v is string => typeof v === "string")
            : undefined;
          result = "ok";
          break;
        }
        case "save_skeleton": {
          const rawSections = Array.isArray(input.sections) ? input.sections : [];
          skeletonSections = rawSections
            .filter(
              (s): s is { heading: unknown; pointers: unknown } =>
                typeof s === "object" && s !== null
            )
            .map((s) => ({
              heading: String((s as { heading?: unknown }).heading ?? "Untitled section"),
              pointers: (Array.isArray((s as { pointers?: unknown }).pointers)
                ? (s as { pointers: unknown[] }).pointers
                : []
              )
                .filter((p): p is string => typeof p === "string")
                .map((text) => ({ id: nextSkeletonId(), text })),
            }));
          result = "ok";
          break;
        }
        case "save_prd_markdown": {
          const content = String(input.content ?? "");
          const path = savePrdMarkdown(conversationId, content);
          savedPrd = { path };
          result = `Saved to ${path}`;
          break;
        }
        case "create_google_doc": {
          const docTitle = String(input.title ?? title ?? "Untitled PRD");
          const content = String(input.content ?? "");
          try {
            const doc = await createGoogleDoc(userId, docTitle, content);
            googleDocUrl = doc.url;
            const notes: string[] = [];
            if (doc.hadTables) {
              notes.push(
                "tables were rendered as monospace text blocks, not native Docs tables"
              );
            }
            if (doc.hadMermaid) {
              notes.push(
                "Mermaid diagrams were inserted as raw source text (Docs can't render Mermaid) -- the Markdown copy has the real diagram"
              );
            }
            result = `Created: ${doc.url}${notes.length ? " (note: " + notes.join("; ") + ")" : ""}`;
          } catch (err) {
            result = `ERROR creating Google Doc: ${err instanceof Error ? err.message : "unknown error"}. Tell the PM this failed but the Markdown copy still stands.`;
          }
          break;
        }
        default:
          result = `ERROR: unknown tool ${block.name}`;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { reply: finalText, phaseState, title, verticals, skeletonSections, savedPrd, googleDocUrl };
}

export { INITIAL_PHASE_STATE };
