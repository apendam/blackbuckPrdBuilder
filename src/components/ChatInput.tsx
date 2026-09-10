"use client";

import { useEffect, useRef, useState, KeyboardEvent, ChangeEvent } from "react";
import { Attachment } from "@/lib/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,.csv";
const MIN_TEXTAREA_HEIGHT = 40;
const MAX_TEXTAREA_HEIGHT = 160;
const BULLET_LINE = /^(\s*)([-*•])(\s+)/;
const NUMBERED_LINE = /^(\s*)(\d+)([.)])(\s+)/;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:<mime>;base64,<data> -- strip the prefix
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
  }, [value]);

  async function submit() {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled || sending) return;
    setSending(true);
    try {
      // Only clear the box once the send actually succeeds -- clearing
      // unconditionally meant a failed request (network error, API outage,
      // out-of-credits) silently threw away whatever the PM had just typed.
      const succeeded = await onSend(trimmed, attachments);
      if (succeeded) {
        setValue("");
        setAttachments([]);
      }
    } finally {
      setSending(false);
    }
  }

  function insertNewlineAtCursor(el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lineStart = before.lastIndexOf("\n") + 1;
    const currentLine = before.slice(lineStart);

    const bulletMatch = currentLine.match(BULLET_LINE);
    const numberedMatch = currentLine.match(NUMBERED_LINE);
    const match = bulletMatch ?? numberedMatch;

    if (match && currentLine.slice(match[0].length).trim() === "") {
      // Enter on an empty list item -- drop the marker and exit the list.
      const next = before.slice(0, lineStart) + after;
      setValue(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = lineStart;
      });
      return;
    }

    let insertion = "\n";
    if (bulletMatch) {
      const [, indent, marker] = bulletMatch;
      insertion = `\n${indent}${marker} `;
    } else if (numberedMatch) {
      const [, indent, num, sep] = numberedMatch;
      insertion = `\n${indent}${Number(num) + 1}${sep} `;
    }

    const next = before + insertion + after;
    setValue(next);
    const newCursor = start + insertion.length;
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = newCursor;
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.altKey) {
      e.preventDefault();
      insertNewlineAtCursor(e.currentTarget);
      return;
    }
    e.preventDefault();
    submit();
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file later
    if (files.length === 0) return;

    setAttachError(null);
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setAttachError(`${tooBig.name} is over the 15MB limit`);
      return;
    }

    setAttaching(true);
    try {
      const encoded = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          mediaType: f.type || "application/octet-stream",
          base64: await readFileAsBase64(f),
        }))
      );
      setAttachments((prev) => [...prev, ...encoded]);
    } catch {
      setAttachError("Failed to read one or more files");
    } finally {
      setAttaching(false);
    }
  }

  function removeAttachment(name: string) {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  }

  return (
    <div className="shrink-0 border-t border-bb-border-subtle bg-bb-bg px-6 py-4">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.name}
              className="flex items-center gap-2 rounded-full border border-bb-border bg-bb-surface px-3 py-1 text-xs text-bb-text-secondary"
            >
              <span className="max-w-[160px] truncate">{a.name}</span>
              <button
                onClick={() => removeAttachment(a.name)}
                className="text-bb-text-tertiary hover:text-bb-text"
                aria-label={`Remove ${a.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {attachError && <div className="mb-2 text-xs text-bb-red">{attachError}</div>}

      <div className="flex items-end gap-3 rounded-full border border-bb-border bg-bb-surface px-4 py-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleFiles}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 text-bb-text-tertiary hover:text-bb-text-secondary disabled:opacity-40"
          aria-label="Attach file"
          disabled={disabled || attaching}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5l-8.5 8.5a4 4 0 0 1-5.66-5.66l8.49-8.49a2.5 2.5 0 0 1 3.54 3.54l-8.13 8.13a1 1 0 0 1-1.41-1.41l7.42-7.43"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Type your answer..."
          style={{ height: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
          className="flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || attaching || (!value.trim() && attachments.length === 0)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white transition hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {attaching ? "..." : "SEND"}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
