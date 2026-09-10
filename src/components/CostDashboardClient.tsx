"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import type { CostDashboardData } from "@/lib/costDashboard";
import { formatCost, formatTokenCount } from "@/lib/pricing";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-bb-border bg-bb-surface px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-bb-text-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold text-bb-text">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-bb-text-tertiary">{sub}</div>}
    </div>
  );
}

function DailySpendChart({ byDay }: { byDay: CostDashboardData["byDay"] }) {
  if (byDay.length === 0) {
    return <p className="text-sm text-bb-text-tertiary">No spend recorded yet.</p>;
  }
  const maxCost = Math.max(...byDay.map((d) => d.cost), 0.0001);
  return (
    <div className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
      {byDay.map((d) => (
        <div key={d.date} className="flex min-w-[10px] flex-1 flex-col items-center justify-end" title={`${d.date}: ${formatCost(d.cost)}`}>
          <div
            className="w-full rounded-t-sm bg-bb-red"
            style={{ height: `${Math.max((d.cost / maxCost) * 100, 2)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function CostDashboardClient({
  data,
  userName,
  userEmail,
  signOutAction,
}: {
  data: CostDashboardData;
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const { totals, byModel, byVertical, byDay, conversations } = data;

  return (
    <div className="flex h-screen flex-col">
      <AppHeader userName={userName} userEmail={userEmail} signOutAction={signOutAction} />
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-bb-text">Cost dashboard</h1>
              <p className="text-xs text-bb-text-tertiary">
                Token usage and spend across every draft and completed PRD.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
            >
              ← Dashboard
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total spend" value={formatCost(totals.cost)} />
            <StatCard
              label="Total tokens"
              value={formatTokenCount(totals.inputTokens + totals.outputTokens)}
              sub={`${formatTokenCount(totals.inputTokens)} in / ${formatTokenCount(totals.outputTokens)} out`}
            />
            <StatCard label="Replies" value={totals.messageCount.toLocaleString()} />
            <StatCard label="PRDs with usage" value={conversations.length.toLocaleString()} />
          </div>

          <section>
            <h2 className="mb-2 text-sm font-bold text-bb-text">Spend by day</h2>
            <div className="rounded-lg border border-bb-border bg-bb-surface p-4">
              <DailySpendChart byDay={byDay} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold text-bb-text">By model</h2>
            <div className="overflow-x-auto rounded-lg border border-bb-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-bb-border bg-bb-surface text-[11px] uppercase tracking-wide text-bb-text-tertiary">
                    <th className="px-3 py-2 font-semibold">Provider</th>
                    <th className="px-3 py-2 font-semibold">Model</th>
                    <th className="px-3 py-2 font-semibold">Input tokens</th>
                    <th className="px-3 py-2 font-semibold">Output tokens</th>
                    <th className="px-3 py-2 font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-bb-text-tertiary">
                        No usage recorded yet.
                      </td>
                    </tr>
                  )}
                  {byModel.map((m) => (
                    <tr key={`${m.provider}:${m.model}`} className="border-b border-bb-border-subtle last:border-0">
                      <td className="px-3 py-2 capitalize text-bb-text-secondary">{m.provider}</td>
                      <td className="px-3 py-2 font-mono text-xs text-bb-text">{m.model}</td>
                      <td className="px-3 py-2 text-bb-text-secondary">{m.inputTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-bb-text-secondary">{m.outputTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 font-semibold text-bb-text">{formatCost(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-bold text-bb-text">By vertical</h2>
            <p className="mb-2 text-xs text-bb-text-tertiary">
              A PRD scoped to more than one vertical counts its full cost toward each -- rows don&apos;t sum to
              total spend.
            </p>
            <div className="overflow-x-auto rounded-lg border border-bb-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-bb-border bg-bb-surface text-[11px] uppercase tracking-wide text-bb-text-tertiary">
                    <th className="px-3 py-2 font-semibold">Vertical</th>
                    <th className="px-3 py-2 font-semibold">PRDs</th>
                    <th className="px-3 py-2 font-semibold">Tokens</th>
                    <th className="px-3 py-2 font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byVertical.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-bb-text-tertiary">
                        No vertical-tagged usage yet.
                      </td>
                    </tr>
                  )}
                  {byVertical.map((v) => (
                    <tr key={v.vertical} className="border-b border-bb-border-subtle last:border-0">
                      <td className="px-3 py-2 text-bb-text">{v.vertical}</td>
                      <td className="px-3 py-2 text-bb-text-secondary">{v.conversationCount}</td>
                      <td className="px-3 py-2 text-bb-text-secondary">
                        {formatTokenCount(v.inputTokens + v.outputTokens)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-bb-text">{formatCost(v.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold text-bb-text">By PRD</h2>
            <div className="overflow-x-auto rounded-lg border border-bb-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-bb-border bg-bb-surface text-[11px] uppercase tracking-wide text-bb-text-tertiary">
                    <th className="px-3 py-2 font-semibold">Title</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Tokens</th>
                    <th className="px-3 py-2 font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-bb-text-tertiary">
                        No PRDs with recorded usage yet.
                      </td>
                    </tr>
                  )}
                  {conversations.map((c) => (
                    <tr key={c.id} className="border-b border-bb-border-subtle last:border-0">
                      <td className="px-3 py-2">
                        <Link
                          href={c.status === "draft" ? `/chat/${c.id}` : `/prd/${c.id}`}
                          className="text-bb-red underline underline-offset-2"
                        >
                          {c.title || "(untitled PRD)"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 capitalize text-bb-text-secondary">{c.status}</td>
                      <td className="px-3 py-2 text-bb-text-secondary">
                        {formatTokenCount(c.inputTokens + c.outputTokens)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-bb-text">{formatCost(c.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
