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
import {
  ChatMessage,
  PhaseState,
  INITIAL_PHASE_STATE,
  PHASES,
  Phase,
} from "./types";
import { AVAILABLE_MODELS, PhaseModelSetting } from "./modelSettings";

const MAX_TOOL_ROUNDS = 12;

function modelSupportsEffort(model: string): boolean {
  return AVAILABLE_MODELS.find((m) => m.id === model)?.supportsEffort ?? false;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    name: "save_prd_markdown",
    description:
      "Save the finished PRD as a Markdown file, once the full PRD (phase 8) is confirmed ready and you've reached phase 9's output step. There is no Google Doc integration yet -- this is the only output mechanism.",
    input_schema: {
      type: "object",
      properties: {
        kebab_title: { type: "string", description: "Kebab-case filename-safe title, e.g. 'fastag-hotlist-bypass'" },
        content: { type: "string", description: "Full PRD content in Markdown" },
      },
      required: ["kebab_title", "content"],
    },
  },
];

function isKnownPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}

export interface ChatTurnResult {
  reply: string;
  phaseState: PhaseState;
  savedPrd?: { title: string; path: string };
}

export async function runChatTurn(
  history: ChatMessage[],
  currentPhaseState: PhaseState,
  modelSettings: Record<Phase, PhaseModelSetting>
): Promise<ChatTurnResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before starting a conversation."
    );
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let phaseState: PhaseState = currentPhaseState;
  let savedPrd: { title: string; path: string } | undefined;
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
        case "save_prd_markdown": {
          const title = String(input.kebab_title ?? "untitled-prd");
          const content = String(input.content ?? "");
          const path = savePrdMarkdown(title, content);
          savedPrd = { title, path };
          result = `Saved to ${path}`;
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

  return { reply: finalText, phaseState, savedPrd };
}

export { INITIAL_PHASE_STATE };
