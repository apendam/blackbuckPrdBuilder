import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage as ChatMessageType } from "@/lib/types";

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

export function ChatMessage({ message }: { message: ChatMessageType }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-bb-text px-4 py-3">
          <Prose content={message.content} invert />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <TruckAvatar />
      <div className="max-w-[75%] rounded-lg border-l-[3px] border-bb-red bg-bb-surface px-4 py-3">
        <div className="mb-1 text-[10px] font-semibold tracking-widest text-bb-red">
          PRD BUILDER
        </div>
        <Prose content={message.content} />
      </div>
    </div>
  );
}
