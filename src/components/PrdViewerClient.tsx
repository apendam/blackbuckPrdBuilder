"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PrdCommentLayer } from "@/components/PrdCommentLayer";
import { ChatMessage as ChatMessageBubble } from "@/components/ChatMessage";
import type { ConversationView } from "@/lib/conversations";
import type { DocComment } from "@/lib/googleDocs";
import { PHASE_LABELS } from "@/lib/types";
import { costForBreakdown, formatCost, formatTokenCount } from "@/lib/pricing";
import { classifyApiError, FriendlyError } from "@/lib/errors";

type DiffPart = { added: boolean; removed: boolean; value: string };

interface RenderedMermaidImage {
  url: string;
  width: number;
  height: number;
}

// Every Mermaid fence in document order, WITHOUT deduping identical sources
// -- unlike DocumentPanel's own extraction (which dedupes by source text for
// its render cache), this one has to align 1:1, by occurrence index, with
// the server's markdownToDocsRequests, which counts every code fence as it
// walks the document regardless of whether an earlier one had the same text.
const MERMAID_FENCE_ORDERED = /```mermaid\n([\s\S]*?)```/g;
function extractMermaidSourcesInOrder(content: string): string[] {
  return Array.from(content.matchAll(MERMAID_FENCE_ORDERED), (m) => m[1].replace(/\n$/, ""));
}

// Renders every Mermaid diagram in the PRD to a PNG data URL, for embedding
// as a real image in the exported Google Doc -- Docs can't render Mermaid
// source itself, and rendering requires a real browser (mermaid.js needs DOM
// APIs for text measurement), so this only runs from the manual export
// button here, never from the server. A diagram that fails to render (or
// whose rendered SVG can't be rasterized to PNG, which can happen for
// SVGs containing foreignObject content) becomes `null` in the result --
// the server falls back to raw-source text for that one specific diagram
// rather than failing the whole export.
async function renderMermaidDiagramsForExport(content: string): Promise<(RenderedMermaidImage | null)[]> {
  const sources = extractMermaidSourcesInOrder(content);
  if (sources.length === 0) return [];

  const { default: mermaid } = await import("mermaid");
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

  return Promise.all(
    sources.map(async (source, i): Promise<RenderedMermaidImage | null> => {
      try {
        const { svg } = await mermaid.render(`mmd-export-${i}-${Date.now()}`, source);
        return await svgStringToPngDataUrl(svg);
      } catch {
        return null;
      }
    })
  );
}

