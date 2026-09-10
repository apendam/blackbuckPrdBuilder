"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentPanel } from "@/components/DocumentPanel";
import { VerificationFinding } from "@/lib/types";

interface Reply {
  id: string;
  text: string;
}

interface CommentEntry {
  id: string;
  text: string;
  replies: Reply[];
}

// Identifies exactly ONE occurrence of `quote` in the document -- e.g.
// `{quote: "gold whitelisted", occurrence: 2}` means the third time that
// exact phrase appears (0-indexed), not every place it appears. Matching by
// text alone (as this used to) meant commenting on one "gold whitelisted"
// lit up all forty of them, which is wrong, not just imprecise -- a comment
// about one specific spot has nothing to do with the other thirty-nine.
interface Anchor {
  quote: string;
  occurrence: number;
}

interface CommentThread {
  anchor: Anchor;
  comments: CommentEntry[];
}

// null id = drafting a brand-new top-level comment on this anchor.
interface CommentDraft {
  anchor: Anchor;
  id: string | null;
  text: string;
}

// null id = drafting a brand-new reply on commentId; otherwise editing the
// existing reply with that id.
interface ReplyDraft {
  anchor: Anchor;
  commentId: string;
  id: string | null;
  text: string;
}

interface Addition {
  id: string;
  afterQuote: string | null; // null = general, not anchored to a specific excerpt
  text: string;
}

interface FloatingPopup {
  anchor: Anchor;
  top: number;
  left: number;
}

// A diagram can't show its own in-place mark (see the SVG note on the
// highlighting effect below), so instead it gets one small badge summarizing
// every annotation anchored to a label inside it; clicking the badge opens
// this listing all of them. Each kind is tracked separately since they
// render through different sub-components with different actions.
interface DiagramBadgePopup {
  anchors: Anchor[];
  judgeFindingIds: string[];
  askEntryIds: string[];
  top: number;
  left: number;
}

// Click-to-open (not hover, unlike the PM comment popup) -- a judge finding
// carries real actions (resolve/dismiss/reply) that need buttons a PM can
// actually click without a hover-close timer fighting them, the same
// reasoning the diagram comment badge above already uses.
interface JudgePopup {
  findingId: string;
  top: number;
  left: number;
}

// Draft state for "point the judge at a spot it missed" -- opened from the
// same text-selection popup as a normal comment. Unlike a comment, this
// doesn't touch the server on its own: submitting it just adds an AskEntry
// (below) to the SAME local, batched-until-submit pile as everything else --
// the judge only actually looks at it once the PM submits feedback and the
// drafting model reads it as part of that one turn, the same way it reads
// PM comments.
interface AskJudgeDraft {
  anchor: Anchor;
  text: string;
}

// A question the PM has asked the judge to check, sitting in the SAME local,
// pre-submission pile as comments/additions -- not sent anywhere until
// "Redo PRD" compiles it into the feedback message. Marked in the document
// the instant it's added (same as a comment), since there's no async gap to
// bridge anymore.
interface AskEntry {
  id: string;
  anchor: Anchor;
  question: string;
}

// Editing an existing AskEntry's question text -- mirrors CommentDraft's
// edit-in-place pattern, just simpler (one question, not a list).
interface AskEditDraft {
  id: string;
  text: string;
}

interface StoredDraft {
  threads: CommentThread[];
  additions: Addition[];
  askEntries: AskEntry[];
  // PM replies to an EXISTING (judge-authored) finding, keyed by finding id
  // -- local until submit, same as everything else here, so replying to a
  // judge finding doesn't touch the server on its own either.
  judgeReplies: Record<string, string[]>;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function draftKey(conversationId: string): string {
  return `prd-builder:comment-draft:${conversationId}`;
}

function sameAnchor(a: Anchor, b: Anchor): boolean {
  return a.quote === b.quote && a.occurrence === b.occurrence;
}

// Tolerates the pre-anchor stored shape (comments keyed by quote text only,
// every occurrence sharing one thread) from before positional anchoring
// existed -- best-effort mapped onto occurrence 0 so an old draft doesn't
// just vanish, even though it can no longer distinguish which occurrence was
// originally meant.
function normalizeThreads(raw: unknown): CommentThread[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is CommentThread => !!t && typeof t === "object" && "anchor" in t)
      .map((t) => ({
        anchor: {
          quote: String((t.anchor as Anchor)?.quote ?? ""),
          occurrence: Number((t.anchor as Anchor)?.occurrence ?? 0),
        },
        comments: Array.isArray(t.comments)
          ? t.comments.map((c: Partial<CommentEntry>) => ({
              id: typeof c.id === "string" ? c.id : newId("c"),
              text: typeof c.text === "string" ? c.text : "",
              replies: Array.isArray(c.replies)
                ? c.replies.map((r: Partial<Reply>) => ({
                    id: typeof r.id === "string" ? r.id : newId("r"),
                    text: typeof r.text === "string" ? r.text : "",
                  }))
                : [],
            }))
          : [],
      }));
  }
  if (raw && typeof raw === "object") {
    // Old Record<quote, CommentEntry[]> shape.
    return Object.entries(raw as Record<string, unknown>).map(([quote, list]) => ({
      anchor: { quote, occurrence: 0 },
      comments: Array.isArray(list)
        ? list.map((entry): CommentEntry =>
            typeof entry === "string"
              ? { id: newId("c"), text: entry, replies: [] }
              : {
                  id: typeof entry?.id === "string" ? entry.id : newId("c"),
                  text: typeof entry?.text === "string" ? entry.text : "",
                  replies: [],
                }
          )
        : [],
    }));
  }
  return [];
}

function loadDraft(conversationId: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    return {
      threads: normalizeThreads(parsed.threads),
      additions: parsed.additions ?? [],
      askEntries: Array.isArray(parsed.askEntries) ? parsed.askEntries : [],
      judgeReplies:
        parsed.judgeReplies && typeof parsed.judgeReplies === "object" ? parsed.judgeReplies : {},
    };
  } catch {
    // Corrupt/unavailable storage shouldn't crash the PRD view -- worst case
    // is the same as before this existed, an empty draft.
    return null;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) return count;
    count++;
    pos = idx + needle.length;
  }
}

// The nearest scrollable ancestor of the PRD content -- PrdViewerClient
// scrolls a specific `overflow-y-auto` div, not the window, so
// window.scrollY isn't the right thing to read/restore around a DOM
// mutation here.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

