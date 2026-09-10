// OpenRouter's model catalog is public (no API key needed to list models),
// so the search feature works even before OPENROUTER_API_KEY is configured --
// only actually running a turn against a chosen model needs the key.
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour -- the catalog doesn't change minute to minute

export interface CatalogModel {
  id: string;
  name: string;
  contextLength: number;
  inputPerMillion: number;
  outputPerMillion: number;
  supportsTools: boolean;
}

interface RawModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  supported_parameters?: string[];
}

let cache: { models: CatalogModel[]; fetchedAt: number } | null = null;

async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch(MODELS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch OpenRouter model list: ${res.status}`);
  }
  const data = (await res.json()) as { data: RawModel[] };
  return data.data.map((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.context_length,
    inputPerMillion: Number(m.pricing.prompt) * 1_000_000,
    outputPerMillion: Number(m.pricing.completion) * 1_000_000,
    supportsTools: (m.supported_parameters ?? []).includes("tools"),
  }));
}

async function getCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  const models = await fetchCatalog();
  cache = { models, fetchedAt: Date.now() };
  return models;
}

export async function searchOpenRouterModels(query: string, limit = 30): Promise<CatalogModel[]> {
  const models = await getCatalog();
  const q = query.trim().toLowerCase();
  const matches = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : models;
  // Tool-calling-capable models first -- this app calls a tool every phase,
  // so a model without "tools" in supported_parameters won't actually work
  // for anything but Phase 1-3's plain back-and-forth.
  return matches
    .slice()
    .sort((a, b) => Number(b.supportsTools) - Number(a.supportsTools))
    .slice(0, limit);
}
