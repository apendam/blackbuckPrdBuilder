"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConversationView } from "@/lib/conversations";
import { PHASE_LABELS } from "@/lib/types";
import { costForModel, formatCost } from "@/lib/pricing";

interface ModelRow {
  key: string;
  model: string;
  input: number;
  output: number;
  cost: number;
}

// Tokens and spend per model for one PRD. Revisions carry the full prior
// conversation forward, so a version's numbers already include the history it
// was built on. Cost is per entry, never off blended totals (see TokenUsage).
function usageByModel(c: ConversationView): ModelRow[] {
  const rows = new Map<string, ModelRow>();
  for (const m of c.messages) {
    for (const u of m.usage?.byModel ?? []) {
      const key = `${u.provider}:${u.model}`;
      const row = rows.get(key) ?? { key, model: u.model, input: 0, output: 0, cost: 0 };
      row.input += u.inputTokens;
      row.output += u.outputTokens;
      row.cost += u.cost ?? costForModel(u.provider, u.model, u.inputTokens, u.outputTokens);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.input + b.output - (a.input + a.output));
}

// Whole-PRD totals run into the millions, so show M, not "9809k".
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface Popup {
  id: string;
  top: number;
  left: number;
}

const POPUP_WIDTH = 320;

export function PrdTable({
  rows,
  tab,
  author,
  onOpen,
  renderActions,
}: {
  rows: ConversationView[];
  tab: "drafts" | "completed" | "archived";
  author: string;
  onOpen: (c: ConversationView) => void;
  renderActions: (c: ConversationView) => ReactNode;
}) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const usage = useMemo(() => new Map(rows.map((c) => [c.id, usageByModel(c)])), [rows]);

  // A fixed-position popup would drift away from its row on scroll, so close
  // it on scroll, outside click, or Escape.
  useEffect(() => {
    if (!popup) return;
    const close = () => setPopup(null);
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-token-popup]") && !t.closest("[data-token-info]")) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [popup]);

  function toggleInfo(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    if (popup?.id === id) {
      setPopup(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setPopup({
      id,
      top: r.bottom + 10,
      left: Math.max(12, Math.min(r.right - POPUP_WIDTH, window.innerWidth - POPUP_WIDTH - 12)),
    });
  }

  if (rows.length === 0) return null;

  const popupRows = popup ? usage.get(popup.id) ?? [] : [];
  const popupTotal = popupRows.reduce((s, m) => s + m.input + m.output, 0);
  const popupCost = popupRows.reduce((s, m) => s + m.cost, 0);
  const th = "bb-caps px-4 py-3.5 text-[11px] font-semibold tracking-wider text-bb-text";

  return (
    <>
      <div className="overflow-x-auto rounded-md border-2 border-bb-text bg-bb-panel shadow-[-6px_6px_0_0_var(--bb-red)]">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-bb-text bg-bb-surface">
              <th className={`${th} pl-5`}>PRD</th>
              <th className={th}>Author</th>
              <th className={th}>Last modified</th>
              <th className={`${th} text-right`}>Tokens</th>
              <th className={`${th} text-right`}>Spent</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const byModel = usage.get(c.id) ?? [];
              const tokens = byModel.reduce((s, m) => s + m.input + m.output, 0);
              const cost = byModel.reduce((s, m) => s + m.cost, 0);
              return (
                <tr key={c.id} className="border-b border-bb-border last:border-b-0 hover:bg-bb-surface">
                  <td className="py-5 pl-5 pr-4 align-middle">
                    <button className="text-left normal-case" onClick={() => onOpen(c)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium leading-snug text-bb-text">
                          {c.title || "(untitled draft)"}
                        </span>
                        {c.version > 1 && (
                          <span className="rounded-full border border-bb-text px-2 py-0.5 text-[10px] text-bb-text-secondary">
                            v{c.version}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-xs lowercase text-bb-text-tertiary">
                        {tab === "drafts" ? PHASE_LABELS[c.currentPhase] : "Completed"}
                      </div>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-5 align-middle text-sm text-bb-text-secondary">{author}</td>
                  <td className="whitespace-nowrap px-4 py-5 align-middle text-sm text-bb-text-secondary">
                    {formatDate(c.updatedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-5 text-right align-middle text-sm tabular-nums text-bb-text-secondary">
                    {tokens > 0 ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        {formatTokenCount(tokens)}
                        <button
                          data-token-info
                          onClick={(e) => toggleInfo(e, c.id)}
                          aria-label="Token breakdown by model"
                          aria-expanded={popup?.id === c.id}
                          className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-bb-text bg-bb-panel p-0 font-mono text-[11px] font-medium normal-case leading-none text-bb-text"
                        >
                          i
                        </button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-5 text-right align-middle text-sm tabular-nums text-bb-text-secondary">
                    {tokens > 0 ? formatCost(cost) : "—"}
                  </td>
                  <td className="py-5 pl-2 pr-4 align-middle">
                    <div className="flex items-center justify-end gap-1">{renderActions(c)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {popup && (
        <div
          data-token-popup
          className="fixed z-30 rounded-md border-2 border-bb-text bg-bb-bg p-4 shadow-[-5px_5px_0_0_var(--bb-red)]"
          style={{ top: popup.top, left: popup.left, width: POPUP_WIDTH }}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="bb-caps text-[11px] font-semibold tracking-wider text-bb-text">Tokens by model</span>
            <button
              onClick={() => setPopup(null)}
              aria-label="Close"
              className="text-xs normal-case text-bb-text-tertiary hover:text-bb-text"
            >
              ✕
            </button>
          </div>
          {popupRows.map((m) => {
            const total = m.input + m.output;
            const share = popupTotal > 0 ? (total / popupTotal) * 100 : 0;
            return (
              <div key={m.key} className="mb-4">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-mono normal-case text-bb-text">{m.model}</span>
                  <span className="shrink-0 tabular-nums text-bb-text-secondary">
                    {formatTokenCount(total)} · {formatCost(m.cost)}
                  </span>
                </div>
                <div className="flex h-3.5 border-2 border-bb-text" style={{ width: `${Math.max(share, 4)}%` }}>
                  <div className="bg-bb-red" style={{ width: `${total > 0 ? (m.input / total) * 100 : 0}%` }} />
                  <div
                    className="flex-1"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, var(--bb-bg), var(--bb-bg) 3px, var(--bb-border) 3px, var(--bb-border) 5px)",
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] tabular-nums text-bb-text-tertiary">
                  in {formatTokenCount(m.input)} · out {formatTokenCount(m.output)}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4 border-t-2 border-bb-text pt-2.5 text-[11px] text-bb-text-tertiary">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 border border-bb-text bg-bb-red" />
              Input
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 border border-bb-text"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, var(--bb-bg), var(--bb-bg) 2px, var(--bb-border) 2px, var(--bb-border) 4px)",
                }}
              />
              Output
            </span>
            <span className="ml-auto tabular-nums text-bb-text">
              {formatTokenCount(popupTotal)} · {formatCost(popupCost)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
