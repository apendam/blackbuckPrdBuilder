"use client";

import { useState } from "react";
import { SkeletonSection } from "@/lib/types";

interface Addition {
  id: string;
  text: string;
}

export function SkeletonEditor({
  sections,
  onSubmitFeedback,
  onApprove,
  disabled,
}: {
  sections: SkeletonSection[];
  onSubmitFeedback: (message: string) => void;
  onApprove: () => void;
  disabled?: boolean;
}) {
  const [comments, setComments] = useState<Record<string, string>>({});
  const [commentDraftFor, setCommentDraftFor] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [deletedOrder, setDeletedOrder] = useState<string[]>([]);
  const [additions, setAdditions] = useState<Record<string, Addition[]>>({});
  const [newPointerText, setNewPointerText] = useState<Record<string, string>>({});

  const pointerById = new Map<string, { text: string; heading: string }>();
  for (const s of sections) {
    for (const p of s.pointers) pointerById.set(p.id, { text: p.text, heading: s.heading });
  }

  function startComment(pointerId: string) {
    setCommentDraftFor(pointerId);
    setDraftText(comments[pointerId] ?? "");
  }

  function saveComment() {
    if (!commentDraftFor) return;
    setComments((prev) => ({ ...prev, [commentDraftFor]: draftText.trim() }));
    setCommentDraftFor(null);
    setDraftText("");
  }

  function removeComment(pointerId: string) {
    setComments((prev) => {
      const next = { ...prev };
      delete next[pointerId];
      return next;
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
  }

  const hasPendingEdits =
    Object.keys(comments).length > 0 ||
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
    if (Object.keys(comments).length > 0) {
      lines.push("", "Comments:");
      for (const [id, comment] of Object.entries(comments)) {
        if (!comment) continue;
        const p = pointerById.get(id);
        if (p) lines.push(`- On "${p.text}" (${p.heading}): ${comment}`);
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

  function handleSubmit() {
    onSubmitFeedback(compileFeedback());
    setComments({});
    setDeleted(new Set());
    setDeletedOrder([]);
    setAdditions({});
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-8 py-6">
      {sections.map((section) => (
        <div key={section.heading} className="rounded-lg border border-bb-border bg-bb-panel p-4">
          <h3 className="mb-3 text-sm font-bold text-bb-text">{section.heading}</h3>
          <ul className="space-y-2">
            {section.pointers.map((p) => {
              const isDeleted = deleted.has(p.id);
              return (
                <li key={p.id}>
                  <div
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                      isDeleted ? "bg-bb-red-dim/40" : "hover:bg-bb-surface"
                    }`}
                  >
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
                          onClick={() => startComment(p.id)}
                          className="text-bb-text-tertiary hover:text-bb-text"
                          aria-label="Comment"
                          title="Comment"
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

                  {comments[p.id] && commentDraftFor !== p.id && (
                    <div className="ml-2 mt-1 flex items-start gap-2 rounded-md border-l-2 border-bb-red bg-bb-surface px-2 py-1 text-xs text-bb-text-secondary">
                      <span className="flex-1">💬 {comments[p.id]}</span>
                      <button
                        onClick={() => startComment(p.id)}
                        className="text-bb-text-tertiary hover:text-bb-text"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => removeComment(p.id)}
                        className="text-bb-text-tertiary hover:text-bb-red"
                      >
                        remove
                      </button>
                    </div>
                  )}

                  {commentDraftFor === p.id && (
                    <div className="ml-2 mt-1 flex items-center gap-2">
                      <input
                        autoFocus
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveComment()}
                        placeholder="Add a comment…"
                        className="flex-1 rounded-md border border-bb-border bg-bb-surface px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
                      />
                      <button
                        onClick={saveComment}
                        className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </li>
              );
            })}

            {(additions[section.heading] ?? []).map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md bg-bb-red-dim/20 px-2 py-1.5">
                <span className="flex-1 text-sm text-bb-text">{a.text}</span>
                <span className="text-[10px] text-bb-green">new</span>
                <button
                  onClick={() => removeAddition(section.heading, a.id)}
                  className="text-bb-text-tertiary hover:text-bb-red"
                >
                  ✕
                </button>
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
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-bb-border-subtle bg-bb-bg px-1 py-2">
        <span className="text-xs text-bb-text-tertiary">
          {hasPendingEdits
            ? "You have unsent edits below."
            : "No pending edits -- approve to move on, or comment/delete/add pointers above."}
        </span>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={handleSubmit}
            disabled={disabled || !hasPendingEdits}
            className="rounded-full border border-bb-border px-4 py-2 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit feedback
          </button>
          <button
            onClick={onApprove}
            disabled={disabled || hasPendingEdits}
            title={hasPendingEdits ? "Submit or discard pending edits first" : undefined}
            className="rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Skeleton looks good — expand to full PRD
          </button>
        </div>
      </div>
    </div>
  );
}
