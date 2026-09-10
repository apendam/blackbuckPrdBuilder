import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage as ChatMessageType, Phase } from "@/lib/types";
import { costForBreakdown, costForModel, formatCost, formatTokenCount } from "@/lib/pricing";

function TruckAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bb-red">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 16V7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9M3 16h11M3 16a2 2 0 1 0 4 0M14 16a2 2 0 1 0 4 0M14 10h4l3 3v3h-2"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Prose({ content, invert }: { content: string; invert?: boolean }) {
  return (
    <div
      className={`text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
        invert ? "text-bb-bg" : "text-bb-text"
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3">{children}</p>,
          strong: ({ children }) => (
            <strong className={invert ? "font-semibold" : "font-semibold text-white"}>{children}</strong>
          ),
          ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-bold">{children}</h4>,
          code: ({ children }) => (
            <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[13px]">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-[13px]">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline decoration-bb-red underline-offset-2">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-bb-border px-2 py-1.5 font-semibold text-bb-text-secondary">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-bb-border-subtle px-2 py-1.5">{children}</td>,
          hr: () => <hr className="my-3 border-bb-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AttachmentChips({ attachments, invert }: { attachments: NonNullable<ChatMessageType["attachments"]>; invert?: boolean }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <span
          key={a.name}
          className={`rounded-full border px-2 py-0.5 text-[11px] ${
            invert
              ? "border-bb-bg/20 text-bb-bg/70"
              : "border-bb-border text-bb-text-tertiary"
          }`}
        >
          📎 {a.name}
        </span>
      ))}
    </div>
  );
}

function formatTimestamp(at?: string): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatUsage(usage?: ChatMessageType["usage"]): { label: string; title: string } | null {
  if (!usage) return null;
  const total = usage.inputTokens + usage.outputTokens;
  const byModel = usage.byModel ?? [];
  const cost = costForBreakdown(byModel);
  const titleLines = [`${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`];
  if (byModel.length > 1) {
    titleLines.push(
      ...byModel.map(
        (m) =>
          `  ${m.model}: ${m.inputTokens.toLocaleString()} in / ${m.outputTokens.toLocaleString()} out (${formatCost(
            costForModel(m.provider, m.model, m.inputTokens, m.outputTokens)
          )})`
      )
    );
  }
  return {
    label: `${formatTokenCount(total)} tokens · ${formatCost(cost)}`,
    title: titleLines.join("\n"),
  };
}

function MetaLine({ message, align }: { message: ChatMessageType; align: "start" | "end" }) {
  const timestamp = formatTimestamp(message.at);
  const usage = formatUsage(message.usage);
  if (!timestamp && !usage) return null;
  return (
    <div
      className={`mt-1 flex items-center gap-1.5 text-[10px] text-bb-text-tertiary ${
        align === "end" ? "pr-1" : "pl-1"
      }`}
    >
      {timestamp && <span>{timestamp}</span>}
      {timestamp && usage && <span>·</span>}
      {usage && <span title={usage.title}>{usage.label}</span>}
    </div>
  );
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-bb-text px-4 py-3">
          <Prose content={message.content} invert />
          <AttachmentChips attachments={message.attachments ?? []} invert />
        </div>
        <MetaLine message={message} align="end" />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <TruckAvatar />
      <div className="flex flex-col items-start">
        <div className="max-w-[75%] rounded-lg border-l-[3px] border-bb-red bg-bb-surface px-4 py-3">
          <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-red">
            PRD BUILDER
          </div>
          <Prose content={message.content} />
        </div>
        <MetaLine message={message} align="start" />
      </div>
    </div>
  );
}

// There's no real "% complete" to show here -- turns are non-streaming
// (nothing renders until the whole reply is back), and this app's turns can
// legitimately span many sequential tool-call rounds, so there's no total to
// measure progress against either. A fabricated percentage would just be a
// made-up number moving on a timer, which is worse than no number at all.
// What's actually true and worth showing: elapsed time, plus an honest
// "this phase is normally slower" hint so a long wait doesn't read as stuck.
const LONG_PHASES: Phase[] = ["context_loading", "full_prd"];

export function TypingIndicator({ phase }: { phase?: Phase }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const isLongPhase = phase ? LONG_PHASES.includes(phase) : false;
  let status: string | null = null;
  if (elapsed >= 40) {
    status = isLongPhase
      ? "Still going -- a thorough full PRD can take a couple of minutes"
      : "Still working -- this is taking longer than usual";
  } else if (elapsed >= 12) {
    status = isLongPhase ? "Working through it -- this phase runs long" : "Still thinking";
  }

  return (
    <div className="flex items-start gap-3">
      <TruckAvatar />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 rounded-lg border-l-[3px] border-bb-red bg-bb-surface px-4 py-3.5">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-bb-text-tertiary" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-bb-text-tertiary" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-bb-text-tertiary" />
        </div>
        {elapsed >= 5 && (
          <div className="pl-1 text-[10px] text-bb-text-tertiary">
            {status ? `${status} · ${elapsed}s` : `${elapsed}s`}
          </div>
        )}
      </div>
    </div>
  );
}
