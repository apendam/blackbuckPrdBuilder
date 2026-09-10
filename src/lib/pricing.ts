import { ModelUsageBreakdown, Provider } from "./types";

// $ per 1M tokens, first-party Anthropic API rates (snapshot: 2026-06-24, via
// the claude-api skill's cached pricing table). Update this table when prices
// change -- nothing else in the app needs to change alongside it, since cost
// is always computed lazily from stored token counts, never stored as a
// dollar figure. Adding a second provider later is a new top-level key here
// plus a new Provider value in types.ts -- existing rows and stored usage
// data need no migration.
// Anthropic only -- OpenRouter responses carry their own real `usage.cost`
// per call (see ModelUsageBreakdown.cost), so there's no static table for it
// here: a hardcoded per-model table can't realistically track OpenRouter's
// hundreds of models and provider-side price changes.
export const PRICING: Record<"anthropic", Record<string, { inputPerMillion: number; outputPerMillion: number }>> = {
  anthropic: {
    "claude-opus-5": { inputPerMillion: 5.0, outputPerMillion: 25.0 },
    "claude-sonnet-5": { inputPerMillion: 2.0, outputPerMillion: 10.0 },
    "claude-fable-5": { inputPerMillion: 10.0, outputPerMillion: 50.0 },
    "claude-haiku-4-5": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  },
};

export function costForModel(
  provider: Provider,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider !== "anthropic") return 0; // OpenRouter entries should always carry their own `cost` instead
  const pricing = PRICING.anthropic[model];
  if (!pricing) return 0; // unknown/retired model id -- don't crash a dashboard over it
  return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion;
}

export function costForBreakdown(byModel: ModelUsageBreakdown[]): number {
  return byModel.reduce(
    (sum, m) => sum + (m.cost ?? costForModel(m.provider, m.model, m.inputTokens, m.outputTokens)),
    0
  );
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}
