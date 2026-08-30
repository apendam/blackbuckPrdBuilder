"use client";

import { useState } from "react";
import { KNOWN_REPOS, RepoName } from "@/lib/repoList";

type RepoResult = { repo: string; status: string; detail: string };

export function RefreshReposModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<Set<RepoName>>(new Set(KNOWN_REPOS));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RepoResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(repo: RepoName) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/refresh-repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  const statusColor: Record<string, string> = {
    "up-to-date": "text-bb-text-tertiary",
    updated: "text-bb-green",
    failed: "text-bb-red",
    skipped: "text-bb-text-tertiary",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-bb-border bg-bb-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-bb-text">Refresh repos</h2>
          <button onClick={onClose} className="text-bb-text-tertiary hover:text-bb-text">
            ✕
          </button>
        </div>

        {!results && (
          <>
            <p className="mb-4 text-xs text-bb-text-secondary">
              All repos are preselected. Deselect any you don&apos;t want to pull, then run.
            </p>
            <div className="mb-5 space-y-2">
              {KNOWN_REPOS.map((repo) => (
                <label
                  key={repo}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-bb-surface"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(repo)}
                    onChange={() => toggle(repo)}
                    className="accent-bb-red"
                  />
                  <span className="text-sm text-bb-text">{repo}</span>
                </label>
              ))}
            </div>
            {error && (
              <div className="mb-4 rounded-md border border-bb-red bg-bb-red-dim px-3 py-2 text-xs text-bb-text">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:text-bb-text"
              >
                Cancel
              </button>
              <button
                onClick={run}
                disabled={running || selected.size === 0}
                className="rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:opacity-40"
              >
                {running ? `Pulling ${selected.size} repo(s)…` : `Run (${selected.size})`}
              </button>
            </div>
          </>
        )}

        {results && (
          <>
            <div className="mb-5 space-y-2">
              {results.map((r) => (
                <div key={r.repo} className="rounded-md bg-bb-surface px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-bb-text">{r.repo}</span>
                    <span className={`text-xs font-semibold ${statusColor[r.status] ?? "text-bb-text-tertiary"}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.detail && (
                    <div className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-bb-text-tertiary">
                      {r.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
