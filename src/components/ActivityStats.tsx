"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConversationView } from "@/lib/conversations";

const WEEKS = 26;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Local-time calendar key, so a late-night message lands on the day the user
// actually experienced it, not on the UTC day.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Opacity of the red fill by messages sent that day.
function intensity(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 0.4;
  if (count <= 5) return 0.7;
  return 1;
}

export function ActivityStats({
  drafts,
  completed,
  archived,
}: {
  drafts: ConversationView[];
  completed: ConversationView[];
  archived: ConversationView[];
}) {
  // "Today" is only known in the browser; computing it after mount avoids a
  // server/client hydration mismatch around midnight or across time zones.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const { perDay, activeDays, completedCount, inProgress } = useMemo(() => {
    const perDay = new Map<string, number>();
    const bump = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      const k = dayKey(d);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    };
    for (const c of [...drafts, ...completed, ...archived]) {
      let undated = false;
      for (const m of c.messages) {
        if (m.role !== "user") continue;
        if (m.at) bump(m.at);
        else undated = true;
      }
      // Older messages were saved without a send time; fall back to the day
      // the PRD was started so that history still shows up.
      if (undated) bump(c.createdAt);
    }
    return {
      perDay,
      activeDays: perDay.size,
      completedCount: completed.length + archived.filter((c) => c.completedAt).length,
      inProgress: drafts.length,
    };
  }, [drafts, completed, archived]);

  const grid = useMemo(() => {
    if (!today) return null;
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // Start on the Sunday WEEKS-1 weeks before this week's Sunday.
    const start = new Date(end.getTime() - (end.getDay() + (WEEKS - 1) * 7) * DAY_MS);
    const cols: { date: Date; key: string; future: boolean }[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        col.push({ date, key: dayKey(date), future: date > end });
      }
      cols.push(col);
    }
    return cols;
  }, [today]);

  // Streak = consecutive active days. The current streak is still alive if
  // today has no activity yet but yesterday did (you haven't missed a day yet).
  const { currentStreak, bestStreak } = useMemo(() => {
    if (!today) return { currentStreak: 0, bestStreak: 0 };
    const parse = (k: string) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const next = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const prev = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    const keys = [...perDay.keys()].sort();
    let best = 0;
    let run = 0;
    let last: Date | null = null;
    for (const k of keys) {
      const d = parse(k);
      run = last && dayKey(next(last)) === k ? run + 1 : 1;
      best = Math.max(best, run);
      last = d;
    }
    let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!perDay.has(dayKey(cursor))) cursor = prev(cursor);
    let current = 0;
    while (perDay.has(dayKey(cursor))) {
      current++;
      cursor = prev(cursor);
    }
    return { currentStreak: current, bestStreak: best };
  }, [perDay, today]);

  const stats = [
    { label: "active days", value: activeDays },
    { label: "day streak", value: currentStreak, sub: `best ${bestStreak}` },
    { label: "prds completed", value: completedCount },
    { label: "prds in progress", value: inProgress },
  ];

  return (
    <section
      aria-label="Your activity"
      className="mb-6 flex flex-col gap-6 rounded-lg border border-bb-border bg-bb-panel p-5 md:flex-row md:items-center"
    >
      <div className="grid shrink-0 grid-cols-2 gap-x-10 gap-y-5">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-display text-4xl font-medium leading-none tracking-tight text-bb-text">{s.value}</div>
            <div className="mt-1 text-xs lowercase text-bb-text-tertiary">
              {s.label}
              {"sub" in s && s.sub ? <span className="ml-1.5 text-bb-red">· {s.sub}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {grid ? (
          <div className="w-full">
            <div className="mb-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
              {grid.map((col, i) => {
                const month = col[0].date.getMonth();
                const changed = i === 0 ? grid[1][0].date.getMonth() === month : month !== grid[i - 1][0].date.getMonth();
                return (
                  <div key={i} className="relative h-3 text-[10px] lowercase leading-none text-bb-text-tertiary">
                    {changed && <span className="absolute left-0 top-0 whitespace-nowrap">{MONTHS[month]}</span>}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
              {grid.map((col, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {col.map((cell) => {
                    const count = perDay.get(cell.key) ?? 0;
                    const label = `${cell.date.getDate()} ${MONTHS[cell.date.getMonth()]} ${cell.date.getFullYear()}: ${
                      count > 0 ? `${count} message${count === 1 ? "" : "s"}` : "no activity"
                    }`;
                    if (cell.future) return <div key={cell.key} className="aspect-square w-full" />;
                    return (
                      <div
                        key={cell.key}
                        title={label}
                        className="aspect-square w-full rounded-[5px] border border-bb-border-subtle bg-bb-surface"
                        style={
                          count > 0
                            ? { backgroundColor: "var(--bb-red)", opacity: intensity(count), borderColor: "var(--bb-red)" }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] lowercase text-bb-text-tertiary">
              less
              {[0, 1, 3, 6].map((n) => (
                <span
                  key={n}
                  className="h-2.5 w-2.5 rounded-[3px] border border-bb-border-subtle bg-bb-surface"
                  style={n > 0 ? { backgroundColor: "var(--bb-red)", opacity: intensity(n), borderColor: "var(--bb-red)" } : undefined}
                />
              ))}
              more
            </div>
          </div>
        ) : (
          <div className="h-[180px]" aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
