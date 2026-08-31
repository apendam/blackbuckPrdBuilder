"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RefreshReposModal } from "@/components/RefreshReposModal";
import type { ConversationView } from "@/lib/conversations";
import { PHASE_LABELS, VERTICALS } from "@/lib/types";

type Tab = "drafts" | "completed" | "archived";
type Sort = "updated" | "created";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DashboardClient({
  userName,
  userEmail,
  signOutAction,
  initialDrafts,
  initialCompleted,
  initialArchived,
}: {
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
  initialDrafts: ConversationView[];
  initialCompleted: ConversationView[];
  initialArchived: ConversationView[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialDrafts.length > 0 ? "drafts" : "completed");
  const [drafts, setDrafts] = useState(initialDrafts);
  const [completed, setCompleted] = useState(initialCompleted);
  const [archived, setArchived] = useState(initialArchived);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedVerticals, setSelectedVerticals] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("updated");
  const [verticalPickerOpen, setVerticalPickerOpen] = useState(false);

  async function startNewPrd() {
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function useAsTemplate(id: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: id }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/chat/${data.conversation.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Delete this draft? This can't be undone.")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setDrafts((prev) => prev.filter((c) => c.id !== id));
  }

  async function archive(id: string, from: "completed") {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (from === "completed") {
      const item = completed.find((c) => c.id === id);
      setCompleted((prev) => prev.filter((c) => c.id !== id));
      if (item) setArchived((prev) => [{ ...item, status: "archived" }, ...prev]);
    }
  }

  async function unarchive(id: string) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    const item = archived.find((c) => c.id === id);
    setArchived((prev) => prev.filter((c) => c.id !== id));
    if (item) setCompleted((prev) => [{ ...item, status: "completed" }, ...prev]);
  }

  async function permanentlyDelete(id: string) {
    if (!confirm("Permanently delete this completed PRD and its record? This can't be undone."))
      return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setArchived((prev) => prev.filter((c) => c.id !== id));
  }

  function toggleVertical(v: string) {
    setSelectedVerticals((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  const baseRows = tab === "drafts" ? drafts : tab === "completed" ? completed : archived;

  const rows = useMemo(() => {
    let filtered = baseRows;
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter((c) => (c.title ?? "").toLowerCase().includes(q));
    }
    if (selectedVerticals.size > 0) {
      filtered = filtered.filter((c) => c.verticals.some((v) => selectedVerticals.has(v)));
    }
    return [...filtered].sort((a, b) => {
      const field = sort === "created" ? "createdAt" : "updatedAt";
      return new Date(b[field]).getTime() - new Date(a[field]).getTime();
    });
  }, [baseRows, query, selectedVerticals, sort]);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        signOutAction={signOutAction}
        onRefreshClick={() => setRefreshOpen(true)}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-bb-text">Your PRDs</h1>
          <button
            onClick={startNewPrd}
            disabled={creating}
            className="rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:opacity-50"
          >
            {creating ? "Starting…" : "+ New PRD"}
          </button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-bb-border-subtle">
          {(["drafts", "completed", "archived"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-xs font-semibold capitalize ${
                tab === t
                  ? "border-bb-red text-bb-text"
                  : "border-transparent text-bb-text-tertiary hover:text-bb-text-secondary"
              }`}
            >
              {t} (
              {t === "drafts" ? drafts.length : t === "completed" ? completed.length : archived.length}
              )
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
          />
          <div className="relative">
            <button
              onClick={() => setVerticalPickerOpen((o) => !o)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                selectedVerticals.size > 0
                  ? "border-bb-red text-bb-text"
                  : "border-bb-border text-bb-text-secondary"
              } hover:border-bb-red`}
            >
              Vertical{selectedVerticals.size > 0 ? ` (${selectedVerticals.size})` : ""}
            </button>
            {verticalPickerOpen && (
              <div className="absolute left-0 top-9 z-10 w-48 rounded-md border border-bb-border bg-bb-panel p-2 shadow-lg">
                {VERTICALS.map((v) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-bb-text hover:bg-bb-surface"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVerticals.has(v)}
                      onChange={() => toggleVertical(v)}
                      className="accent-bb-red"
                    />
                    {v}
                  </label>
                ))}
              </div>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-bb-border bg-bb-surface px-3 py-1.5 text-xs text-bb-text focus:border-bb-red focus:outline-none"
          >
            <option value="updated">Last updated</option>
            <option value="created">Date created</option>
          </select>
        </div>

        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-bb-border px-6 py-10 text-center text-sm text-bb-text-tertiary">
            {baseRows.length === 0
              ? tab === "drafts"
                ? "No drafts in progress."
                : `No ${tab} PRDs yet.`
              : "Nothing matches those filters."}
          </div>
        )}

        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-bb-border bg-bb-panel px-4 py-3 hover:border-bb-red/50"
            >
              <button
                className="flex-1 text-left"
                onClick={() =>
                  router.push(tab === "completed" || tab === "archived" ? `/prd/${c.id}` : `/chat/${c.id}`)
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-bb-text">
                    {c.title || "(untitled draft)"}
                  </span>
                  {c.version > 1 && (
                    <span className="rounded-full bg-bb-surface px-2 py-0.5 text-[10px] text-bb-text-tertiary">
                      v{c.version}
                    </span>
                  )}
                  {c.verticals.map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-bb-border px-2 py-0.5 text-[10px] text-bb-text-tertiary"
                    >
                      {v}
                    </span>
                  ))}
                </div>
                <div className="mt-0.5 text-xs text-bb-text-tertiary">
                  {tab === "drafts" ? PHASE_LABELS[c.currentPhase] : "Completed"} · updated{" "}
                  {timeAgo(c.updatedAt)}
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-2">
                {tab === "drafts" && (
                  <button
                    onClick={() => deleteDraft(c.id)}
                    className="rounded-md px-2 py-1 text-xs text-bb-text-tertiary hover:bg-bb-red-dim hover:text-bb-text"
                  >
                    Delete
                  </button>
                )}
                {tab === "completed" && (
                  <>
                    <button
                      onClick={() => useAsTemplate(c.id)}
                      disabled={creating}
                      className="rounded-md px-2 py-1 text-xs text-bb-text-tertiary hover:bg-bb-surface hover:text-bb-text"
                    >
                      Use as template
                    </button>
                    <button
                      onClick={() => archive(c.id, "completed")}
                      className="rounded-md px-2 py-1 text-xs text-bb-text-tertiary hover:bg-bb-surface hover:text-bb-text"
                    >
                      Archive
                    </button>
                  </>
                )}
                {tab === "archived" && (
                  <>
                    <button
                      onClick={() => unarchive(c.id)}
                      className="rounded-md px-2 py-1 text-xs text-bb-text-tertiary hover:bg-bb-surface hover:text-bb-text"
                    >
                      Unarchive
                    </button>
                    <button
                      onClick={() => permanentlyDelete(c.id)}
                      className="rounded-md px-2 py-1 text-xs text-bb-text-tertiary hover:bg-bb-red-dim hover:text-bb-text"
                    >
                      Delete permanently
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {refreshOpen && <RefreshReposModal onClose={() => setRefreshOpen(false)} />}
    </div>
  );
}
