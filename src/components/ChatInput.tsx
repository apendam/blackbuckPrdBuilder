"use client";

import { useState, KeyboardEvent } from "react";

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="shrink-0 border-t border-bb-border-subtle bg-bb-bg px-6 py-4">
      <div className="flex items-end gap-3 rounded-full border border-bb-border bg-bb-surface px-4 py-2">
        <button
          type="button"
          className="shrink-0 text-bb-text-tertiary hover:text-bb-text-secondary"
          aria-label="Attach file"
          disabled={disabled}
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Type your answer..."
          className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-bb-red px-4 py-2 text-xs font-semibold text-white transition hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          SEND
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
