import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function DocumentPanel({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-3xl px-10 py-10 text-bb-text [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-8 text-2xl font-bold text-bb-text">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-7 border-b border-bb-border-subtle pb-2 text-xl font-bold text-bb-text">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-bold text-bb-text">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-4 text-sm leading-relaxed text-bb-text-secondary">{children}</p>
          ),
          strong: ({ children }) => <strong className="font-semibold text-bb-text">{children}</strong>,
          ul: ({ children }) => (
            <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-bb-text-secondary">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm text-bb-text-secondary">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-bb-surface px-1.5 py-0.5 font-mono text-[13px] text-bb-text">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-4 overflow-x-auto rounded-md border border-bb-border bg-bb-surface p-4 font-mono text-[13px] text-bb-text">
              {children}
            </pre>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-bb-red underline decoration-bb-red underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-md border border-bb-border">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bb-surface">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-bb-border px-3 py-2 font-semibold text-bb-text">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-bb-border-subtle px-3 py-2 text-bb-text-secondary">
              {children}
            </td>
          ),
          hr: () => <hr className="my-6 border-bb-border" />,
          blockquote: ({ children }) => (
            <blockquote className="mb-4 border-l-2 border-bb-red pl-4 text-sm text-bb-text-tertiary">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
