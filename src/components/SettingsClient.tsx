"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_MODELS,
  EFFORT_LEVELS,
  PROVIDERS,
  Effort,
  PhaseModelSetting,
} from "@/lib/modelSettingsShared";
import { PHASES, PHASE_LABELS, Phase, Provider } from "@/lib/types";
import type { CatalogModel } from "@/lib/openRouterCatalog";

function OpenRouterModelPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (modelId: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function search(q: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/openrouter/models?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(res.ok ? data.models : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function confirmTyped() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSelect(trimmed);
    setOpen(false);
  }

  const hasUnsavedTyped = query.trim() !== "" && query.trim() !== value;

  return (
    <div ref={containerRef} className="relative flex w-full max-w-xs items-center gap-1.5">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          if (results.length === 0) search(query);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmTyped();
          }
        }}
        placeholder="Search or type an exact model id…"
        className="w-full rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 font-mono text-xs text-bb-text placeholder:font-sans placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
      />
      {hasUnsavedTyped && (
        <button
          type="button"
          onClick={confirmTyped}
          title="Save this exact model id as typed, without picking a search result"
          className="shrink-0 rounded-md border border-bb-red bg-bb-red-dim px-2 py-1.5 text-xs font-semibold text-bb-text hover:bg-bb-red"
        >
          Save
        </button>
      )}
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-bb-border bg-bb-panel shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-bb-text-tertiary">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-bb-text-tertiary">No matches.</div>
          )}
          {!loading &&
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSelect(m.id);
                  setQuery(m.id);
                  setOpen(false);
                }}
                className="block w-full border-b border-bb-border-subtle px-3 py-2 text-left last:border-0 hover:bg-bb-surface"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-bb-text">{m.name}</span>
                  {!m.supportsTools && (
                    <span className="shrink-0 rounded-full bg-bb-red-dim px-1.5 py-0.5 text-[9px] text-bb-text">
                      no tool support
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-bb-text-tertiary">
                  <span className="truncate font-mono">{m.id}</span>
                  <span className="shrink-0">
                    ${m.inputPerMillion.toFixed(2)}/${m.outputPerMillion.toFixed(2)} per 1M
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

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
  const [errorPhase, setErrorPhase] = useState<Phase | null>(null);

  // UI-only -- doesn't save. Used when switching a phase to OpenRouter before
  // any model has been picked yet: there's nothing valid to persist (the
  // server rejects an empty model), so saving immediately just fails
  // silently and leaves the phase looking switched while nothing actually
  // changed server-side. The real save happens in updatePhase once a model
  // is chosen from search.
  function setLocalOnly(phase: Phase, next: PhaseModelSetting) {
    setSettings((prev) => ({ ...prev, [phase]: next }));
    setErrorPhase(null);
  }

  async function updatePhase(phase: Phase, next: PhaseModelSetting) {
    setSettings((prev) => ({ ...prev, [phase]: next }));
    setSavingPhase(phase);
    setSavedPhase(null);
    setErrorPhase(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, ...next }),
      });
      if (!res.ok) {
        setErrorPhase(phase);
        return;
      }
      setSavedPhase(phase);
      setTimeout(() => setSavedPhase((p) => (p === phase ? null : p)), 1500);
    } catch {
      setErrorPhase(phase);
    } finally {
      setSavingPhase(null);
    }
  }

  return (
    <div className="min-h-screen bg-bb-bg px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-bb-text">Model Settings</h1>
            <p className="mt-1 text-sm text-bb-text-secondary">
              Signed in as {userEmail}. Pick which provider, model, and (for Anthropic) effort tier
              handles each phase of the PRD-writing process.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            ← Back to chat
          </Link>
        </div>

        <div className="overflow-visible rounded-lg border border-bb-border">
          {PHASES.map((phase, i) => {
            const current = settings[phase];
            const modelDef = AVAILABLE_MODELS.find((m) => m.id === current.model);
            return (
              <div
                key={phase}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${
                  i !== PHASES.length - 1 ? "border-b border-bb-border-subtle" : ""
                } bg-bb-panel`}
              >
                <div className="min-w-[140px] shrink-0">
                  <div className="text-sm font-semibold text-bb-text">{PHASE_LABELS[phase]}</div>
                  <div className="text-xs text-bb-text-tertiary">Phase {i + 1}</div>
                </div>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                  <select
                    value={current.provider}
                    onChange={(e) => {
                      const nextProvider = e.target.value as Provider;
                      if (nextProvider === "anthropic") {
                        updatePhase(phase, {
                          provider: "anthropic",
                          model: "claude-sonnet-5",
                          effort: "medium",
                        });
                      } else {
                        setLocalOnly(phase, { provider: "openrouter", model: "" });
                      }
                    }}
                    className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-sm text-bb-text focus:border-bb-red focus:outline-none"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>

                  {current.provider === "anthropic" ? (
                    <>
                      <select
                        value={current.model}
                        onChange={(e) => {
                          const nextModel = e.target.value;
                          const nextModelDef = AVAILABLE_MODELS.find((m) => m.id === nextModel)!;
                          updatePhase(phase, {
                            provider: "anthropic",
                            model: nextModel,
                            effort: nextModelDef.supportsEffort ? (current.effort ?? "high") : undefined,
                          });
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
                        value={current.effort ?? "high"}
                        disabled={!modelDef?.supportsEffort}
                        onChange={(e) =>
                          updatePhase(phase, { ...current, effort: e.target.value as Effort })
                        }
                        className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-sm text-bb-text focus:border-bb-red focus:outline-none disabled:opacity-30"
                        title={
                          modelDef?.supportsEffort
                            ? "Reasoning effort"
                            : `${modelDef?.label ?? "This model"} doesn't support effort tiers`
                        }
                      >
                        {EFFORT_LEVELS.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <div>
                      <OpenRouterModelPicker
                        value={current.model}
                        onSelect={(modelId) => updatePhase(phase, { provider: "openrouter", model: modelId })}
                      />
                      {!current.model && (
                        <div className="mt-1 text-[10px] text-bb-text-tertiary">
                          Not saved yet -- search and pick a model below
                        </div>
                      )}
                    </div>
                  )}

                  <div className="w-20 text-right text-xs">
                    {savingPhase === phase && (
                      <span className="text-bb-text-tertiary">saving…</span>
                    )}
                    {savedPhase === phase && <span className="text-bb-green">saved</span>}
                    {errorPhase === phase && (
                      <span className="text-bb-red" title="Save failed -- check the model id and try again">
                        save failed
                      </span>
                    )}
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
          <div className="pt-1">
            <span className="font-semibold text-bb-text-secondary">OpenRouter:</span> search any
            model in OpenRouter&apos;s catalog. Models flagged &quot;no tool support&quot; can&apos;t
            drive most phases of this app, which calls a tool almost every turn -- pick one without
            that flag unless you know what you&apos;re doing. Effort tiers don&apos;t apply to
            OpenRouter models in this version.
          </div>
        </div>
      </div>
    </div>
  );
}
