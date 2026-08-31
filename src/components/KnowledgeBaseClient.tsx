"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DocumentPanel } from "@/components/DocumentPanel";
import { VERTICALS, VERTICAL_FILENAMES } from "@/lib/types";

interface FlowInfo {
  path: string;
  file: string;
  title: string;
  status: string | null;
  lastVerified: string | null;
  staleDays: number | null;
}

const STALE_THRESHOLD_DAYS = 90;

export function KnowledgeBaseClient({
  userName,
  userEmail,
  signOutAction,
}: {
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [selectedPath, setSelectedPath] = useState("system-map/README.md");
  const [content, setContent] = useState<string>("Loading…");
  const [flows, setFlows] = useState<FlowInfo[]>([]);

  useEffect(() => {
    fetch("/api/knowledge-base/flows")
      .then((r) => r.json())
      .then((data) => setFlows(data.flows ?? []))
      .catch(() => setFlows([]));
  }, []);

  useEffect(() => {
    setContent("Loading…");
    fetch(`/api/knowledge-base/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then((data) => setContent(data.content ?? "_Not found._"))
      .catch(() => setContent("_Failed to load._"));
  }, [selectedPath]);

  function NavButton({ path, label, badge }: { path: string; label: string; badge?: React.ReactNode }) {
    const active = path === selectedPath;
    return (
      <button
        onClick={() => setSelectedPath(path)}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
          active ? "bg-bb-red text-white" : "text-bb-text-secondary hover:bg-bb-surface hover:text-bb-text"
        }`}
      >
        <span className="truncate">{label}</span>
        {badge}
      </button>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <AppHeader userName={userName} userEmail={userEmail} signOutAction={signOutAction} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-bb-border-subtle bg-bb-panel px-4 py-5">
          <Link
            href="/"
            className="mb-4 inline-block text-xs text-bb-text-tertiary hover:text-bb-text-secondary"
          >
            ← Dashboard
          </Link>
          <h1 className="mb-4 text-sm font-bold text-bb-text">Knowledge Base</h1>

          <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-text-tertiary">
            SYSTEM MAP
          </div>
          <div className="mb-4 space-y-0.5">
            <NavButton path="system-map/README.md" label="Repo index & flow index" />
          </div>

          <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-text-tertiary">
            CROSS-REPO FLOWS
          </div>
          <div className="mb-4 space-y-0.5">
            {flows.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-bb-text-tertiary">None yet</div>
            )}
            {flows.map((f) => (
              <NavButton
                key={f.path}
                path={f.path}
                label={f.title}
                badge={
                  f.staleDays !== null && f.staleDays > STALE_THRESHOLD_DAYS ? (
                    <span className="shrink-0 rounded-full bg-bb-red-dim px-1.5 py-0.5 text-[9px] text-bb-text">
                      stale
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>

          <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-text-tertiary">
            VERTICALS
          </div>
          <div className="space-y-0.5">
            {VERTICALS.map((v) => (
              <NavButton key={v} path={`verticals/${VERTICAL_FILENAMES[v]}`} label={v} />
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {flows.find((f) => f.path === selectedPath)?.staleDays !== undefined &&
            (flows.find((f) => f.path === selectedPath)?.staleDays ?? 0) > STALE_THRESHOLD_DAYS && (
              <div className="border-b border-bb-red bg-bb-red-dim px-10 py-2 text-xs text-bb-text">
                This flow was last verified{" "}
                {flows.find((f) => f.path === selectedPath)?.staleDays} days ago (
                {flows.find((f) => f.path === selectedPath)?.lastVerified}) — past the 90-day
                staleness window. Treat it as a lead to re-verify, not settled fact.
              </div>
            )}
          <DocumentPanel content={content} />
        </main>
      </div>
    </div>
  );
}
