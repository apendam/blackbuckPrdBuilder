"use client";

import { isValidElement, memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/MermaidDiagram";

interface DiagramResult {
  svg: string | null;
  error: string | null;
}

const MERMAID_FENCE = /```mermaid\n([\s\S]*?)```/g;

function extractMermaidSources(content: string): string[] {
  const sources = new Set<string>();
  for (const match of content.matchAll(MERMAID_FENCE)) {
    sources.add(match[1].replace(/\n$/, ""));
  }
  return Array.from(sources);
}

let mermaidInitialized: Promise<void> | null = null;
function initMermaidOnce(): Promise<void> {
  if (!mermaidInitialized) {
    mermaidInitialized = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          primaryColor: "#2a1414",
          primaryBorderColor: "#e5484d",
          primaryTextColor: "#f2f2f2",
          lineColor: "#8a8a8a",
          secondaryColor: "#1a1a1a",
          tertiaryColor: "#1a1a1a",
          fontSize: "14px",
        },
        flowchart: { curve: "basis" },
        securityLevel: "strict",
      });
    });
  }
  return mermaidInitialized;
}

// Every diagram in the document is rendered to its final SVG up front,
// before any of the content is shown, instead of each diagram popping in
// independently once its own async render resolves. That staggered pop-in
// used to shift the whole page's layout well after it first appeared --
// exactly the kind of shift that hijacks an in-progress text selection drag
// (the point under the cursor moves as content reflows underneath it,
// silently growing the selection or jumping the scroll position). Resolving
// everything before the page is interactive removes the shift entirely.
function useDiagramCache(content: string): Map<string, DiagramResult> | null {
  const [cache, setCache] = useState<Map<string, DiagramResult> | null>(null);

  useEffect(() => {
    const sources = extractMermaidSources(content);
    if (sources.length === 0) {
      setCache(new Map());
      return;
    }
    let cancelled = false;
    setCache(null);
    (async () => {
      await initMermaidOnce();
      const { default: mermaid } = await import("mermaid");
      const entries = await Promise.all(
        sources.map(async (source, i): Promise<[string, DiagramResult]> => {
          try {
            const { svg } = await mermaid.render(`mmd-${i}-${Date.now()}`, source);
            return [source, { svg, error: null }];
          } catch (err) {
            return [source, { svg: null, error: err instanceof Error ? err.message : "Failed to render diagram" }];
          }
        })
      );
      if (!cancelled) setCache(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  return cache;
}

// memo() is load-bearing, not an optimization: PrdCommentLayer re-renders on
// every keystroke and every selection popup open/close, and without this,
// react-markdown's `components` object below is a brand-new set of function
// references on each of those renders -- React treats that as a changed
// component type and fully unmounts+remounts the whole document's DOM nodes,
// which silently clears the browser's native text selection a moment after
// the PM makes it (the comment popup survives because it's separate state,
// but the actual highlight never gets a chance to stay visible). Since
// `content` is a stable string reference from the parent, this makes
// DocumentPanel skip re-rendering entirely for state changes that have
// nothing to do with it. `onReady` is compared out below (see the custom
// memo comparator) rather than relied on to be a stable reference -- a
// caller re-rendering with a fresh inline callback each time must not
// defeat this memoization the same way the unstable `components` object did.
export const DocumentPanel = memo(
  function DocumentPanel({ content, onReady }: { content: string; onReady?: () => void }) {
    const diagramCache = useDiagramCache(content);

    useEffect(() => {
      if (diagramCache) onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diagramCache]);

    if (!diagramCache) {
      return (
        <div className="flex h-64 items-center justify-center text-sm text-bb-text-tertiary">
          Rendering diagrams…
        </div>
      );
  }

  return (
    <div className="w-full px-10 py-10 text-bb-text [&>*:first-child]:mt-0">
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
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") {
              const source = String(children).replace(/\n$/, "");
              const result = diagramCache.get(source);
              return <MermaidDiagram source={source} svg={result?.svg ?? null} error={result?.error ?? null} />;
            }
            return (
              <code className="rounded bg-bb-surface px-1.5 py-0.5 font-mono text-[13px] text-bb-text">
                {children}
              </code>
            );
          },
          // A rendered Mermaid diagram already brings its own bordered
          // container -- wrapping it in the plain-code <pre> box too would
          // double-box it, so pass it through untouched when that's what the
          // code override above produced.
          pre: ({ children }) =>
            isValidElement(children) && children.type === MermaidDiagram ? (
              <>{children}</>
            ) : (
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
  },
  (prev, next) => prev.content === next.content
);