// Draws a rendered Mermaid SVG onto an offscreen canvas at 2x scale (for
// reasonable sharpness in the Doc) and reads it back out as a PNG data URL
// -- Google Docs' image-insertion API doesn't accept SVG directly, only
// raster formats.
function svgStringToPngDataUrl(svgString: string, scale = 2): Promise<RenderedMermaidImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const width = img.naturalWidth || img.width || 800;
      const height = img.naturalHeight || img.height || 600;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas context unavailable"));
        return;
      }
      // The diagram's own dark theme has a dark canvas background -- fill it
      // explicitly so any transparent SVG region doesn't come out as
      // whatever default the PNG format falls back to.
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      try {
        resolve({ url: canvas.toDataURL("image/png"), width, height });
      } catch (err) {
        // toDataURL throws if the canvas got tainted (e.g. a <foreignObject>
        // in the SVG treated as cross-origin content by some browsers) --
        // this diagram just falls back to raw text server-side.
        reject(err instanceof Error ? err : new Error("Canvas export failed"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load rendered SVG as an image"));
    };
    img.src = objectUrl;
  });
}
type ViewMode = "prd" | "transcript" | "diff" | "activity" | "notes";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PrdViewerClient({
  conversation,
  content,
  versions,
  userName,
  userEmail,
  signOutAction,
}: {
  conversation: ConversationView;
  content: string;
  versions: ConversationView[];
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("prd");
  const [revising, setRevising] = useState(false);
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const [diffParts, setDiffParts] = useState<DiffPart[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [notes, setNotes] = useState(conversation.notes);
  const [notesSaved, setNotesSaved] = useState(true);
  const [comments, setComments] = useState<DocComment[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [submittingPrdFeedback, setSubmittingPrdFeedback] = useState(false);
  // Lifted from PrdCommentLayer -- lets the top-bar "revise as new version"
  // action (a totally different, skeleton-level redo) warn before discarding
  // in-progress inline comments/additions the PM hasn't submitted yet.
  const [hasPendingComments, setHasPendingComments] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  // A conversation isn't "finished" just because a draft file exists --
  // see runChatTurn's auto-save (claude.ts), which now saves as soon as a
  // complete draft is produced, well before the PM finalizes anything. Only
  // status === "completed" means the PM actually finalized (create_google_doc
  // + Output phase). While it's anything else, this page is the mid-review
  // surface: judge findings anchored on a real, current, but not-yet-final
  // draft.
  const isDraft = conversation.status !== "completed";

  // Revisions carry the full prior conversation forward (see createRevision/
  // createPrdRevision), so summing this version's own messages already
  // covers everything back to Phase 1 Objective, not just this version's own
  // turns.
  const conversationUsage = useMemo(() => {
    const byModel = conversation.messages.flatMap((m) => m.usage?.byModel ?? []);
    const totalTokens = byModel.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
    return { totalTokens, totalCost: costForBreakdown(byModel) };
  }, [conversation.messages]);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [exportingGoogleDoc, setExportingGoogleDoc] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [reviseMenuOpen, setReviseMenuOpen] = useState(false);
  const reviseMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reviseMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (reviseMenuRef.current && !reviseMenuRef.current.contains(e.target as Node)) {
        setReviseMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [reviseMenuOpen]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [downloadMenuOpen]);

  function openReviseWithComments() {
    setMode("prd");
    setFeedbackPanelOpen(true);
  }

  useEffect(() => {
    if (!hasPendingComments) return;
    function warnOnClose(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warnOnClose);
    return () => window.removeEventListener("beforeunload", warnOnClose);
  }, [hasPendingComments]);

  async function loadComments() {
    if (!conversation.googleDocUrl) return;
    setCommentsError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/doc-comments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load comments");
      setComments(data.comments);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : "Failed to load comments");
    }
  }

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.googleDocUrl]);

  const openCommentCount = comments?.filter((c) => !c.resolved).length ?? null;

  async function revise() {
    if (
      hasPendingComments &&
      !window.confirm(
        "You have unsubmitted comments/additions on this PRD. \"Revise as new version\" starts a fresh skeleton-level redo and does NOT carry them forward -- they'll stay saved here if you cancel, but continuing means addressing them separately later. Continue anyway?"
      )
    ) {
      return;
    }
    setRevising(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/revise`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/chat/${data.conversation.id}`);
    } finally {
      setRevising(false);
    }
  }

  async function submitPrdFeedback(message: string) {
    setSubmittingPrdFeedback(true);
    setActionError(null);
    try {
      if (isDraft) {
        // Still under review, nothing finalized yet -- this is just the next
        // turn in the SAME conversation (the model redrafts, and
        // runChatTurn's auto-save/auto-verify pick the new draft up on their
        // own), not a new version. Refresh re-reads the server component's
        // props (fresh content + findings) once the turn lands.
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: conversation.id, message }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Request failed");
        router.refresh();
        return;
      }
      // Already finalized -- this genuinely is a new version, same as
      // before: fork via createPrdRevision and hand the compiled feedback to
      // ChatClient's own pending-seed mechanism on the new conversation.
      const res = await fetch(`/api/conversations/${conversation.id}/revise-prd`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      sessionStorage.setItem(`prd-builder:pending-seed:${data.conversation.id}`, message);
      router.push(`/chat/${data.conversation.id}`);
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    } finally {
      setSubmittingPrdFeedback(false);
    }
  }

  async function handleResolveFinding(findingId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    }
  }

  async function handleDismissFinding(findingId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    }
  }

  async function handleReopenFinding(findingId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    }
  }

  // Explicit finalize action -- the ONLY thing that advances the
  // conversation to Output/completed now that a draft saves and gets
  // verification comments well before this point. Sent to the SAME
  // conversation via /api/chat, same approval wording Phase 8 already
  // recognizes as "proceed to Output" (create_google_doc + phase advance);
  // save_prd_markdown firing again here is harmless, just re-saving
  // identical content.
  async function handleFinalize() {
    const openCount = conversation.verificationFindings.filter((f) => f.status === "open").length;
    if (
      openCount > 0 &&
      !window.confirm(
        `${openCount} verification finding${openCount === 1 ? "" : "s"} still open. Finalize anyway?`
      )
    ) {
      return;
    }
    setFinalizing(true);
    setActionError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          message: "I approve — please go ahead and write/revise the PRD now.",
          skipVerify: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    } finally {
      setFinalizing(false);
    }
  }

  async function archive() {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    router.push("/");
  }

  async function loadDiff(againstId: string) {
    setDiffAgainst(againstId);
    setDiffLoading(true);
    setMode("diff");
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/diff?against=${againstId}`);
      const data = await res.json();
      if (res.ok) setDiffParts(data.parts);
    } finally {
      setDiffLoading(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(conversation.title || "prd").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-v${conversation.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    setMode("prd");
    // Let the mode switch render before the print dialog opens.
    setTimeout(() => window.print(), 50);
  }

  // Manual export/re-export -- independent of the drafting model's own
  // Phase 9 create_google_doc call, so a PM whose export failed (expired
  // Google token, most commonly) can retry it directly instead of having to
  // re-trigger a full chat turn just to get the same tool call to run again.
  async function handleExportGoogleDoc() {
    setExportingGoogleDoc(true);
    setActionError(null);
    try {
      // Render every diagram to a real PNG in the browser first -- this is
      // the one piece the server genuinely cannot do itself (no DOM to
      // measure text with), so it has to happen here, before the export
      // call, not as a fallback inside it.
      const images = await renderMermaidDiagramsForExport(content);
      const res = await fetch(`/api/conversations/${conversation.id}/export-google-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      router.refresh();
      // The only other feedback here is a quiet link appearing in the
      // header -- easy to miss entirely, especially since this action takes
      // several seconds. Opening the finished Doc directly is the
      // unambiguous "yes, it worked" signal, matching how Export PDF's
      // print dialog appears immediately rather than silently.
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    } finally {
      setExportingGoogleDoc(false);
    }
  }

  const notesSaveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesSaved(false);
    clearTimeout(notesSaveTimeout.current);
    notesSaveTimeout.current = setTimeout(async () => {
      await fetch(`/api/conversations/${conversation.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      setNotesSaved(true);
    }, 600);
  }

  return (
    <div className="flex h-screen flex-col prd-page-root">
      <div className="print:hidden">
        <AppHeader userName={userName} userEmail={userEmail} signOutAction={signOutAction} />
      </div>
      <div className="flex items-center justify-between border-b border-bb-border-subtle bg-bb-panel px-8 py-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-bb-text">
              {conversation.title || "(untitled PRD)"}
            </h1>
            <span className="rounded-full bg-bb-surface px-2 py-0.5 text-[10px] text-bb-text-tertiary">
              v{conversation.version}
            </span>
            {conversation.status === "archived" && (
              <span className="rounded-full bg-bb-red-dim px-2 py-0.5 text-[10px] text-bb-text">
                archived
              </span>
            )}
            {conversationUsage.totalTokens > 0 && (
              <span
                title="Total spend across this PRD's whole conversation, from Phase 1 Objective onward"
                className="rounded-full border border-bb-border-subtle px-2 py-0.5 text-[10px] text-bb-text-tertiary"
              >
                {formatTokenCount(conversationUsage.totalTokens)} tokens · {formatCost(conversationUsage.totalCost)}
              </span>
            )}
          </div>
          {conversation.googleDocUrl && (
            <div className="flex items-center gap-2">
              <a
                href={conversation.googleDocUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-bb-red underline underline-offset-2"
              >
                Open Google Doc ↗
              </a>
              {openCommentCount !== null && openCommentCount > 0 && (
                <span className="rounded-full bg-bb-red-dim px-2 py-0.5 text-[10px] font-semibold text-bb-text">
                  {openCommentCount} open comment{openCommentCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            ← Dashboard
          </Link>
          <div className="relative" ref={downloadMenuRef}>
            <button
              onClick={() => setDownloadMenuOpen((v) => !v)}
              title="Download"
              aria-label="Download"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-bb-border text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {downloadMenuOpen && (
              <div className="absolute right-0 top-10 z-20 w-40 rounded-md border border-bb-border bg-bb-panel p-1 shadow-lg">
                <button
                  onClick={() => {
                    downloadMarkdown();
                    setDownloadMenuOpen(false);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface"
                >
                  Download .md
                </button>
                <button
                  onClick={() => {
                    exportPdf();
                    setDownloadMenuOpen(false);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => {
                    // Don't close the menu immediately (unlike the other two
                    // actions above) -- this one takes several real seconds
                    // against the Google API, and the "Exporting…" label
                    // below is the only in-progress feedback on the whole
                    // page. Closing on click before it can render is what
                    // made a successful export look like nothing happened.
                    handleExportGoogleDoc().finally(() => setDownloadMenuOpen(false));
                  }}
                  disabled={exportingGoogleDoc || !conversation.prdMarkdownPath}
                  title={
                    !conversation.prdMarkdownPath
                      ? "No saved PRD to export yet"
                      : conversation.googleDocUrl
                        ? "Re-export -- overwrites the existing Google Doc link with a fresh one"
                        : "Create a Google Doc from the current PRD"
                  }
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingGoogleDoc
                    ? "Exporting…"
                    : conversation.googleDocUrl
                      ? "Re-export to Google Doc"
                      : "Export to Google Doc"}
                </button>
              </div>
            )}
          </div>
          <Link
            href={`/chat/${conversation.id}`}
            title="Open the full chat for this PRD -- free-form messages and file attachments included -- to keep talking with the agent. Changes made here land on THIS same version, not a new one; use 'Revise PRD' instead if you want to branch off a new version."
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
          >
            🛠️ Modify PRD
          </Link>
          {isDraft ? (
            // One dropdown, not two competing buttons -- "Redo PRD" (keep
            // iterating, opens the comment panel) and "Finalize PRD" (the
            // rare, deliberate, harder-to-undo one -- create_google_doc +
            // mark complete, no more judge calls) both live under the same
            // trigger so neither reads as more the "default" action than
            // the other; the PM has to actually open the menu and pick.
            <div className="relative" ref={reviseMenuRef}>
              <button
                onClick={() => setReviseMenuOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-bb-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-bb-red-hover"
              >
                Revise PRD
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {reviseMenuOpen && (
                <div className="absolute left-0 top-10 z-20 w-52 rounded-md border border-bb-border bg-bb-panel p-1 shadow-lg">
                  <button
                    onClick={() => {
                      openReviseWithComments();
                      setReviseMenuOpen(false);
                    }}
                    title="Point-fix specific parts of this draft via inline comments, or address open verification findings"
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface"
                  >
                    Redo PRD
                  </button>
                  <button
                    onClick={() => {
                      setReviseMenuOpen(false);
                      handleFinalize();
                    }}
                    disabled={finalizing}
                    title="Create the Google Doc and mark this PRD complete, with no further judge checks -- this is the final step, not a way to keep iterating."
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-bb-text hover:bg-bb-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {finalizing ? "Finalizing…" : "✅ Finalize PRD"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openReviseWithComments}
              title="Point-fix specific parts of this PRD via inline comments -- keeps the current structure, revises only what you flag."
              className="rounded-full bg-bb-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-bb-red-hover"
            >
              Revise PRD
            </button>
          )}
          <button
            data-feedback-toggle
            onClick={() => setFeedbackPanelOpen((v) => !v)}
            title="Comments and verification findings on this PRD"
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-amber hover:text-bb-text"
          >
            💬 Feedback{feedbackCount > 0 ? ` (${feedbackCount})` : ""}
          </button>
          <button
            onClick={revise}
            disabled={revising}
            title="Starts over from the skeleton -- does not carry forward inline comments below. For point-fixes, use 'Revise PRD' instead."
            className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text disabled:opacity-50"
          >
            {revising ? "Starting redo…" : "Redo Skeleton"}
          </button>
          {conversation.status !== "archived" && (
            <button
              onClick={archive}
              title="Archive"
              aria-label="Archive"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-bb-border text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5C21.75 4.254 21.246 3.75 20.625 3.75H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125ZM10 11.25h4M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-bb-border-subtle bg-bb-bg px-8 py-2 print:hidden">
        <div className="flex gap-1">
          {(["prd", "transcript", "activity", "notes"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                mode === m ? "bg-bb-red text-white" : "text-bb-text-tertiary hover:text-bb-text-secondary"
              }`}
            >
              {m === "prd" ? "PRD" : m === "transcript" ? "Conversation" : m}
            </button>
          ))}
        </div>

        {versions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-bb-text-tertiary">
            <span>Versions:</span>
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                {v.id === conversation.id ? (
                  <span className="font-semibold text-bb-text">v{v.version} (this)</span>
                ) : (
                  <>
                    <Link href={`/prd/${v.id}`} className="text-bb-red underline underline-offset-2">
                      v{v.version}
                    </Link>
                    {v.prdMarkdownPath && (
                      <button
                        onClick={() => loadDiff(v.id)}
                        className="text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
                      >
                        (diff)
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {actionError && (
        <div className="border-b border-bb-red bg-bb-red-dim px-8 py-2 text-sm text-bb-text print:hidden">
          <span className="font-semibold">{actionError.title}: </span>
          <span className="text-bb-text-secondary">{actionError.detail}</span>
          <button
            onClick={() => setActionError(null)}
            className="ml-3 text-bb-text-tertiary hover:text-bb-text"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto prd-scroll-area">
        {mode === "prd" && (
          <PrdCommentLayer
            conversationId={conversation.id}
            content={content}
            onSubmit={submitPrdFeedback}
            submitting={submittingPrdFeedback}
            onPendingChange={setHasPendingComments}
            onFeedbackCountChange={setFeedbackCount}
            panelOpen={feedbackPanelOpen}
            onPanelOpenChange={setFeedbackPanelOpen}
            judgeFindings={conversation.verificationFindings}
            onResolveFinding={handleResolveFinding}
            onDismissFinding={handleDismissFinding}
            onReopenFinding={handleReopenFinding}
          />
        )}

        {mode === "transcript" && (
          <div className="mx-auto max-w-2xl space-y-4 px-8 py-8 print:hidden">
            {conversation.messages.map((m, i) => (
              <ChatMessageBubble key={i} message={m} />
            ))}
          </div>
        )}

        {mode === "activity" && (
          <div className="mx-auto max-w-2xl px-8 py-8 print:hidden">
            <h2 className="mb-4 text-sm font-bold text-bb-text">Phase activity log</h2>
            {conversation.phaseLog.length === 0 && (
              <p className="text-sm text-bb-text-tertiary">No phase transitions recorded yet.</p>
            )}
            <ol className="relative space-y-4">
              {conversation.phaseLog.map((entry, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-bb-red" />
                  <span className="text-sm text-bb-text">{PHASE_LABELS[entry.phase]}</span>
                  <span className="text-xs text-bb-text-tertiary">{formatTimestamp(entry.at)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 text-xs text-bb-text-tertiary">
              Created {formatTimestamp(conversation.createdAt)}
              {conversation.completedAt && ` · Completed ${formatTimestamp(conversation.completedAt)}`}
            </div>

            {conversation.googleDocUrl && (
              <div className="mt-8">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-bb-text">Google Doc comments</h2>
                  <button
                    onClick={loadComments}
                    className="text-xs text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
                  >
                    refresh
                  </button>
                </div>
                <p className="mb-3 text-xs text-bb-text-tertiary">
                  Reviewers comment directly in the Doc -- this is a read-only view so you don&apos;t have to
                  tab over just to check.
                </p>
                {commentsError && <p className="text-xs text-bb-red">{commentsError}</p>}
                {!commentsError && comments && comments.length === 0 && (
                  <p className="text-sm text-bb-text-tertiary">No comments yet.</p>
                )}
                {!commentsError && comments && comments.length > 0 && (
                  <ul className="space-y-2">
                    {comments.map((c) => (
                      <li
                        key={c.id}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          c.resolved
                            ? "border-bb-border-subtle text-bb-text-tertiary"
                            : "border-bb-red-dim bg-bb-red-dim/20 text-bb-text"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between text-xs text-bb-text-tertiary">
                          <span>{c.author}</span>
                          <span>
                            {formatTimestamp(c.createdTime)} {c.resolved && "· resolved"}
                          </span>
                        </div>
                        {c.content}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "notes" && (
          <div className="mx-auto max-w-2xl px-8 py-8 print:hidden">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-bb-text">Your notes</h2>
              <span className="text-xs text-bb-text-tertiary">
                {notesSaved ? "saved" : "saving…"}
              </span>
            </div>
            <p className="mb-3 text-xs text-bb-text-tertiary">
              Scratch space for yourself -- never sent to the model, not part of the PRD.
            </p>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={16}
              placeholder="Brainstorming, reminders, things to follow up on…"
              className="w-full rounded-md border border-bb-border bg-bb-surface p-3 text-sm text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
          </div>
        )}

        {mode === "diff" && (
          <div className="mx-auto max-w-3xl px-8 py-8 print:hidden">
            <div className="mb-3 text-xs text-bb-text-tertiary">
              Comparing this version against v
              {versions.find((v) => v.id === diffAgainst)?.version ?? "?"} (red = removed, green =
              added)
            </div>
            {diffLoading && <div className="text-xs text-bb-text-tertiary">Loading diff…</div>}
            {!diffLoading && diffParts && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-bb-border bg-bb-surface p-4 font-mono text-xs leading-relaxed">
                {diffParts.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added
                        ? "bg-bb-green/20 text-bb-green"
                        : part.removed
                          ? "bg-bb-red-dim text-bb-red"
                          : "text-bb-text-secondary"
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
