"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DocumentPanel } from "@/components/DocumentPanel";
import { ChatMessage as ChatMessageBubble } from "@/components/ChatMessage";
import type { ConversationView } from "@/lib/conversations";
import { PHASE_LABELS } from "@/lib/types";

type DiffPart = { added: boolean; removed: boolean; value: string };
type ViewMode = "prd" | "transcript" | "diff" | "activity" | "notes";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PrdViewerClient({
  conversation,
  content,
  versions,
  userName,
  userEmail,
  signOutAction,
}: {
  conversation: ConversationView;
  content: string;
  versions: ConversationView[];
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("prd");
  const [revising, setRevising] = useState(false);
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const [diffParts, setDiffParts] = useState<DiffPart[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [notes, setNotes] = useState(conversation.notes);
  const [notesSaved, setNotesSaved] = useState(true);

  async function revise() {
    setRevising(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/revise`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/chat/${data.conversation.id}`);
    } finally {
      setRevising(false);
    }
  }

  async function archive() {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    router.push("/");
  }

  async function loadDiff(againstId: string) {
    setDiffAgainst(againstId);
    setDiffLoading(true);
    setMode("diff");
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/diff?against=${againstId}`);
      const data = await res.json();
      if (res.ok) setDiffParts(data.parts);
    } finally {
      setDiffLoading(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(conversation.title || "prd").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-v${conversation.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    setMode("prd");
    // Let the mode switch render before the print dialog opens.
    setTimeout(() => window.print(), 50);
  }

  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesSaved(false);
    clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(async () => {
      await fetch(`/api/conversations/${conversation.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      setNotesSaved(true);
    }, 600);
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="print:hidden">
        <AppHeader userName={userName} userEmail={userEmail} signOutAction={signOutAction} />
      </div>
      <div className="flex items-center justify-between border-b border-bb-border-subtle bg-bb-panel px-8 py-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-bb-text">
              {conversation.title || "(untitled PRD)"}
            </h1>
            <span className="rounded-full bg-bb-surface px-2 py-0.5 text-[10px] text-bb-text-tertiary">
              v{conversation.version}
            </span>
            {conversation.status === "archived" && (
              <span className="rounded-full bg-bb-red-dim px-2 py-0.5 text-[10px] text-bb-text">
                archived
              </span>
            )}
          </div>
          {conversation.googleDocUrl && (
            <a
              href={conversation.googleDocUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-bb-red underline underline-offset-2"
            >
              Open Google Doc ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            ← Dashboard
          </Link>
          <button
            onClick={downloadMarkdown}
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            Download .md
          </button>
          <button
            onClick={exportPdf}
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            Export PDF
          </button>
          <button
            onClick={revise}
            disabled={revising}
            className="rounded-full bg-bb-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:opacity-50"
          >
            {revising ? "Starting revision…" : "Revise as new version"}
          </button>
          {conversation.status !== "archived" && (
            <button
              onClick={archive}
              className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-bb-border-subtle bg-bb-bg px-8 py-2 print:hidden">
        <div className="flex gap-1">
          {(["prd", "transcript", "activity", "notes"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                mode === m ? "bg-bb-red text-white" : "text-bb-text-tertiary hover:text-bb-text-secondary"
              }`}
            >
              {m === "prd" ? "PRD" : m === "transcript" ? "Conversation" : m}
            </button>
          ))}
        </div>

        {versions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-bb-text-tertiary">
            <span>Versions:</span>
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                {v.id === conversation.id ? (
                  <span className="font-semibold text-bb-text">v{v.version} (this)</span>
                ) : (
                  <>
                    <Link href={`/prd/${v.id}`} className="text-bb-red underline underline-offset-2">
                      v{v.version}
                    </Link>
                    {v.prdMarkdownPath && (
                      <button
                        onClick={() => loadDiff(v.id)}
                        className="text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
                      >
                        (diff)
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {mode === "prd" && (
          <div className="prd-print-area">
            <DocumentPanel content={content} />
          </div>
        )}

        {mode === "transcript" && (
          <div className="mx-auto max-w-2xl space-y-4 px-8 py-8 print:hidden">
            {conversation.messages.map((m, i) => (
              <ChatMessageBubble key={i} message={m} />
            ))}
          </div>
        )}

        {mode === "activity" && (
          <div className="mx-auto max-w-2xl px-8 py-8 print:hidden">
            <h2 className="mb-4 text-sm font-bold text-bb-text">Phase activity log</h2>
            {conversation.phaseLog.length === 0 && (
              <p className="text-sm text-bb-text-tertiary">No phase transitions recorded yet.</p>
            )}
            <ol className="relative space-y-4">
              {conversation.phaseLog.map((entry, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-bb-red" />
                  <span className="text-sm text-bb-text">{PHASE_LABELS[entry.phase]}</span>
                  <span className="text-xs text-bb-text-tertiary">{formatTimestamp(entry.at)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 text-xs text-bb-text-tertiary">
              Created {formatTimestamp(conversation.createdAt)}
              {conversation.completedAt && ` · Completed ${formatTimestamp(conversation.completedAt)}`}
            </div>
          </div>
        )}

        {mode === "notes" && (
          <div className="mx-auto max-w-2xl px-8 py-8 print:hidden">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-bb-text">Your notes</h2>
              <span className="text-xs text-bb-text-tertiary">
                {notesSaved ? "saved" : "saving…"}
              </span>
            </div>
            <p className="mb-3 text-xs text-bb-text-tertiary">
              Scratch space for yourself -- never sent to the model, not part of the PRD.
            </p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={16}
              placeholder="Brainstorming, reminders, things to follow up on…"
              className="w-full rounded-md border border-bb-border bg-bb-surface p-3 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
          </div>
        )}

        {mode === "diff" && (
          <div className="mx-auto max-w-3xl px-8 py-8 print:hidden">
            <div className="mb-3 text-xs text-bb-text-tertiary">
              Comparing this version against v
              {versions.find((v) => v.id === diffAgainst)?.version ?? "?"} (red = removed, green =
              added)
            </div>
            {diffLoading && <div className="text-xs text-bb-text-tertiary">Loading diff…</div>}
            {!diffLoading && diffParts && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-bb-border bg-bb-surface p-4 font-mono text-xs leading-relaxed">
                {diffParts.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added
                        ? "bg-bb-green/20 text-bb-green"
                        : part.removed
                          ? "bg-bb-red-dim text-bb-red"
                          : "text-bb-text-secondary"
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
