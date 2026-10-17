"use client";

import { useCallback, useEffect, useState } from "react";
import { KNOWN_REPOS } from "@/lib/repoList";

type RepoResult = { repo: string; status: string; detail: string };
type AddJob = {
  name: string;
  status: "cloning" | "analyzing" | "done" | "error";
  startedAt: string;
  progress: string[];
  written?: string[];
  error?: string;
};

export function RefreshReposModal({ onClose }: { onClose: () => void }) {
  const [repoNames, setRepoNames] = useState<string[]>([...KNOWN_REPOS]);
  const [selected, setSelected] = useState<Set<string>>(new Set(KNOWN_REPOS));
  const [jobs, setJobs] = useState<AddJob[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const activeJob = jobs.some((j) => j.status === "cloning" || j.status === "analyzing");

  const loadRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      if (!res.ok) return;
      const names: string[] = data.repos.map((r: { name: string }) => r.name);
      setRepoNames(names);
      // Newly added repos start selected, like the built-in ones.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const n of names) if (!repoNames.includes(n)) next.add(n);
        return next;
      });
      setJobs(data.jobs);
    } catch {
      // Keep whatever list is already showing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  // The add run (clone, then code analysis) lives on the server; poll while
  // one is going.
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(() => void loadRepos(), 3000);
    return () => clearInterval(t);
  }, [activeJob, loadRepos]);

  async function addRepo(body: Record<string, string>) {
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add the repo");
      setNewUrl("");
      setNewDescription("");
      await loadRepos();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add the repo");
    } finally {
      setAdding(false);
    }
  }
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RepoResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(repo: string) {
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
          <h2 className="font-display text-xl font-medium lowercase tracking-tight text-bb-text">Refresh repos</h2>
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
              {repoNames.map((repo) => (
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
            <div className="mb-5 rounded-md border border-bb-border-subtle p-3">
              <div className="mb-2 text-xs font-semibold lowercase text-bb-text-secondary">Add a repo</div>
              <p className="mb-2 text-[11px] text-bb-text-tertiary">
                Clones it, then reads the code and writes the context files the PRD builder and design tool use.
                Takes a few minutes.
              </p>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://github.com/BLACKBUCK-LABS/<repo>"
                className="mb-2 w-full rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What it is (optional), e.g. rewards backend"
                className="mb-2 w-full rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
              />
              <button
                onClick={() => addRepo({ url: newUrl, description: newDescription })}
                disabled={adding || activeJob || !newUrl.trim()}
                className="rounded-full bg-bb-red px-4 py-1.5 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:opacity-40"
              >
                {adding ? "Starting…" : "Add"}
              </button>
              {addError && <p className="mt-2 text-xs text-bb-red [overflow-wrap:anywhere]">{addError}</p>}
              {jobs
                .filter((j) => j.status !== "done" || Date.now() - new Date(j.startedAt).getTime() < 24 * 3600 * 1000)
                .map((j) => (
                  <div key={j.name} className="mt-3 rounded-md bg-bb-surface px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-bb-text">{j.name}</span>
                      <span
                        className={
                          j.status === "done"
                            ? "text-bb-green"
                            : j.status === "error"
                              ? "text-bb-red"
                              : "text-bb-text-tertiary"
                        }
                      >
                        {j.status === "cloning"
                          ? "cloning…"
                          : j.status === "analyzing"
                            ? "analysing the code…"
                            : j.status === "done"
                              ? "ready"
                              : "failed"}
                      </span>
                    </div>
                    {(j.status === "cloning" || j.status === "analyzing") && j.progress.length > 0 && (
                      <div className="mt-1 font-mono text-[10px] text-bb-text-tertiary">
                        › {j.progress[j.progress.length - 1]}
                      </div>
                    )}
                    {j.status === "done" && j.written && (
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-bb-text-tertiary">
                        {j.written.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                    {j.status === "error" && (
                      <>
                        <div className="mt-1 text-[11px] text-bb-red [overflow-wrap:anywhere]">{j.error}</div>
                        {repoNames.includes(j.name) && (
                          <button
                            onClick={() => addRepo({ action: "reanalyze", name: j.name })}
                            disabled={adding || activeJob}
                            className="mt-1 text-[11px] text-bb-text-tertiary underline decoration-dotted hover:text-bb-text disabled:opacity-40"
                          >
                            retry analysis
                          </button>
                        )}
                      </>
                    )}
                  </div>
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
                {running ? `Pulling…` : `Run (${selected.size})`}
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
