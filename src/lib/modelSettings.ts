import { prisma } from "./prisma";
import { Phase, PHASES, Provider } from "./types";
import {
  Effort,
  PhaseModelSetting,
  DEFAULT_MODEL_SETTINGS,
  isKnownModel,
  isKnownEffort,
  isKnownProvider,
} from "./modelSettingsShared";

export * from "./modelSettingsShared";

export async function getUserModelSettings(
  userId: string
): Promise<Record<Phase, PhaseModelSetting>> {
  const rows = await prisma.modelSetting.findMany({ where: { userId } });
  const result: Record<Phase, PhaseModelSetting> = { ...DEFAULT_MODEL_SETTINGS };
  for (const row of rows) {
    if (!(PHASES as readonly string[]).includes(row.phase)) continue;
    const phase = row.phase as Phase;
    const provider = isKnownProvider(row.provider) ? row.provider : "anthropic";
    // Anthropic models are validated against the fixed list; OpenRouter's
    // catalog is dynamic (hundreds of models, searched live), so any
    // non-empty slug the Settings UI saved is trusted as-is.
    if (provider === "anthropic" && !isKnownModel(row.model)) continue;
    if (!row.model) continue;
    const effort =
      provider === "anthropic" && row.effort && isKnownEffort(row.effort)
        ? row.effort
        : provider === "anthropic"
          ? DEFAULT_MODEL_SETTINGS[phase].effort
          : undefined;
    result[phase] = { provider, model: row.model, effort };
  }
  return result;
}

export async function setUserModelSetting(
  userId: string,
  phase: Phase,
  provider: Provider,
  model: string,
  effort?: Effort
): Promise<void> {
  await prisma.modelSetting.upsert({
    where: { userId_phase: { userId, phase } },
    update: { provider, model, effort },
    create: { userId, phase, provider, model, effort },
  });
}
