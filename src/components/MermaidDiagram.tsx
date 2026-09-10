"use client";

// Purely presentational -- DocumentPanel pre-renders every diagram in the
// document up front (see its diagramCache) and passes the already-computed
// result in. Rendering diagrams here independently, on a staggered
// per-component timer, used to make each one pop in at its real (often much
// taller) height well after the page first showed -- a layout shift that
// could land mid-drag while the PM was selecting text elsewhere, silently
// growing the selection or jumping the scroll position underneath their
// cursor. Pre-computing everything before the page is interactive removes
// that shift entirely.
export function MermaidDiagram({
  source,
  svg,
  error,
}: {
  source: string;
  svg: string | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="mb-4 rounded-md border border-bb-border bg-bb-surface p-4">
        <div className="mb-2 text-xs text-bb-red">Couldn&apos;t render this diagram: {error}</div>
        <pre className="overflow-x-auto font-mono text-[13px] text-bb-text-secondary">{source}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="mb-4 flex h-24 items-center justify-center rounded-md border border-bb-border bg-bb-surface text-xs text-bb-text-tertiary">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="prd-mermaid mb-4 overflow-x-auto rounded-md border border-bb-border bg-bb-surface p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
