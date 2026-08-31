"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AVAILABLE_MODELS,
  EFFORT_LEVELS,
  ClaudeModel,
  Effort,
  PhaseModelSetting,
} from "@/lib/modelSettingsShared";
import { PHASES, PHASE_LABELS, Phase } from "@/lib/types";

export function SettingsClient({
  initialSettings,
  userEmail,
}: {
  initialSettings: Record<Phase, PhaseModelSetting>;
  userEmail: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [savingPhase, setSavingPhase] = useState<Phase | null>(null);
  const [savedPhase, setSavedPhase] = useState<Phase | null>(null);

  async function updatePhase(phase: Phase, model: ClaudeModel, effort: Effort) {
    setSettings((prev) => ({ ...prev, [phase]: { model, effort } }));
    setSavingPhase(phase);
    setSavedPhase(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, model, effort }),
      });
      setSavedPhase(phase);
      setTimeout(() => setSavedPhase((p) => (p === phase ? null : p)), 1500);
    } finally {
      setSavingPhase(null);
    }
  }

  return (
    <div className="min-h-screen bg-bb-bg px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-bb-text">Model Settings</h1>
            <p className="mt-1 text-sm text-bb-text-secondary">
              Signed in as {userEmail}. Pick which Claude model and effort tier handles each
              phase of the PRD-writing process.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            ← Back to chat
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-bb-border">
          {PHASES.map((phase, i) => {
            const current = settings[phase];
            const modelDef = AVAILABLE_MODELS.find((m) => m.id === current.model)!;
            return (
              <div
                key={phase}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  i !== PHASES.length - 1 ? "border-b border-bb-border-subtle" : ""
                } bg-bb-panel`}
              >
                <div className="min-w-[160px]">
                  <div className="text-sm font-semibold text-bb-text">{PHASE_LABELS[phase]}</div>
                  <div className="text-xs text-bb-text-tertiary">Phase {i + 1}</div>
                </div>

                <div className="flex flex-1 items-center justify-end gap-3">
                  <select
                    value={current.model}
                    onChange={(e) => {
                      const nextModel = e.target.value as ClaudeModel;
                      const nextModelDef = AVAILABLE_MODELS.find((m) => m.id === nextModel)!;
                      updatePhase(
                        phase,
                        nextModel,
                        nextModelDef.supportsEffort ? current.effort : "high"
                      );
                    }}
                    className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-sm text-bb-text focus:border-bb-red focus:outline-none"
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={current.effort}
                    disabled={!modelDef.supportsEffort}
                    onChange={(e) => updatePhase(phase, current.model, e.target.value as Effort)}
                    className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-sm text-bb-text focus:border-bb-red focus:outline-none disabled:opacity-30"
                    title={
                      modelDef.supportsEffort
                        ? "Reasoning effort"
                        : `${modelDef.label} doesn't support effort tiers`
                    }
                  >
                    {EFFORT_LEVELS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>

                  <div className="w-14 text-right text-xs">
                    {savingPhase === phase && (
                      <span className="text-bb-text-tertiary">saving…</span>
                    )}
                    {savedPhase === phase && <span className="text-bb-green">saved</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 text-xs text-bb-text-tertiary">
          {AVAILABLE_MODELS.map((m) => (
            <div key={m.id}>
              <span className="font-semibold text-bb-text-secondary">{m.label}:</span> {m.note}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
