import { Phase, Provider } from "./types";

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
];

export function isKnownProvider(value: string): value is Provider {
  return PROVIDERS.some((p) => p.id === value);
}

// Client-safe: no Prisma/DB imports here, so client components (the
// Settings page UI) can import this directly. See modelSettings.ts for the
// DB-backed read/write functions -- server-only, kept in a separate file
// after this exact bug (a client component transitively importing Prisma ->
// better-sqlite3 -> Node's `fs`, which broke `next dev` on /settings).

// claude-haiku-4-5 intentionally excluded from effort-capable models: the API
// rejects the effort parameter entirely for it. It's still selectable as a
// MODEL choice (see AVAILABLE_MODELS) -- the UI just disables the effort
// dropdown when it's picked, and the backend never sends output_config.effort
// for it. Model IDs and effort semantics per the claude-api skill (real,
// GA, no beta header) -- do not add "tiers" beyond what's listed here.
export type ClaudeModel =
  | "claude-opus-5"
  | "claude-sonnet-5"
  | "claude-fable-5"
  | "claude-haiku-4-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export const AVAILABLE_MODELS: {
  id: ClaudeModel;
  label: string;
  supportsEffort: boolean;
  note: string;
}[] = [
  {
    id: "claude-opus-5",
    label: "Opus 5",
    supportsEffort: true,
    note: "Most capable of the everyday tiers -- best for research/context-loading and full-PRD generation.",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    supportsEffort: true,
    note: "Balanced cost/quality -- good default for conversational phases.",
  },
  {
    id: "claude-fable-5",
    label: "Fable 5",
    supportsEffort: true,
    note: "Anthropic's most capable model overall. Higher cost -- reserve for the hardest phases.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    supportsEffort: false,
    note: "Fastest/cheapest. No effort tiers -- fixed reasoning depth.",
  },
];

// `model` is a ClaudeModel string when provider is "anthropic"; an arbitrary
// OpenRouter model slug (e.g. "openai/gpt-6-astra") otherwise -- OpenRouter's
// catalog is dynamic (hundreds of models, searched live), so it can't be a
// fixed union the way ClaudeModel is. `effort` only applies to Anthropic
// today; OpenRouter phases just omit it.
export interface PhaseModelSetting {
  provider: Provider;
  model: string;
  effort?: Effort;
}

// Sensible starting point matching "lighter phases get lighter models,
// research/full-PRD get the heaviest" -- fully overridable per-user in Settings.
export const DEFAULT_MODEL_SETTINGS: Record<Phase, PhaseModelSetting> = {
  objective: { provider: "anthropic", model: "claude-sonnet-5", effort: "medium" },
  problem_statement: { provider: "anthropic", model: "claude-sonnet-5", effort: "medium" },
  sizing: { provider: "anthropic", model: "claude-sonnet-5", effort: "medium" },
  scope: { provider: "anthropic", model: "claude-sonnet-5", effort: "high" },
  context_loading: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  skeleton_draft: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  skeleton_revision: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  full_prd: { provider: "anthropic", model: "claude-opus-5", effort: "xhigh" },
  full_prd_verify: { provider: "anthropic", model: "claude-opus-5", effort: "high" },
  output: { provider: "anthropic", model: "claude-sonnet-5", effort: "medium" },
};

export function isKnownModel(value: string): value is ClaudeModel {
  return AVAILABLE_MODELS.some((m) => m.id === value);
}

export function isKnownEffort(value: string): value is Effort {
  return (EFFORT_LEVELS as string[]).includes(value);
}

export function modelSupportsEffort(model: string): boolean {
  return AVAILABLE_MODELS.find((m) => m.id === model)?.supportsEffort ?? false;
}
