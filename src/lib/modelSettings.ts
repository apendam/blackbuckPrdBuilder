import { prisma } from "./prisma";
import { Phase, PHASES } from "./types";
import {
  ClaudeModel,
  Effort,
  PhaseModelSetting,
  DEFAULT_MODEL_SETTINGS,
  isKnownModel,
  isKnownEffort,
} from "./modelSettingsShared";

export * from "./modelSettingsShared";

export async function getUserModelSettings(
  userId: string
): Promise<Record<Phase, PhaseModelSetting>> {
  const rows = await prisma.modelSetting.findMany({ where: { userId } });
  const result: Record<Phase, PhaseModelSetting> = { ...DEFAULT_MODEL_SETTINGS };
  for (const row of rows) {
    if ((PHASES as readonly string[]).includes(row.phase) && isKnownModel(row.model)) {
      const phase = row.phase as Phase;
      const effort =
        row.effort && isKnownEffort(row.effort) ? row.effort : DEFAULT_MODEL_SETTINGS[phase].effort;
      result[phase] = { model: row.model, effort };
    }
  }
  return result;
}

export async function setUserModelSetting(
  userId: string,
  phase: Phase,
  model: ClaudeModel,
  effort: Effort
): Promise<void> {
  await prisma.modelSetting.upsert({
    where: { userId_phase: { userId, phase } },
    update: { model, effort },
    create: { userId, phase, model, effort },
  });
}