// Comments anchor to the exact selected text PLUS which occurrence of it in
// the document -- not just the text alone, which would treat every "gold
// whitelisted" in the PRD as the same spot. This used to be purely in-memory
// React state with nothing written anywhere until "Submit feedback for
// revision" -- a PM who clicked the wrong button ("Revise as new version")
// navigates away entirely) lost every comment with no way to recover it,
// since it had never touched the server or disk. Auto-saved to localStorage
// per conversation instead, so navigating away (by accident or otherwise) or
// closing the tab can't destroy it -- it's cleared only once the feedback is
// actually submitted AND the server confirms a new draft landed (see the
// content-change effect below), not eagerly on click.
export function PrdCommentLayer({
  conversationId,
  content,
  onSubmit,
  submitting,
  onPendingChange,
  onFeedbackCountChange,
  panelOpen,
  onPanelOpenChange,
  judgeFindings,
  onResolveFinding,
  onDismissFinding,
  onReopenFinding,
}: {
  conversationId: string;
  content: string;
  onSubmit: (message: string) => void;
  submitting: boolean;
  onPendingChange?: (hasPending: boolean) => void;
  // The toggle button lives in the parent's header row now (see
  // onFeedbackCountChange below) -- this reports the live count for its
  // badge.
  onFeedbackCountChange?: (count: number) => void;
  // Controlled from the parent so the header's toggle button can open this
  // same panel.
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  // Judge-authored findings from the automatic full-sweep verify pass --
  // rendered through the same anchor/mark/popup machinery as the PM's own
  // comments, styled amber instead of red so the two are distinguishable at
  // a glance. Resolve/dismiss/reopen are real, immediate status changes (no
  // model investigation involved); replies to these are local-only, same as
  // everything else the PM writes here.
  judgeFindings: VerificationFinding[];
  onResolveFinding: (findingId: string) => void;
  onDismissFinding: (findingId: string) => void;
  onReopenFinding: (findingId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentReady, setContentReady] = useState(false);
  const [selectionPopup, setSelectionPopup] = useState<FloatingPopup | null>(null);
  const [hoverPopup, setHoverPopup] = useState<FloatingPopup | null>(null);
  const [diagramBadgePopup, setDiagramBadgePopup] = useState<DiagramBadgePopup | null>(null);
  const [judgePopup, setJudgePopup] = useState<JudgePopup | null>(null);
  const [askPopup, setAskPopup] = useState<FloatingPopup | null>(null);
  const [askJudgeDraft, setAskJudgeDraft] = useState<AskJudgeDraft | null>(null);
  const [askEditDraft, setAskEditDraft] = useState<AskEditDraft | null>(null);
  const [judgeReplyDraft, setJudgeReplyDraft] = useState<{ findingId: string; text: string } | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRestoreRef = useRef<{ el: HTMLElement; top: number } | null>(null);

  // Deliberately NOT seeded from localStorage in the useState initializer --
  // that function runs during server rendering too, where localStorage
  // doesn't exist, so the server always produces an empty thread list. If
  // the client's first render read a real draft here instead, its output
  // (e.g. "Feedback (2)") wouldn't match what the server sent down
  // ("Feedback"), which is a hydration-mismatch error, not just a cosmetic
  // one. Starting empty and loading the draft in an effect after mount keeps
  // the first render identical on both sides; the draft then appears a
  // moment later, which is the standard, safe pattern for browser-only
  // storage in an SSR'd component.
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [addingLineFor, setAddingLineFor] = useState<string | null>(null); // quote, or "" for general
  const [newLineText, setNewLineText] = useState("");
  const [askEntries, setAskEntries] = useState<AskEntry[]>([]);
  const [judgeReplies, setJudgeReplies] = useState<Record<string, string[]>>({});

  // Guards the persistence-write effect below from firing on the very first
  // (still-empty) render -- without this, mount order would be: this load
  // effect calls setThreads/setAdditions (scheduling a re-render, not
  // visible yet), then the write effect runs in the SAME commit still
  // seeing the old empty state and deletes the very draft just read, before
  // the re-render with the real data arrives and writes it straight back.
  // Harmless in practice (it's rewritten a tick later), but there's no
  // reason to round-trip a delete+rewrite of real data on every page load.
  const hasHydrated = useRef(false);
  useEffect(() => {
    const draft = loadDraft(conversationId);
    if (draft) {
      setThreads(draft.threads);
      setAdditions(draft.additions);
      setAskEntries(draft.askEntries);
      setJudgeReplies(draft.judgeReplies);
    }
    hasHydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Clears every local, not-yet-submitted annotation the instant the SERVER
  // confirms a new draft actually landed (a genuine change to `content`,
  // the prop the server component re-reads from disk after router.refresh())
  // -- not eagerly on clicking Submit. Submitting can fail (network error,
  // server error), and clearing state before confirming success would
  // silently throw away everything the PM wrote with no way to recover it.
  // A real content change is the one signal that's actually proof the
  // feedback was received and acted on. Guarded against firing on mount
  // (where `content` is already whatever it is, not a "change") via the ref
  // below, same pattern as `hasHydrated` above.
  const prevContentRef = useRef(content);
  useEffect(() => {
    if (prevContentRef.current === content) return;
    prevContentRef.current = content;
    setThreads([]);
    setAdditions([]);
    setAskEntries([]);
    setJudgeReplies({});
    try {
      localStorage.removeItem(draftKey(conversationId));
    } catch {
      // Best-effort -- stale localStorage isn't worth crashing over, and the
      // in-memory state above is already cleared regardless.
    }
  }, [content, conversationId]);

  // The imperative mark/icon listeners below are attached once per
  // highlighting pass and live on indefinitely -- if they closed directly
  // over `commentDraft`/`replyDraft`, they'd keep checking whatever those
  // were at attachment time, not whatever they become later (e.g. the
  // instant *after* clicking "+ reply" sets replyDraft, which happens well
  // after the marks were last (re)attached). Mirroring both into refs lets
  // that stale closure read the current value instead.
  const commentDraftRef = useRef(commentDraft);
  const replyDraftRef = useRef(replyDraft);
  useEffect(() => {
    commentDraftRef.current = commentDraft;
  }, [commentDraft]);
  useEffect(() => {
    replyDraftRef.current = replyDraft;
  }, [replyDraft]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    try {
      if (
        threads.length === 0 &&
        additions.length === 0 &&
        askEntries.length === 0 &&
        Object.keys(judgeReplies).length === 0
      ) {
        localStorage.removeItem(draftKey(conversationId));
      } else {
        localStorage.setItem(
          draftKey(conversationId),
          JSON.stringify({ threads, additions, askEntries, judgeReplies })
        );
      }
    } catch {
      // Best-effort -- a full/blocked localStorage shouldn't break commenting.
    }
  }, [conversationId, threads, additions, askEntries, judgeReplies]);

  useEffect(() => {
    function handleMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const text = sel.toString().trim();
      if (!text || !containerRef.current) return;
      const range = sel.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;

      // Which occurrence of `text` this selection is: count how many full
      // matches appear in everything before the selection start. The
      // selected text itself is the very next match after that point, so
      // this count is exactly its 0-based occurrence index.
      const preRange = document.createRange();
      preRange.selectNodeContents(containerRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const occurrence = countOccurrences(preRange.toString(), text);

      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      // A fixed "38px above the selection" offset assumed there was always
      // room above -- for a selection near the top of the visible content
      // (a table's first rows, the very start of a section) that put the
      // popup ON TOP of the text it was annotating, hiding the very
      // selection highlight it exists to let the PM confirm. Flip below the
      // selection instead whenever there isn't enough headroom.
      const POPUP_HEIGHT = 44;
      const MARGIN = 10;
      const topAboveSelection = rect.top - containerRect.top;
      const top =
        topAboveSelection >= POPUP_HEIGHT + MARGIN
          ? topAboveSelection - POPUP_HEIGHT - MARGIN
          : rect.bottom - containerRect.top + MARGIN;
      setSelectionPopup({
        anchor: { quote: text, occurrence },
        top,
        left: Math.max(0, rect.left - containerRect.left),
      });
    }
    function handleMouseDown(e: MouseEvent) {
      // A fresh click that isn't extending a selection closes any open popup
      // -- mousedown fires before the browser clears the old selection, so
      // this also correctly survives a click that starts a new selection.
      if (!(e.target as HTMLElement).closest("[data-selection-popup]")) {
        setSelectionPopup(null);
      }
      // The diagram comment badge is click-to-open (not hover, since it's a
      // plain imperative button), so it needs the same click-outside-closes
      // behavior, but must not close from the very click that opens it --
      // excluding its own trigger element handles that.
      const target = e.target as HTMLElement;
      if (!target.closest("[data-diagram-badge-popup]") && !target.closest(".prd-mermaid-comment-badge")) {
        setDiagramBadgePopup(null);
      }
      // Judge popup and the ask-entry popup are click-to-open too (see their
      // own notes on why), so they need the identical click-outside-closes
      // behavior. Both share the same .prd-judge-icon class (just a
      // different icon/label per kind), so excluding it here is correct for
      // both.
      if (!target.closest("[data-judge-popup]") && !target.closest(".prd-judge-icon")) {
        setJudgePopup(null);
      }
      if (!target.closest("[data-ask-popup]") && !target.closest(".prd-judge-icon")) {
        setAskPopup(null);
      }
    }
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  // Marks the ONE commented occurrence of each thread's quote in the
  // rendered PRD with a persistent highlight + a small badge icon, hoverable
  // (PM comments) or click-to-open (judge findings/ask entries) to review
  // without opening the full feedback panel. This runs as an imperative DOM
  // pass (not React-rendered markup) because a quote can live anywhere
  // inside react-markdown's output -- a table cell, an inline code span,
  // plain prose -- and re-finding "the same text" after the fact is
  // fundamentally a find-in-page problem, not a props/state one. It's safe
  // to mutate that subtree directly because DocumentPanel is memoized on
  // `content` (a stable reference) and never re-renders itself once
  // mounted, so React never reconciles over these nodes again.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !contentReady) return;

    // Cleaned up differently on unmount: a mark's text content is real
    // document text and must be preserved (unwrapped back in place), while
    // an icon is purely decorative and must be deleted outright --
    // unwrapping it the same way as a mark would leave stray characters
    // sitting in the document as plain text forever.
    const markElements: HTMLElement[] = [];
    const iconElements: HTMLElement[] = [];
    const badgeElements: HTMLElement[] = [];
    // Comments/findings anchored inside a diagram can't get their own
    // in-place mark (see the SVG note below), so they're collected per
    // diagram instead and surfaced as one summary badge on the diagram's
    // border. Tracked separately per kind since the badge popup renders
    // each through a different sub-component.
    const svgAnchorsByDiagram = new Map<HTMLElement, Anchor[]>();
    const svgFindingIdsByDiagram = new Map<HTMLElement, string[]>();
    const svgAskIdsByDiagram = new Map<HTMLElement, string[]>();

    // One combined target list, PM comments and anchored judge findings and
    // ask entries alike -- they mark the SAME document via the SAME single
    // TreeWalker pass below, so they have to be resolved together. Running
    // independent passes over the same container would have each one's
    // TreeWalker see the others' already-inserted <mark>/<sup> nodes,
    // corrupting text offsets and occurrence counts for whichever runs
    // later -- this can only be done as one unified walk.
    type Target = {
      quote: string;
      occurrence: number;
      kind: "pm" | "judge" | "ask";
      anchor: Anchor;
      findingId?: string;
      askId?: string;
    };
    const targets: Target[] = [
      ...threads.map((t): Target => ({ ...t.anchor, kind: "pm", anchor: t.anchor })),
      ...judgeFindings
        .filter((f) => f.prdQuote)
        .map((f): Target => ({
          quote: f.prdQuote,
          occurrence: f.occurrence,
          kind: "judge",
          anchor: { quote: f.prdQuote, occurrence: f.occurrence },
          findingId: f.id,
        })),
      ...askEntries.map((a): Target => ({ ...a.anchor, kind: "ask", anchor: a.anchor, askId: a.id })),
    ];

    if (targets.length > 0) {
      // One target occurrence per quote, keyed by occurrence index, so the
      // walk below can tell "is THIS specific occurrence the commented one"
      // rather than lighting up every occurrence of the phrase.
      const targetsByQuote = new Map<string, Map<number, Target>>();
      for (const t of targets) {
        if (!targetsByQuote.has(t.quote)) targetsByQuote.set(t.quote, new Map());
        // If two different kinds somehow land on the exact same
        // quote+occurrence, first-in-array wins rather than silently
        // overwriting -- an edge case rare enough not to warrant a combined
        // popup, but a deterministic pick is still better than "whichever
        // happened to iterate last."
        const existing = targetsByQuote.get(t.quote)!;
        if (!existing.has(t.occurrence)) existing.set(t.occurrence, t);
      }
      // Longest quote first so a short commented quote that happens to be a
      // substring of a longer one doesn't get matched inside text already
      // claimed by the longer one.
      const sortedQuotes = Array.from(targetsByQuote.keys()).sort((a, b) => b.length - a.length);
      const seenCount = new Map<string, number>(sortedQuotes.map((q) => [q, 0]));

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        textNodes.push(node as Text);
        node = walker.nextNode();
      }

      for (const textNode of textNodes) {
        if (!textNode.parentNode || !textNode.data.trim()) continue;
        for (const quote of sortedQuotes) {
          const idx = textNode.data.indexOf(quote);
          if (idx === -1) continue;

          const occurrenceIndex = seenCount.get(quote)!;
          seenCount.set(quote, occurrenceIndex + 1);
          const target = targetsByQuote.get(quote)?.get(occurrenceIndex);
          if (!target) break; // this specific occurrence isn't a commented/flagged one
          const { anchor } = target;

          // Mermaid diagram labels live inside an SVG <text>/<tspan> -- an
          // HTML <mark>/<sup> isn't a valid child there, so the SVG renderer
          // just paints nothing for it (the label doesn't error, it just
          // silently disappears, box size and all). The occurrence count
          // above still has to advance either way (selection-time counting
          // doesn't distinguish SVG from prose), so this can't be skipped
          // earlier without breaking every occurrence index after it -- it
          // can only skip the actual DOM wrap once it gets here. Recorded
          // against its diagram instead, for the summary badge built below.
          const svg = textNode.parentElement?.closest("svg");
          if (svg) {
            const diagram = svg.closest<HTMLElement>(".prd-mermaid") ?? svg.parentElement;
            if (diagram && target.kind === "pm") {
              svgAnchorsByDiagram.set(diagram, [...(svgAnchorsByDiagram.get(diagram) ?? []), anchor]);
            } else if (diagram && target.kind === "judge") {
              svgFindingIdsByDiagram.set(diagram, [
                ...(svgFindingIdsByDiagram.get(diagram) ?? []),
                target.findingId!,
              ]);
            } else if (diagram && target.kind === "ask") {
              svgAskIdsByDiagram.set(diagram, [...(svgAskIdsByDiagram.get(diagram) ?? []), target.askId!]);
            }
            break;
          }

          const data = textNode.data;
          const before = data.slice(0, idx);
          const match = data.slice(idx, idx + quote.length);
          const after = data.slice(idx + quote.length);
          const parent = textNode.parentNode;

          const mark = document.createElement("mark");
          mark.className = target.kind === "pm" ? "prd-comment-mark" : "prd-judge-mark";
          if (target.kind === "ask") mark.classList.add("prd-judge-mark-pending");
          mark.textContent = match;

          const icon = document.createElement("sup");
          icon.className = target.kind === "pm" ? "prd-comment-icon" : "prd-judge-icon";
          icon.textContent = target.kind === "pm" ? "ⓘ" : target.kind === "ask" ? "❓" : "🔍";
          icon.setAttribute("role", "button");
          icon.setAttribute(
            "aria-label",
            target.kind === "pm"
              ? "View comment"
              : target.kind === "ask"
                ? "View your question for the judge"
                : "View verification finding"
          );

          if (target.kind === "pm") {
            const openHover = () => {
              clearTimeout(hoverCloseTimer.current);
              const rect = mark.getBoundingClientRect();
              const cRect = container.getBoundingClientRect();
              setHoverPopup({
                anchor,
                top: rect.bottom - cRect.top + 6,
                left: Math.max(0, rect.left - cRect.left),
              });
            };
            const scheduleClose = () => {
              hoverCloseTimer.current = setTimeout(() => {
                // Read the refs, not the closed-over commentDraft/replyDraft --
                // see the comment on those refs for why.
                if (
                  (commentDraftRef.current && sameAnchor(commentDraftRef.current.anchor, anchor)) ||
                  (replyDraftRef.current && sameAnchor(replyDraftRef.current.anchor, anchor))
                )
                  return;
                setHoverPopup(null);
              }, 250);
            };
            mark.addEventListener("mouseenter", openHover);
            mark.addEventListener("mouseleave", scheduleClose);
            icon.addEventListener("mouseenter", openHover);
            icon.addEventListener("mouseleave", scheduleClose);
            icon.addEventListener("click", openHover);
          } else if (target.kind === "judge") {
            // Click-to-open, not hover -- see JudgePopup's own note.
            const findingId = target.findingId!;
            const openJudgePopup = (e: Event) => {
              e.stopPropagation();
              const rect = mark.getBoundingClientRect();
              const cRect = container.getBoundingClientRect();
              setJudgePopup({ findingId, top: rect.bottom - cRect.top + 6, left: Math.max(0, rect.left - cRect.left) });
            };
            mark.addEventListener("click", openJudgePopup);
            icon.addEventListener("click", openJudgePopup);
          } else {
            // Ask entry -- same click-to-open pattern, opens a simple
            // edit/remove popup for the question itself.
            const askId = target.askId!;
            const openAskPopup = (e: Event) => {
              e.stopPropagation();
              const rect = mark.getBoundingClientRect();
              const cRect = container.getBoundingClientRect();
              setAskPopup({ anchor, top: rect.bottom - cRect.top + 6, left: Math.max(0, rect.left - cRect.left) });
            };
            mark.addEventListener("click", openAskPopup);
            icon.addEventListener("click", openAskPopup);
            void askId; // referenced via anchor lookup in the popup, not directly
          }

          parent.insertBefore(document.createTextNode(before), textNode);
          parent.insertBefore(mark, textNode);
          parent.insertBefore(icon, textNode);
          parent.insertBefore(document.createTextNode(after), textNode);
          parent.removeChild(textNode);

          markElements.push(mark);
          iconElements.push(icon);
          break; // one match per original text node -- see sort note above
        }
      }
    }

    const allDiagrams = new Set([
      ...svgAnchorsByDiagram.keys(),
      ...svgFindingIdsByDiagram.keys(),
      ...svgAskIdsByDiagram.keys(),
    ]);
    for (const diagram of allDiagrams) {
      const anchors = svgAnchorsByDiagram.get(diagram) ?? [];
      const judgeFindingIds = svgFindingIdsByDiagram.get(diagram) ?? [];
      const askEntryIds = svgAskIdsByDiagram.get(diagram) ?? [];
      const total = anchors.length + judgeFindingIds.length + askEntryIds.length;
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className =
        "prd-mermaid-comment-badge absolute right-2 top-2 z-10 rounded-full border border-bb-red bg-bb-panel px-2 py-0.5 text-[11px] font-semibold text-bb-red shadow print:hidden";
      badge.textContent = `💬 ${total} comment${total === 1 ? "" : "s"} on label${total === 1 ? "" : "s"}`;
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = badge.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        setDiagramBadgePopup({
          anchors,
          judgeFindingIds,
          askEntryIds,
          top: rect.bottom - cRect.top + 6,
          left: Math.max(0, rect.left - cRect.left),
        });
      });
      if (getComputedStyle(diagram).position === "static") {
        diagram.style.position = "relative";
      }
      diagram.appendChild(badge);
      badgeElements.push(badge);
    }

    // Restores whatever scroll position the PREVIOUS run's cleanup (below)
    // captured, right before it tore down the old marks/badges -- see that
    // capture for why this exists (removing/recreating a diagram badge on
    // every comment, anywhere in the doc, was resetting the PM's scroll
    // position to the top of the panel).
    if (scrollRestoreRef.current) {
      scrollRestoreRef.current.el.scrollTop = scrollRestoreRef.current.top;
      scrollRestoreRef.current = null;
    }

    return () => {
      // Captured here, not in the effect body above, so it brackets the
      // WHOLE teardown+rebuild cycle regardless of which half actually
      // disturbs the scroll position (removing a focused diagram badge
      // shifts focus to <body>, which some browsers resolve by scrolling
      // the nearest scrollable ancestor to the top -- but a full recreate of
      // the mermaid SVG on a later diagram, or any other reflow from the
      // rebuild, could just as easily be the real cause; this doesn't need
      // to know which).
      const scrollParent = findScrollParent(container);
      if (scrollParent) {
        scrollRestoreRef.current = { el: scrollParent, top: scrollParent.scrollTop };
      }

      for (const el of iconElements) {
        el.remove();
      }
      for (const el of badgeElements) {
        el.remove();
      }
      for (const el of markElements) {
        const parent = el.parentNode;
        if (!parent) continue;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        parent.normalize();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, judgeFindings, askEntries, contentReady]);

  function cancelHoverClose() {
    clearTimeout(hoverCloseTimer.current);
  }
  function scheduleHoverClose(anchor: Anchor) {
    // Stay open while the PM is actively editing/replying inside this exact
    // popup -- moving the mouse to reach a button shouldn't lose their draft.
    if (commentDraft && sameAnchor(commentDraft.anchor, anchor)) return;
    if (replyDraft && sameAnchor(replyDraft.anchor, anchor)) return;
    hoverCloseTimer.current = setTimeout(() => setHoverPopup(null), 250);
  }

  function findThread(anchor: Anchor): CommentThread | undefined {
    return threads.find((t) => sameAnchor(t.anchor, anchor));
  }

  function startNewComment(anchor: Anchor) {
    // Deliberately doesn't open the big feedback panel -- typing happens
    // right in the floating popup next to the selection instead, so jotting
    // one comment doesn't dump the PM into a review of every comment made so
    // far. The panel is opt-in via the "Feedback" button when they actually
    // want that list.
    setCommentDraft({ anchor, id: null, text: "" });
  }

  function startEditComment(anchor: Anchor, id: string) {
    const entry = findThread(anchor)?.comments.find((c) => c.id === id);
    setCommentDraft({ anchor, id, text: entry?.text ?? "" });
  }

  function saveCommentDraft() {
    if (!commentDraft) return;
    const trimmed = commentDraft.text.trim();
    if (!trimmed) {
      setCommentDraft(null);
      setSelectionPopup(null);
      return;
    }
    setThreads((prev) => {
      const idx = prev.findIndex((t) => sameAnchor(t.anchor, commentDraft.anchor));
      if (idx === -1) {
        return [...prev, { anchor: commentDraft.anchor, comments: [{ id: newId("c"), text: trimmed, replies: [] }] }];
      }
      return prev.map((t, i) =>
        i !== idx
          ? t
          : {
              ...t,
              comments:
                commentDraft.id === null
                  ? [...t.comments, { id: newId("c"), text: trimmed, replies: [] }]
                  : t.comments.map((c) => (c.id === commentDraft.id ? { ...c, text: trimmed } : c)),
            }
      );
    });
    setCommentDraft(null);
    setSelectionPopup(null);
  }

  function removeComment(anchor: Anchor, id: string) {
    setThreads((prev) =>
      prev
        .map((t) => (sameAnchor(t.anchor, anchor) ? { ...t, comments: t.comments.filter((c) => c.id !== id) } : t))
        .filter((t) => t.comments.length > 0)
    );
  }

  function startReply(anchor: Anchor, commentId: string) {
    setReplyDraft({ anchor, commentId, id: null, text: "" });
  }

  function startEditReply(anchor: Anchor, commentId: string, replyId: string) {
    const comment = findThread(anchor)?.comments.find((c) => c.id === commentId);
    const reply = comment?.replies.find((r) => r.id === replyId);
    setReplyDraft({ anchor, commentId, id: replyId, text: reply?.text ?? "" });
  }

  function saveReplyDraft() {
    if (!replyDraft) return;
    const trimmed = replyDraft.text.trim();
    if (!trimmed) {
      setReplyDraft(null);
      return;
    }
    setThreads((prev) =>
      prev.map((t) => {
        if (!sameAnchor(t.anchor, replyDraft.anchor)) return t;
        return {
          ...t,
          comments: t.comments.map((c) => {
            if (c.id !== replyDraft.commentId) return c;
            const replies =
              replyDraft.id === null
                ? [...c.replies, { id: newId("r"), text: trimmed }]
                : c.replies.map((r) => (r.id === replyDraft.id ? { ...r, text: trimmed } : r));
            return { ...c, replies };
          }),
        };
      })
    );
    setReplyDraft(null);
  }

  function removeReply(anchor: Anchor, commentId: string, replyId: string) {
    setThreads((prev) =>
      prev.map((t) =>
        !sameAnchor(t.anchor, anchor)
          ? t
          : {
              ...t,
              comments: t.comments.map((c) =>
                c.id === commentId ? { ...c, replies: c.replies.filter((r) => r.id !== replyId) } : c
              ),
            }
      )
    );
  }

  function startAddLine(quote: string | null) {
    setAddingLineFor(quote ?? "");
    setNewLineText("");
    // "Add a line anywhere" (quote === null) only ever comes from inside the
    // already-open panel -- open it for that case, but leave it closed for
    // an anchored insert triggered from the selection popup, same reasoning
    // as startNewComment above.
    if (quote === null) onPanelOpenChange(true);
  }

  function saveNewLine() {
    const text = newLineText.trim();
    if (!text) {
      setAddingLineFor(null);
      setSelectionPopup(null);
      return;
    }
    setAdditions((prev) => [...prev, { id: newId("line"), afterQuote: addingLineFor || null, text }]);
    setAddingLineFor(null);
    setNewLineText("");
    setSelectionPopup(null);
  }

  function removeAddition(id: string) {
    setAdditions((prev) => prev.filter((a) => a.id !== id));
  }

  // Adds the question to the SAME local pile as comments/additions --
  // marked in the document instantly, same as a comment, and only actually
  // reaches the judge once the PM submits feedback and the drafting model
  // reads it as part of that one batch (see compileFeedback below). No API
  // call here at all.
  function submitAskJudge() {
    if (!askJudgeDraft || !askJudgeDraft.text.trim()) return;
    setAskEntries((prev) => [
      ...prev,
      { id: newId("ask"), anchor: askJudgeDraft.anchor, question: askJudgeDraft.text.trim() },
    ]);
    setAskJudgeDraft(null);
    setSelectionPopup(null);
  }

  function removeAskEntry(id: string) {
    setAskEntries((prev) => prev.filter((a) => a.id !== id));
    setAskPopup(null);
  }

  function saveAskEdit() {
    if (!askEditDraft) return;
    const trimmed = askEditDraft.text.trim();
    if (!trimmed) {
      setAskEditDraft(null);
      return;
    }
    setAskEntries((prev) => prev.map((a) => (a.id === askEditDraft.id ? { ...a, question: trimmed } : a)));
    setAskEditDraft(null);
  }

  function addJudgeReply(findingId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setJudgeReplies((prev) => ({ ...prev, [findingId]: [...(prev[findingId] ?? []), trimmed] }));
  }

  const totalCommentCount = threads.reduce(
    (sum, t) => sum + t.comments.length + t.comments.reduce((s, c) => s + c.replies.length, 0),
    0
  );
  // Resolved/dismissed findings are settled -- only open ones still need a
  // decision, so only they count toward "is there anything to act on."
  const openJudgeFindings = judgeFindings.filter((f) => f.status === "open");
  const hasPendingFeedback =
    threads.length > 0 || additions.length > 0 || openJudgeFindings.length > 0 || askEntries.length > 0;
  const feedbackCount = totalCommentCount + additions.length + openJudgeFindings.length + askEntries.length;

  // The toggle button itself lives in PrdViewerClient's header row (next to
  // Redo PRD/Finalize), not floating here -- but it still needs this count
  // to show on its badge, so report it up rather than duplicate the
  // counting logic in the parent.
  useEffect(() => {
    onFeedbackCountChange?.(feedbackCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackCount]);

  useEffect(() => {
    onPendingChange?.(hasPendingFeedback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPendingFeedback]);

  // Escape or a click anywhere outside the panel (or its own toggle button,
  // which already handles its own open/close) collapses it -- matches how
  // every other floating popup in here already behaves.
  useEffect(() => {
    if (!panelOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onPanelOpenChange(false);
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-feedback-panel]") && !target.closest("[data-feedback-toggle]")) {
        onPanelOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [panelOpen, onPanelOpenChange]);

  function compileFeedback(): string {
    const lines: string[] = [
      "Here is the current PRD in full:",
      "",
      "---",
      content,
      "---",
      "",
      "Here's my feedback on the PRD:",
    ];

    if (threads.length > 0) {
      lines.push("", "Comments:");
      for (const t of threads) {
        // Always naming the occurrence, even the 1st, removes any doubt for
        // whoever reads this (model or human) about which exact spot is
        // meant when the phrase repeats elsewhere in the document.
        const label = `occurrence #${t.anchor.occurrence + 1} of "${t.anchor.quote}"`;
        for (const c of t.comments) {
          lines.push(`- On ${label}: ${c.text}`);
          for (const r of c.replies) {
            lines.push(`  - follow-up: ${r.text}`);
          }
        }
      }
    }

    if (additions.length > 0) {
      lines.push("", "Add:");
      for (const a of additions) {
        lines.push(
          a.afterQuote
            ? `- Add near "${a.afterQuote}": "${a.text}"`
            : `- Add (unanchored, place where it best fits): "${a.text}"`
        );
      }
    }

    // Questions the PM asked the judge to check -- these never trigger their
    // own investigation; they ride along in this same compiled message and
    // the drafting model (which already has the same repo-reading tools and
    // already verifies before asserting) is the one that actually looks
    // into them, same as everything else here.
    if (askEntries.length > 0) {
      lines.push("", "Questions for verification:");
      for (const a of askEntries) {
        lines.push(`- On occurrence #${a.anchor.occurrence + 1} of "${a.anchor.quote}": ${a.question}`);
      }
    }

    // Unifies the "ask Claude to fix" action with this same submit button --
    // open judge findings ride along with the PM's own comments/additions in
    // one compiled message, instead of a separate mechanism the PM has to
    // trigger on its own. Resolved/dismissed findings are settled and left
    // out; each thread's replies (any already-saved ones, plus whatever the
    // PM typed locally just now) come along so the full back-and-forth isn't
    // lost.
    if (openJudgeFindings.length > 0) {
      lines.push("", "Verification findings still open:");
      for (const f of openJudgeFindings) {
        const label = f.prdQuote ? ` (on occurrence #${f.occurrence + 1} of "${f.prdQuote}")` : "";
        lines.push(`- [${f.section}] ${f.summary}${label}`);
        if (f.whyItMatters) lines.push(`  Why it matters: ${f.whyItMatters}`);
        if (f.citation) lines.push(`  Citation: ${f.citation}`);
        for (const r of f.replies) {
          lines.push(`  - ${r.author === "pm" ? "PM" : "judge"} follow-up: ${r.text}`);
        }
        for (const text of judgeReplies[f.id] ?? []) {
          lines.push(`  - PM follow-up: ${text}`);
        }
      }
    }

    return lines.join("\n");
  }

  function handleSubmit() {
    onSubmit(compileFeedback());
    // Deliberately NOT clearing threads/additions/askEntries/judgeReplies or
    // localStorage here -- onSubmit can fail, and this component doesn't get
    // told either way (its signature is fire-and-forget). Everything clears
    // once the content-change effect above sees actual proof of success: a
    // new draft landing from the server.
  }

  // Shared between the hover popup and the big panel so editing/replying
  // behaves identically no matter which one you're looking at.
  function renderCommentThread(anchor: Anchor) {
    const list = findThread(anchor)?.comments ?? [];
    return (
      <>
        {list.map((c) => (
          <div key={c.id} className="mb-2 last:mb-0">
            {commentDraft && sameAnchor(commentDraft.anchor, anchor) && commentDraft.id === c.id ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={commentDraft.text}
                  onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
                  className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text focus:border-bb-red focus:outline-none"
                />
                <button onClick={saveCommentDraft} className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white">
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-bb-text-secondary">
                <span className="flex-1">💬 {c.text}</span>
                <button
                  onClick={() => startEditComment(anchor, c.id)}
                  className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
                >
                  edit
                </button>
                <button
                  onClick={() => removeComment(anchor, c.id)}
                  className="shrink-0 text-bb-text-tertiary hover:text-bb-red"
                >
                  remove
                </button>
              </div>
            )}

            {c.replies.length > 0 && (
              <div className="ml-4 mt-1 space-y-1 border-l border-bb-border pl-2">
                {c.replies.map((r) =>
                  replyDraft &&
                  sameAnchor(replyDraft.anchor, anchor) &&
                  replyDraft.commentId === c.id &&
                  replyDraft.id === r.id ? (
                    <div key={r.id} className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={replyDraft.text}
                        onChange={(e) => setReplyDraft({ ...replyDraft, text: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveReplyDraft()}
                        className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text focus:border-bb-red focus:outline-none"
                      />
                      <button onClick={saveReplyDraft} className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white">
                        Save
                      </button>
                    </div>
                  ) : (
                    <div key={r.id} className="flex items-start gap-2 text-xs text-bb-text-tertiary">
                      <span className="flex-1">↳ {r.text}</span>
                      <button
                        onClick={() => startEditReply(anchor, c.id, r.id)}
                        className="shrink-0 hover:text-bb-text"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => removeReply(anchor, c.id, r.id)}
                        className="shrink-0 hover:text-bb-red"
                      >
                        remove
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {replyDraft && sameAnchor(replyDraft.anchor, anchor) && replyDraft.commentId === c.id && replyDraft.id === null ? (
              <div className="ml-4 mt-1 flex items-center gap-1 border-l border-bb-border pl-2">
                <input
                  autoFocus
                  value={replyDraft.text}
                  onChange={(e) => setReplyDraft({ ...replyDraft, text: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saveReplyDraft()}
                  placeholder="Reply…"
                  className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
                />
                <button onClick={saveReplyDraft} className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => startReply(anchor, c.id)}
                className="ml-4 mt-1 text-[11px] text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
              >
                + reply
              </button>
            )}
          </div>
        ))}

        {commentDraft && sameAnchor(commentDraft.anchor, anchor) && commentDraft.id === null && (
          <div className="mt-1 flex items-center gap-1">
            <input
              autoFocus
              value={commentDraft.text}
              onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
              placeholder="Add another comment…"
              className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
            <button onClick={saveCommentDraft} className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white">
              Save
            </button>
          </div>
        )}
        {!(commentDraft && sameAnchor(commentDraft.anchor, anchor)) && (
          <button
            onClick={() => startNewComment(anchor)}
            className="mt-1 text-[11px] text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
          >
            + add another comment
          </button>
        )}
      </>
    );
  }

  // Shared between the judge popup and the diagram badge popup, same reason
  // renderCommentThread is shared above -- one place for reply/resolve/
  // dismiss behavior regardless of which popup is showing this finding.
  function renderJudgeFinding(findingId: string) {
    const finding = judgeFindings.find((f) => f.id === findingId);
    if (!finding) return null;
    const draftHere = judgeReplyDraft?.findingId === findingId ? judgeReplyDraft.text : "";
    const localReplies = judgeReplies[findingId] ?? [];

    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-full bg-bb-amber-dim px-2 py-0.5 text-[10px] font-semibold text-bb-amber">
            {finding.category}
          </span>
          {finding.status !== "open" && (
            <span className="rounded-full bg-bb-surface px-2 py-0.5 text-[10px] text-bb-text-tertiary">
              {finding.status}
            </span>
          )}
        </div>
        <p className="mb-1.5 text-xs text-bb-text">{finding.summary}</p>
        {finding.whyItMatters && (
          <p className="mb-1.5 text-[11px] text-bb-text-secondary">
            <span className="text-bb-text-tertiary">Why it matters: </span>
            {finding.whyItMatters}
          </p>
        )}
        {finding.citation && (
          <p className="mb-2 font-mono text-[10px] text-bb-text-tertiary">{finding.citation}</p>
        )}

        {(finding.replies.length > 0 || localReplies.length > 0) && (
          <div className="mb-2 space-y-1 border-l border-bb-border pl-2">
            {finding.replies.map((r) => (
              <div key={r.id} className="text-xs text-bb-text-secondary">
                <span className="text-bb-text-tertiary">{r.author === "pm" ? "You: " : "Judge: "}</span>
                {r.text}
              </div>
            ))}
            {localReplies.map((text, i) => (
              <div key={`local-${i}`} className="text-xs text-bb-text-secondary">
                <span className="text-bb-text-tertiary">You (not sent yet): </span>
                {text}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <input
            value={draftHere}
            onChange={(e) => setJudgeReplyDraft({ findingId, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !draftHere.trim()) return;
              addJudgeReply(findingId, draftHere);
              setJudgeReplyDraft(null);
            }}
            placeholder="Reply (included next time you submit feedback)…"
            className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-amber focus:outline-none"
          />
          <button
            onClick={() => {
              if (!draftHere.trim()) return;
              addJudgeReply(findingId, draftHere);
              setJudgeReplyDraft(null);
            }}
            disabled={!draftHere.trim()}
            className="shrink-0 rounded-md border border-bb-border px-2 py-1 text-[11px] text-bb-text-secondary hover:border-bb-amber hover:text-bb-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reply
          </button>
        </div>

        <div className="mt-2 flex items-center gap-3 text-[11px]">
          {finding.status !== "resolved" && (
            <button
              onClick={() => onResolveFinding(findingId)}
              className="text-bb-text-tertiary underline decoration-dotted hover:text-bb-green"
            >
              Resolve
            </button>
          )}
          {finding.status !== "dismissed" && (
            <button
              onClick={() => onDismissFinding(findingId)}
              className="text-bb-text-tertiary underline decoration-dotted hover:text-bb-red"
            >
              Dismiss
            </button>
          )}
          {finding.status !== "open" && (
            <button
              onClick={() => onReopenFinding(findingId)}
              className="text-bb-text-tertiary underline decoration-dotted hover:text-bb-text-secondary"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    );
  }

  // A not-yet-submitted question -- editable/removable, same shape as a
  // plain comment, just without a reply thread (there's nothing to reply to
  // until the judge actually looks at it, which only happens on submit).
  function renderAskEntry(id: string) {
    const entry = askEntries.find((a) => a.id === id);
    if (!entry) return null;
    const editing = askEditDraft?.id === id;
    return (
      <div>
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={askEditDraft!.text}
              onChange={(e) => setAskEditDraft({ id, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveAskEdit()}
              className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text focus:border-bb-amber focus:outline-none"
            />
            <button onClick={saveAskEdit} className="rounded-md bg-bb-amber px-2 py-1 text-xs font-semibold text-bb-bg">
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-bb-text-secondary">
            <span className="flex-1">❓ {entry.question}</span>
            <button
              onClick={() => setAskEditDraft({ id, text: entry.question })}
              className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
            >
              edit
            </button>
            <button
              onClick={() => removeAskEntry(id)}
              className="shrink-0 text-bb-text-tertiary hover:text-bb-red"
            >
              remove
            </button>
          </div>
        )}
        <p className="mt-1 text-[11px] text-bb-text-tertiary">Sent to the judge next time you submit feedback.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="prd-print-area relative">
        <DocumentPanel content={content} onReady={() => setContentReady(true)} />
      </div>

      {hoverPopup && (
        <div
          data-hover-popup
          onMouseEnter={cancelHoverClose}
          onMouseLeave={() => scheduleHoverClose(hoverPopup.anchor)}
          className="absolute z-20 w-80 rounded-md border border-bb-border bg-bb-panel p-3 shadow-lg print:hidden"
          style={{ top: hoverPopup.top, left: hoverPopup.left }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="text-[11px] italic text-bb-text-tertiary">
              &ldquo;{hoverPopup.anchor.quote}&rdquo;
              {hoverPopup.anchor.occurrence > 0 && (
                <span className="ml-1 text-bb-text-tertiary">(occurrence #{hoverPopup.anchor.occurrence + 1})</span>
              )}
            </div>
            <button
              onClick={() => setHoverPopup(null)}
              className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {renderCommentThread(hoverPopup.anchor)}
        </div>
      )}

      {diagramBadgePopup && (
        <div
          data-diagram-badge-popup
          className="absolute z-20 w-80 max-h-96 overflow-y-auto rounded-md border border-bb-border bg-bb-panel p-3 shadow-lg print:hidden"
          style={{ top: diagramBadgePopup.top, left: diagramBadgePopup.left }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-bb-text">Comments on labels in this diagram</span>
            <button
              onClick={() => setDiagramBadgePopup(null)}
              className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {diagramBadgePopup.anchors.map((anchor, i) => (
            <div
              key={`${anchor.quote} ${anchor.occurrence}`}
              className={i > 0 ? "mt-3 border-t border-bb-border-subtle pt-3" : ""}
            >
              <div className="mb-1.5 text-[11px] italic text-bb-text-tertiary">
                &ldquo;{anchor.quote}&rdquo;
                {anchor.occurrence > 0 && (
                  <span className="ml-1 text-bb-text-tertiary">(occurrence #{anchor.occurrence + 1})</span>
                )}
              </div>
              {renderCommentThread(anchor)}
            </div>
          ))}
          {diagramBadgePopup.judgeFindingIds.map((findingId, i) => (
            <div
              key={findingId}
              className={
                i > 0 || diagramBadgePopup.anchors.length > 0 ? "mt-3 border-t border-bb-border-subtle pt-3" : ""
              }
            >
              {renderJudgeFinding(findingId)}
            </div>
          ))}
          {diagramBadgePopup.askEntryIds.map((askId, i) => (
            <div
              key={askId}
              className={
                i > 0 || diagramBadgePopup.anchors.length > 0 || diagramBadgePopup.judgeFindingIds.length > 0
                  ? "mt-3 border-t border-bb-border-subtle pt-3"
                  : ""
              }
            >
              {renderAskEntry(askId)}
            </div>
          ))}
        </div>
      )}

      {judgePopup && (
        <div
          data-judge-popup
          className="absolute z-20 w-80 rounded-md border border-bb-amber/40 bg-bb-panel p-3 shadow-lg print:hidden"
          style={{ top: judgePopup.top, left: judgePopup.left }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold text-bb-amber">Verification</span>
            <button
              onClick={() => setJudgePopup(null)}
              className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {renderJudgeFinding(judgePopup.findingId)}
        </div>
      )}

      {askPopup &&
        (() => {
          const entry = askEntries.find((a) => sameAnchor(a.anchor, askPopup.anchor));
          if (!entry) return null;
          return (
            <div
              data-ask-popup
              className="absolute z-20 w-80 rounded-md border border-bb-amber/40 bg-bb-panel p-3 shadow-lg print:hidden"
              style={{ top: askPopup.top, left: askPopup.left }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-bb-amber">Your question</span>
                <button
                  onClick={() => setAskPopup(null)}
                  className="shrink-0 text-bb-text-tertiary hover:text-bb-text"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {renderAskEntry(entry.id)}
            </div>
          );
        })()}

      {selectionPopup &&
        (commentDraft && sameAnchor(commentDraft.anchor, selectionPopup.anchor) && commentDraft.id === null ? (
          <div
            data-selection-popup
            className="absolute z-20 flex items-center gap-1 rounded-md border border-bb-border bg-bb-panel p-1.5 shadow-lg print:hidden"
            style={{ top: selectionPopup.top, left: selectionPopup.left }}
          >
            <input
              autoFocus
              value={commentDraft.text}
              onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
              placeholder="Add a comment…"
              className="w-56 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
            <button
              onClick={saveCommentDraft}
              className="shrink-0 rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
            >
              Save
            </button>
          </div>
        ) : addingLineFor === selectionPopup.anchor.quote ? (
          <div
            data-selection-popup
            className="absolute z-20 flex items-center gap-1 rounded-md border border-bb-border bg-bb-panel p-1.5 shadow-lg print:hidden"
            style={{ top: selectionPopup.top, left: selectionPopup.left }}
          >
            <input
              autoFocus
              value={newLineText}
              onChange={(e) => setNewLineText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveNewLine()}
              placeholder="New line to add…"
              className="w-56 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
            />
            <button
              onClick={saveNewLine}
              className="shrink-0 rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
            >
              Save
            </button>
          </div>
        ) : askJudgeDraft && sameAnchor(askJudgeDraft.anchor, selectionPopup.anchor) ? (
          <div
            data-selection-popup
            className="absolute z-20 flex items-center gap-1 rounded-md border border-bb-amber/40 bg-bb-panel p-1.5 shadow-lg print:hidden"
            style={{ top: selectionPopup.top, left: selectionPopup.left }}
          >
            <input
              autoFocus
              value={askJudgeDraft.text}
              onChange={(e) => setAskJudgeDraft({ ...askJudgeDraft, text: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submitAskJudge()}
              placeholder="What should the judge check here?"
              className="w-64 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-amber focus:outline-none"
            />
            <button
              onClick={submitAskJudge}
              disabled={!askJudgeDraft.text.trim()}
              className="shrink-0 rounded-md bg-bb-amber px-2 py-1 text-xs font-semibold text-bb-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        ) : (
          <div
            data-selection-popup
            className="absolute z-20 flex items-center gap-1 rounded-md border border-bb-border bg-bb-panel px-1.5 py-1 shadow-lg print:hidden"
            style={{ top: selectionPopup.top, left: selectionPopup.left }}
          >
            <button
              onClick={() => startNewComment(selectionPopup.anchor)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-bb-text hover:bg-bb-surface"
            >
              💬 Comment
            </button>
            <button
              onClick={() => startAddLine(selectionPopup.anchor.quote)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-bb-text hover:bg-bb-surface"
            >
              + Insert line here
            </button>
            <button
              onClick={() => setAskJudgeDraft({ anchor: selectionPopup.anchor, text: "" })}
              title="Ask the judge to independently check this passage -- included next time you submit feedback, not sent right away"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-bb-amber hover:bg-bb-surface"
            >
              ❓ Ask judge
            </button>
          </div>
        ))}

      {panelOpen && (
        <div
          data-feedback-panel
          className="fixed right-6 top-40 z-20 max-h-[65vh] w-96 overflow-y-auto rounded-lg border border-bb-border bg-bb-panel p-4 shadow-lg print:hidden"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-bb-text">PRD feedback</span>
            <button
              onClick={() => onPanelOpenChange(false)}
              className="text-bb-text-tertiary hover:text-bb-text"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {!hasPendingFeedback && !commentDraft && (
            <p className="text-xs text-bb-text-tertiary">
              Select text in the PRD to comment on it, insert a new line near it, or ask the judge to check it --
              everything sends together when you submit.
            </p>
          )}

          {commentDraft && !findThread(commentDraft.anchor) && !selectionPopup && (
            <div className="mb-3 rounded-md border-l-2 border-bb-red bg-bb-surface p-2">
              <div className="mb-1.5 text-xs italic text-bb-text-tertiary">
                &ldquo;{commentDraft.anchor.quote}&rdquo;
              </div>
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={commentDraft.text}
                  onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && saveCommentDraft()}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
                />
                <button
                  onClick={saveCommentDraft}
                  className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {threads.map((t) => (
            <div key={`${t.anchor.quote} ${t.anchor.occurrence}`} className="mb-3 rounded-md border-l-2 border-bb-red bg-bb-surface p-2">
              <div className="mb-1.5 text-xs italic text-bb-text-tertiary">
                &ldquo;{t.anchor.quote}&rdquo;
                {t.anchor.occurrence > 0 && (
                  <span className="ml-1 text-bb-text-tertiary">(occurrence #{t.anchor.occurrence + 1})</span>
                )}
              </div>
              {renderCommentThread(t.anchor)}
            </div>
          ))}

          {additions.map((a) => (
            <div key={a.id} className="mb-3 flex items-start gap-2 rounded-md border-l-2 border-bb-red bg-bb-surface p-2">
              <div className="flex-1">
                <span className="rounded-full bg-bb-green/20 px-1.5 py-0.5 text-[9px] font-semibold text-bb-green">
                  new line
                </span>
                <div className="mt-1 text-xs text-bb-text">{a.text}</div>
                {a.afterQuote && (
                  <div className="mt-1 text-[11px] italic text-bb-text-tertiary">
                    near &ldquo;{a.afterQuote}&rdquo;
                  </div>
                )}
              </div>
              <button
                onClick={() => removeAddition(a.id)}
                className="shrink-0 text-xs text-bb-text-tertiary hover:text-bb-red"
              >
                remove
              </button>
            </div>
          ))}

          {addingLineFor !== null && (
            <div className="mb-3 rounded-md border-l-2 border-bb-red bg-bb-surface p-2">
              {addingLineFor && (
                <div className="mb-1 text-[11px] italic text-bb-text-tertiary">
                  near &ldquo;{addingLineFor}&rdquo;
                </div>
              )}
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newLineText}
                  onChange={(e) => setNewLineText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveNewLine()}
                  placeholder="New line to add…"
                  className="flex-1 rounded-md border border-bb-border bg-bb-bg px-2 py-1 text-xs text-bb-text placeholder:text-bb-text-tertiary focus:border-bb-red focus:outline-none"
                />
                <button
                  onClick={saveNewLine}
                  className="rounded-md bg-bb-red px-2 py-1 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => startAddLine(null)}
            className="mb-3 w-full rounded-md border border-dashed border-bb-border py-1.5 text-xs text-bb-text-tertiary hover:border-bb-red hover:text-bb-text"
          >
            + Add a line anywhere
          </button>

          {askEntries.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-xs font-bold text-bb-amber">Questions for the judge ({askEntries.length})</div>
              {askEntries.map((a) => (
                <div key={a.id} className="mb-2 rounded-md border-l-2 border-bb-amber bg-bb-surface p-2">
                  {renderAskEntry(a.id)}
                </div>
              ))}
            </div>
          )}

          {openJudgeFindings.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-xs font-bold text-bb-amber">
                Verification ({openJudgeFindings.length} open)
              </div>
              {openJudgeFindings.map((f) => (
                <div key={f.id} className="mb-2 rounded-md border-l-2 border-bb-amber bg-bb-surface p-2">
                  {renderJudgeFinding(f.id)}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!hasPendingFeedback || submitting}
            className="w-full rounded-md bg-bb-red py-2 text-xs font-semibold text-white hover:bg-bb-red-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Starting revision…" : "Submit feedback for revision"}
          </button>
        </div>
      )}
    </div>
  );
}
