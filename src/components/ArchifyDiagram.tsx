"use client";

// Archify diagrams are rendered server-side (render_archify_diagram, at the
// point the drafting model calls it) into a static PNG under
// public/archify-diagrams/ -- unlike Mermaid, there is no client-side
// rendering step here at all, so this component is just an <img> with the
// same bordered-panel treatment MermaidDiagram uses, plus a plain fallback
// if the referenced diagram is somehow missing (an id from an older
// conversation whose PNG got cleaned up, for instance).
export function ArchifyDiagram({ id, title }: { id: string; title: string }) {
  return (
    <div className="prd-archify mb-4 overflow-x-auto rounded-md border border-bb-border bg-bb-surface p-4">
      <img
        src={`/archify-diagrams/${id}.png`}
        alt={title}
        className="mx-auto max-w-full"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.hidden = false;
        }}
      />
      <div hidden className="text-xs text-bb-red">
        Couldn&apos;t load diagram &quot;{title}&quot; (id: {id}) -- it may be from an older conversation.
      </div>
    </div>
  );
}
