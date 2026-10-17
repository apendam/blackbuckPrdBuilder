"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FigmaJob {
  status: "briefing" | "brief_ready" | "building" | "done" | "error";
  startedAt: string;
  brief?: string;
  corrections?: string;
  handoff?: string;
  hasMockup?: boolean;
  repos?: { at: string; results: { repo: string; status: string; detail: string }[] };
  appliedToPrd?: boolean;
  progress: string[];
  error?: string;
}

function elapsed(since: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prd-markdown text-sm text-bb-text-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-bb-red underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function FigmaDesignPanel({ conversationId, onApplied }: { conversationId: string; onApplied: () => void }) {
  const [job, setJob] = useState<FigmaJob | null>(null);
  const [available, setAvailable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [corrections, setCorrections] = useState("");
  const [request, setRequest] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const url = `/api/conversations/${conversationId}/figma`;
  const running = job?.status === "briefing" || job?.status === "building";
  const runningRef = useRef(running);
  runningRef.current = running;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load design status");
      setJob(data.job);
      setAvailable(data.available);
      setUnavailableReason(data.unavailableReason);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load design status");
    } finally {
      setLoaded(true);
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while a run is going; the run lives on the server, so leaving this
  // tab (or reloading) doesn't lose it.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 2500);
    return () => clearInterval(t);
  }, [running, refresh]);

  async function act(action: "brief" | "build" | "refine" | "apply" | "reset") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, corrections, request }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setJob(data.job);
      if (action === "apply") onApplied();
      if (action === "reset") setCorrections("");
      if (action === "refine") setRequest("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-50";
  const ghost =
    "rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text disabled:opacity-50";

  return (
    <div className="mx-auto max-w-4xl px-8 py-8 print:hidden">
      <h2 className="font-display mb-1 text-lg font-medium lowercase tracking-tight text-bb-text">Design mockup</h2>
      <p className="mb-5 text-xs text-bb-text-tertiary">
        Screens for the Boss and BB Pro apps, derived from this PRD and the apps&apos; real code, as a clickable HTML
        mockup. Nothing is built until you confirm the brief.
      </p>

      {job?.repos && (() => {
        const r = job.repos.results;
        const count = (st: string) => r.filter((x) => x.status === st).length;
        const failed = r.filter((x) => x.status === "failed");
        return (
          <p className={`mb-4 text-xs ${failed.length ? "text-bb-amber" : "text-bb-text-tertiary"}`}>
            Code refreshed {new Date(job.repos.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}:{" "}
            {count("up-to-date")} up to date, {count("updated")} updated
            {count("skipped") > 0 && `, ${count("skipped")} not cloned`}
            {failed.length > 0 && `, ${failed.length} failed (${failed.map((f) => f.repo).join(", ")}), so those use the local copy`}.
          </p>
        );
      })()}

      {!available && (
        <p className="mb-4 rounded-md border border-bb-red bg-bb-red-dim px-3 py-2 text-xs text-bb-text">
          {unavailableReason}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-bb-red bg-bb-red-dim px-3 py-2 text-xs text-bb-text [overflow-wrap:anywhere]">
          {error}
        </p>
      )}

      {loaded && !job && (
        <button onClick={() => act("brief")} disabled={busy || !available} className={btn}>
          Draft brief
        </button>
      )}

      {running && job && (
        <div className="rounded-lg border border-bb-border bg-bb-panel p-4">
          <div className="mb-2 text-sm text-bb-text">
            {job.status === "briefing" ? "Drafting the design brief" : "Building the mockup"}
            <span className="ml-2 text-xs text-bb-text-tertiary">{elapsed(job.startedAt, now)}</span>
          </div>
          <p className="mb-2 text-xs text-bb-text-tertiary">
            {job.status === "briefing"
              ? "Usually a few minutes."
              : "Usually a few minutes. You can leave this page; the run continues on the server."}
          </p>
          {job.progress.length > 0 && (
            <ul className="space-y-0.5 font-mono text-[11px] text-bb-text-tertiary">
              {job.progress.map((p, i) => (
                <li key={i} className={i === job.progress.length - 1 ? "text-bb-text-secondary" : ""}>
                  {i === job.progress.length - 1 ? "› " : "  "}
                  {p}
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => act("reset")} disabled={busy} className={`${ghost} mt-4`}>
            Cancel
          </button>
        </div>
      )}

      {job?.status === "brief_ready" && job.brief && (
        <div>
          <div className="mb-4 rounded-lg border border-bb-border bg-bb-panel p-5">
            <div className="mb-3 text-xs font-semibold lowercase text-bb-text-tertiary">Design brief</div>
            <Markdown text={job.brief} />
          </div>
          <label className="mb-1 block text-xs text-bb-text-tertiary">
            Corrections to the brief (optional): wrong assumptions, screens to add or drop
          </label>
          <textarea
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
            rows={4}
            className="mb-4 w-full rounded-md border border-bb-border bg-bb-surface p-3 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
          />
          <div className="flex gap-2">
            <button onClick={() => act("build")} disabled={busy || !available} className={btn}>
              Build mockup
            </button>
            <button onClick={() => act("brief")} disabled={busy || !available} className={ghost}>
              Redraft
            </button>
          </div>
        </div>
      )}

      {job?.status === "done" && (job.handoff || job.hasMockup) && (
        <div>
          {job.hasMockup && (
            <div className="mb-4 overflow-hidden rounded-lg border border-bb-border bg-white">
              <iframe
                src={`${url}?mockup&v=${encodeURIComponent(job.startedAt)}`}
                title="Design mockup"
                sandbox="allow-scripts"
                className="h-[80vh] w-full border-0"
              />
            </div>
          )}
          <div className="mb-4 rounded-lg border border-bb-border bg-bb-panel p-5">
            <Markdown text={job.handoff ?? ""} />
          </div>
          {job.hasMockup && (
            <div className="mb-4">
              <label className="mb-1 block text-xs text-bb-text-tertiary">
                Add screens or change something: everything else stays as it is
              </label>
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                rows={3}
                placeholder="e.g. add the support portal view from PRD 7.6"
                className="mb-2 w-full rounded-md border border-bb-border bg-bb-surface p-3 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
              />
              <button onClick={() => act("refine")} disabled={busy || !available || !request.trim()} className={btn}>
                Update mockup
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {job.hasMockup && (
              <>
                <a href={`${url}?mockup`} target="_blank" rel="noreferrer" className={ghost}>
                  Open
                </a>
                <a href={`${url}?mockup&download`} className={ghost}>
                  Download
                </a>
              </>
            )}
            <button onClick={() => act("apply")} disabled={busy || job.appliedToPrd} className={btn}>
              {job.appliedToPrd ? "Added to PRD" : "Add summary to PRD"}
            </button>
            <button onClick={() => act("reset")} disabled={busy} className={ghost}>
              Start over
            </button>
          </div>
          {job.appliedToPrd && (
            <p className="mt-2 text-xs text-bb-text-tertiary">
              The design summary is in the PRD&apos;s Design section. The mockup itself stays here in the viewer; download it to share.
            </p>
          )}
        </div>
      )}

      {job?.status === "error" && (
        <div className="rounded-lg border border-bb-red bg-bb-red-dim p-4">
          <p className="mb-3 text-sm text-bb-text [overflow-wrap:anywhere]">{job.error}</p>
          <div className="flex gap-2">
            {job.brief && (
              <button onClick={() => act("build")} disabled={busy || !available} className={btn}>
                Retry build
              </button>
            )}
            <button onClick={() => act("reset")} disabled={busy} className={ghost}>
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
