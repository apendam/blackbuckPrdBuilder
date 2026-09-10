import { Attachment, Provider } from "../types";
import { Effort } from "../modelSettingsShared";
import { ToolDef } from "../tools";

// Provider-agnostic message representation. The tool-call loop in chatEngine.ts
// operates entirely in this shape; each provider adapter's job is only to
// translate this to/from its own wire format on every call. This is what lets
// a single turn cross providers mid-turn (a phase transition via
// update_phase_progress can land on a phase configured with a different
// provider) without either adapter ever seeing the other's format.
export type CanonicalRole = "user" | "assistant" | "tool";

export interface CanonicalToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  // Set when a provider handed back arguments that failed to parse (e.g. an
  // OpenAI-compatible model's tool-call JSON got cut off mid-argument by a
  // token limit). The shared loop must surface this as a visible tool error
  // instead of calling the tool with the resulting empty/garbage `input` --
  // that silently "succeeds" with blank content and tells the model it
  // worked, which is worse than a loud, actionable failure.
  parseError?: string;
}

export interface CanonicalToolResult {
  toolCallId: string;
  content: string;
}

export interface CanonicalMessage {
  role: CanonicalRole;
  text?: string;
  attachments?: Attachment[]; // user messages only
  toolCalls?: CanonicalToolCall[]; // assistant messages only
  toolResults?: CanonicalToolResult[]; // "tool" role messages only
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cost?: number; // set when the provider returns real cost directly (OpenRouter)
}

export interface ProviderCallResult {
  text: string;
  toolCalls: CanonicalToolCall[];
  usage: ProviderUsage;
}

export interface ProviderAdapter {
  provider: Provider;
  callOnce(params: {
    model: string;
    effort?: Effort;
    systemPrompt: string;
    history: CanonicalMessage[];
    tools: ToolDef[] | null; // null on the tools-off wrap-up call
  }): Promise<ProviderCallResult>;
}
