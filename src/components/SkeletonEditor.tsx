"use client";

import { useState } from "react";
import { SkeletonSection, SkeletonHistoryEntry } from "@/lib/types";

interface Addition {
  id: string;
  text: string;
}

interface CommentDraft {
  pointerId: string;
  index: number | null; // null = adding a new comment; N = editing comment at index N
  text: string;
}

interface AdditionEdit {
  heading: string;
  id: string;
  text: string;
}

export function SkeletonEditor({
  sections,
  history,
  onSubmitFeedback,
  onApprove,
  disabled,
}: {
  sections: SkeletonSection[];
  history: SkeletonHistoryEntry[];
  onSubmitFeedback: (message: string) => Promise<boolean>;
  onApprove: () => void;
  disabled?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  // Keyed by pointer id (original pointers) or addition id -- every line can
  // carry any number of independent comments, not just one.
  const [comments, setComments] = useState<Record<string, string[]>>({});
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [deletedOrder, setDeletedOrder] = useState<string[]>([]);
  const [additions, setAdditions] = useState<Record<string, Addition[]>>({});
  const [editingAddition, setEditingAddition] = useState<AdditionEdit | null>(null);
  const [newPointerText, setNewPointerText] = useState<Record<string, string>>({});

  const pointerById = new Map<string, { text: string; heading: string }>();
  for (const s of sections) {
    for (const p of s.pointers) pointerById.set(p.id, { text: p.text, heading: s.heading });
  }

  function resolveRef(id: string): { text: string; heading: string } | undefined {
    const original = pointerById.get(id);
    if (original) return original;
    for (const [heading, list] of Object.entries(additions)) {
      const found = list.find((a) => a.id === id);
      if (found) return { text: found.text, heading };
    }
    return undefined;
  }

  // Pointer ids are regenerated every revision, so there's no stable id to
  // match a round's feedback against this heading -- a plain substring check
  // against the heading name is honest about that (it's "feedback that
  // mentions this section," not a guaranteed pointer-level link) and good
  // enough to browse, since compileFeedback() always writes "(heading)"
  // after every quoted pointer it references.
  function historyForHeading(heading: string): SkeletonHistoryEntry[] {
    return history.filter((h) => h.feedback.includes(`(${heading})`));
  }

  function formatHistoryDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // The one thing this CAN say with certainty, despite no stable pointer
  // ids: if the current text is an exact match for something quoted in the
  // most recent round's feedback, nothing has changed since that comment --
  // there's no ambiguity to guess at. A changed pointer just won't match,
  // which is why this only ever flags "unaddressed," never "addressed."
  const latestFeedback = history[history.length - 1]?.feedback;
  function looksUnaddressed(text: string): boolean {
    return !!latestFeedback && latestFeedback.includes(`"${text}"`);
  }

  function startNewComment(id: string) {
    setCommentDraft({ pointerId: id, index: null, text: "" });
  }

  function startEditComment(id: string, index: number) {
    setCommentDraft({ pointerId: id, index, text: comments[id]?.[index] ?? "" });
  }

  function saveCommentDraft() {
    if (!commentDraft) return;
    const trimmed = commentDraft.text.trim();
    if (!trimmed) {
      setCommentDraft(null);
      return;
    }
    setComments((prev) => {
      const existing = prev[commentDraft.pointerId] ?? [];
      const next =
        commentDraft.index === null
          ? [...existing, trimmed]
          : existing.map((c, i) => (i === commentDraft.index ? trimmed : c));
      return { ...prev, [commentDraft.pointerId]: next };
    });
    setCommentDraft(null);
  }

  function removeComment(id: string, index: number) {
    setComments((prev) => {
      const existing = prev[id] ?? [];
      const next = existing.filter((_, i) => i !== index);
      const copy = { ...prev };
      if (next.length === 0) {
        delete copy[id];
      } else {
        copy[id] = next;
      }
      return copy;
    });
  }

  function deletePointer(pointerId: string) {
    setDeleted((prev) => new Set(prev).add(pointerId));
    setDeletedOrder((prev) => [...prev, pointerId]);
  }

  function undoDelete(pointerId: string) {
    setDeleted((prev) => {
      const next = new Set(prev);
      next.delete(pointerId);
      return next;
    });
    setDeletedOrder((prev) => prev.filter((id) => id !== pointerId));
  }

  function addPointer(heading: string) {
    const text = (newPointerText[heading] ?? "").trim();
    if (!text) return;
    setAdditions((prev) => ({
      ...prev,
      [heading]: [...(prev[heading] ?? []), { id: `new_${Date.now()}_${Math.random()}`, text }],
    }));
    setNewPointerText((prev) => ({ ...prev, [heading]: "" }));
  }

  function removeAddition(heading: string, id: string) {
    setAdditions((prev) => ({
      ...prev,
      [heading]: (prev[heading] ?? []).filter((a) => a.id !== id),
    }));
    setComments((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function startEditAddition(heading: string, id: string, text: string) {
    setEditingAddition({ heading, id, text });
  }

  function saveEditAddition() {
    if (!editingAddition) return;
    const trimmed = editingAddition.text.trim();
    if (!trimmed) {
      setEditingAddition(null);
      return;
    }
    setAdditions((prev) => ({
      ...prev,
      [editingAddition.heading]: (prev[editingAddition.heading] ?? []).map((a) =>
        a.id === editingAddition.id ? { ...a, text: trimmed } : a
      ),
    }));
    setEditingAddition(null);
  }

  const hasPendingEdits =
    Object.values(comments).some((list) => list.length > 0) ||
    deleted.size > 0 ||
    Object.values(additions).some((list) => list.length > 0);

  function compileFeedback(): string {
    const lines: string[] = ["Here's my feedback on the skeleton:"];

    if (deleted.size > 0) {
      lines.push("", "Remove:");
      for (const id of deleted) {
        const p = pointerById.get(id);
        if (p) lines.push(`- "${p.text}" (from ${p.heading})`);
      }
    }

    const commentEntries = Object.entries(comments).filter(([, list]) => list.length > 0);
    if (commentEntries.length > 0) {
      lines.push("", "Comments:");
      for (const [id, list] of commentEntries) {
        const ref = resolveRef(id);
        if (!ref) continue;
        for (const c of list) {
          lines.push(`- On "${ref.text}" (${ref.heading}): ${c}`);
        }
      }
    }

    const additionLines = Object.entries(additions).flatMap(([heading, list]) =>
      list.map((a) => `- To ${heading}: "${a.text}"`)
    );
    if (additionLines.length > 0) {
      lines.push("", "Add:");
      lines.push(...additionLines);
    }

    return lines.join("\n");
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const succeeded = await onSubmitFeedback(compileFeedback());
      // Only clear the edit state once the PM's feedback is actually
      // confirmed saved -- clearing unconditionally meant a failed request
      // (network error, server 500) silently threw away everything they'd
      // marked up, with no way to tell it hadn't gone through.
      if (succeeded) {
        setComments({});
        setDeleted(new Set());
        setDeletedOrder([]);
        setAdditions({});
        setCommentDraft(null);
        setEditingAddition(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function renderComments(id: string) {
    const list = comments[id] ?? [];
    return (
      <>
        {list.map((c, i) =>
          commentDraft?.pointerId === id && commentDraft.index === i ? (
            <div key={i} className="ml-2 mt-1 flex items-center gap-2">
              <input
                autoFocus
                value={commentDraft.text}
                onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
                className="flex-1 rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
              />
              <button
                onClick={saveCommentDraft}
                className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
              >
                Save
              </button>
            </div>
          ) : (
            <div
              key={i}
              className="ml-2 mt-1 flex items-start gap-2 rounded-md border-l-2 border-bb-red bg-bb-surface px-2 py-1 text-xs text-bb-text-secondary"
            >
              <span className="flex-1">💬 {c}</span>
              <button
                onClick={() => startEditComment(id, i)}
                className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
              >
                edit
              </button>
              <button
                onClick={() => removeComment(id, i)}
                className="shrink-0 text-bb-text-tertiary hover:text-bb-red"
              >
                remove
              </button>
            </div>
          )
        )}
        {commentDraft?.pointerId === id && commentDraft.index === null && (
          <div className="ml-2 mt-1 flex items-center gap-2">
            <input
              autoFocus
              value={commentDraft.text}
              onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
              placeholder="Add a comment…"
              className="flex-1 rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
            <button
              onClick={saveCommentDraft}
              className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
            >
              Save
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="w-full space-y-6 px-8 py-6">
      {sections.map((section) => {
        const sectionHistory = historyForHeading(section.heading);
        const historyOpen = openHistoryFor === section.heading;
        return (
        <div key={section.heading} className="rounded-lg border border-bb-border bg-bb-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-bold text-bb-text">{section.heading}</h3>
            {sectionHistory.length > 0 && (
              <button
                onClick={() => setOpenHistoryFor(historyOpen ? null : section.heading)}
                className={`relative flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                  historyOpen ? "bg-bb-red text-white" : "text-bb-text-tertiary hover:text-bb-text"
                }`}
                title={`${sectionHistory.length} round${sectionHistory.length === 1 ? "" : "s"} of feedback on this section`}
              >
                🕐 {sectionHistory.length}
              </button>
            )}
          </div>

          {historyOpen && (
            <div className="mb-3 rounded-lg border border-bb-border-subtle bg-bb-bg p-3">
              <div className="mb-2 text-xs font-semibold text-bb-text">Feedback history</div>
              <div className="space-y-3">
                {sectionHistory.map((h) => (
                  <div key={h.round} className="border-l-2 border-bb-red pl-3">
                    <div className="mb-1 text-[11px] text-bb-text-tertiary">
                      Round {h.round} · {formatHistoryDate(h.at)}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs text-bb-text-secondary">
                      {h.feedback
                        .split("\n")
                        .filter((line) => line.includes(`(${section.heading})`))
                        .join("\n")}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {section.pointers.map((p) => {
              const isDeleted = deleted.has(p.id);
              const unaddressed = !isDeleted && looksUnaddressed(p.text);
              return (
                <li key={p.id}>
                  <div
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                      isDeleted ? "bg-bb-red-dim/40" : "hover:bg-bb-surface"
                    }`}
                  >
                    {unaddressed && (
                      <span
                        className="mt-0.5 shrink-0 text-xs"
                        title="You commented on this last round and the text hasn't changed since"
                      >
                        ⚠️
                      </span>
                    )}
                    <span
                      className={`flex-1 text-sm ${
                        isDeleted ? "text-bb-text-tertiary line-through" : "text-bb-text-secondary"
                      }`}
                    >
                      {p.text}
                    </span>
                    {isDeleted ? (
                      <button
                        onClick={() => undoDelete(p.id)}
                        className="shrink-0 text-xs text-bb-red underline underline-offset-2"
                      >
                        Undo
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => startNewComment(p.id)}
                          className="text-bb-text-tertiary hover:text-bb-text"
                          aria-label="Comment"
                          title="Add a comment"
                        >
                          💬
                        </button>
                        <button
                          onClick={() => deletePointer(p.id)}
                          className="text-bb-text-tertiary hover:text-bb-red"
                          aria-label="Delete"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {!isDeleted && renderComments(p.id)}
                </li>
              );
            })}

            {(additions[section.heading] ?? []).map((a) => (
              <li key={a.id}>
                {editingAddition?.id === a.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingAddition.text}
                      onChange={(e) => setEditingAddition({ ...editingAddition, text: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && saveEditAddition()}
                      className="flex-1 rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-sm text-bb-text focus:border-bb-red focus:outline-none"
                    />
                    <button
                      onClick={saveEditAddition}
                      className="shrink-0 rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 shrink-0 rounded-full bg-bb-green/20 px-1.5 py-0.5 text-[9px] font-semibold text-bb-green">
                      new
                    </span>
                    {/* Same visual language as a comment box (border-l-2 +
                        bg-bb-surface + text "edit"/"remove" links) -- a new
                        pointer is PM-authored, same as a comment, so it gets
                        the same look rather than the old icon-badge treatment. */}
                    <div className="flex flex-1 items-start gap-2 rounded-md border-l-2 border-bb-red bg-bb-surface px-2 py-1.5 text-sm text-bb-text">
                      <span className="flex-1">{a.text}</span>
                      <button
                        onClick={() => startNewComment(a.id)}
                        className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
                        aria-label="Comment"
                        title="Add a comment"
                      >
                        💬
                      </button>
                      <button
                        onClick={() => startEditAddition(section.heading, a.id, a.text)}
                        className="shrink-0 text-xs text-bb-text-tertiary hover:text-bb-text"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => removeAddition(section.heading, a.id)}
                        className="shrink-0 text-xs text-bb-text-tertiary hover:text-bb-red"
                      >
                        remove
                      </button>
                    </div>
                  </div>
                )}
                {renderComments(a.id)}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={newPointerText[section.heading] ?? ""}
              onChange={(e) =>
                setNewPointerText((prev) => ({ ...prev, [section.heading]: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && addPointer(section.heading)}
              placeholder="+ Add a pointer…"
              className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-bb-text placeholder:text-bb-text-tertiary hover:border-bb-border focus:border-bb-red focus:bg-bb-surface focus:outline-none"
            />
            {(newPointerText[section.heading] ?? "").trim() !== "" && (
              <button
                onClick={() => addPointer(section.heading)}
                className="shrink-0 rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white hover:bg-bb-red-hover"
              >
                Add
              </button>
            )}
          </div>
        </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-bb-border-subtle bg-bb-bg px-1 py-2">
        <span className="text-xs text-bb-text-tertiary">
          {disabled
            ? "Working -- expanding into the full PRD can take a few minutes, this isn't stuck."
            : hasPendingEdits
              ? "You have unsent edits below."
              : "No pending edits -- approve to move on, or comment/delete/add pointers above."}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {disabled && (
            <svg
              className="h-4 w-4 shrink-0 animate-spin text-bb-text-tertiary"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
              />
            </svg>
          )}
          <button
            onClick={handleSubmit}
            disabled={disabled || submitting || !hasPendingEdits}
            className="rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit feedback"}
          </button>
          <button
            onClick={onApprove}
            disabled={disabled || hasPendingEdits}
            title={hasPendingEdits ? "Submit or discard pending edits first" : undefined}
            className="rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {disabled ? "Expanding into full PRD…" : "Skeleton looks good — expand to full PRD"}
          </button>
        </div>
      </div>
    </div>
  );
}
