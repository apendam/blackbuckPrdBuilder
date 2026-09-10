"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PhaseStepper } from "@/components/PhaseStepper";
import { ChatMessage as ChatMessageBubble, TypingIndicator } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { RefreshReposModal } from "@/components/RefreshReposModal";
import { SkeletonEditor } from "@/components/SkeletonEditor";
import {
  ChatMessage,
  ChatTurnResponse,
  PhaseState,
  Phase,
  PHASES,
  PHASE_LABELS,
  Attachment,
  SkeletonSection,
  SkeletonHistoryEntry,
  VerificationFinding,
} from "@/lib/types";
import { classifyApiError, FriendlyError } from "@/lib/errors";
import { costForBreakdown, formatCost, formatTokenCount } from "@/lib/pricing";

const PHASE_HEADLINE: Record<Phase, string> = {
  objective: "What are you trying to achieve?",
  problem_statement: "What's blocking that today?",
  sizing: "Why solve this now?",
  scope: "Which teams does this touch?",
  context_loading: "Loading relevant context",
  skeleton_draft: "Reviewing the skeleton draft",
  skeleton_revision: "Revising the skeleton",
  full_prd: "Expanding into the full PRD",
  // Never actually shown as the headline -- the app marks this phase
  // complete on its own (see runChatTurn's auto-verify block) without ever
  // setting it as phaseState.current, so PHASE_HEADLINE's Record<Phase, ...>
  // constraint is the only reason this entry needs to exist.
  full_prd_verify: "Verifying against the live repos",
  output: "Wrapping up and saving",
};

export function ChatClient({
  conversationId,
  initialTitle,
  initialMessages,
  initialPhaseState,
  initialSkeletonSections,
  initialSkeletonHistory,
  initialSavedPrd,
  initialGoogleDocUrl,
  initialVerificationFindings,
  userName,
  userEmail,
  signOutAction,
}: {
  conversationId: string;
  initialTitle: string | null;
  initialMessages: ChatMessage[];
  initialPhaseState: PhaseState;
  initialSkeletonSections: SkeletonSection[];
  initialSkeletonHistory: SkeletonHistoryEntry[];
  initialSavedPrd: string | null;
  initialGoogleDocUrl: string | null;
  initialVerificationFindings: VerificationFinding[];
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [title, setTitle] = useState<string | null>(initialTitle);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phaseState, setPhaseState] = useState<PhaseState>(initialPhaseState);
  const [skeletonSections, setSkeletonSections] = useState<SkeletonSection[]>(
    initialSkeletonSections
  );
  const [skeletonHistory, setSkeletonHistory] = useState<SkeletonHistoryEntry[]>(
    initialSkeletonHistory
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [savedPrdPath, setSavedPrdPath] = useState<string | null>(initialSavedPrd);
  const [googleDocUrl, setGoogleDocUrl] = useState<string | null>(initialGoogleDocUrl);
  // Only kept for the "N to review" count in the saved-PRD box below --
  // reviewing/resolving findings themselves now happens in the PRD viewer
  // (/prd/[id]), anchored onto the actual document, not in a chat-embedded
  // panel here.
  const [verificationFindings, setVerificationFindings] = useState<VerificationFinding[]>(
    initialVerificationFindings
  );
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const kickedOff = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function startEditingTitle() {
    setTitleDraft(title || "");
    setEditingTitle(true);
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    // Empty or unchanged -- nothing to persist, just close the editor.
    if (!trimmed || trimmed === title) return;
    const previous = title;
    setTitle(trimmed); // optimistic -- this is a single-field rename, not worth a loading state
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
    } catch (err) {
      setTitle(previous); // revert on failure rather than leave the UI claiming a rename that didn't stick
      setError(classifyApiError(err instanceof Error ? err.message : "Request failed"));
    }
  }

  async function sendTurn(message: string, attachments: Attachment[] = []): Promise<boolean> {
    setLoading(true);
    setError(null);
    const sentAt = new Date().toISOString();
    setMessages((prev) => [...prev, { role: "user", content: message, attachments, at: sentAt }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message, attachments, at: sentAt }),
      });
      const data: ChatTurnResponse & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, at: data.assistantAt, usage: data.usage },
      ]);
      setPhaseState(data.phaseState);
      if (data.title) setTitle(data.title);
      if (data.skeletonSections) setSkeletonSections(data.skeletonSections);
      if (data.skeletonHistory) setSkeletonHistory(data.skeletonHistory);
      if (data.savedPrd) setSavedPrdPath(data.savedPrd.path);
      if (data.googleDocUrl) setGoogleDocUrl(data.googleDocUrl);
      // Present (even as []) only on the turn that actually ran verification --
      // absent on every other turn, so this never clobbers findings from an
      // earlier turn with "nothing new to report."
      if (data.verificationFindings) setVerificationFindings(data.verificationFindings);
      return true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      setError(classifyApiError(raw));
      // The turn never actually saved -- drop the optimistic user bubble so
      // the transcript doesn't claim something was sent when it wasn't.
      setMessages((prev) => prev.slice(0, -1));
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (kickedOff.current) return;
    // A PRD-revision conversation (see PrdViewerClient's "submit feedback") is
    // created with carried-forward history, not empty -- so it never hits the
    // greeting kickoff below. It stashes its opening message here instead,
    // since the normal create-then-send flow can't seed a first turn without
    // duplicating everything sendTurn already does (optimistic UI, error
    // handling, etc.).
    const pendingKey = `prd-builder:pending-seed:${conversationId}`;
    const pending = typeof window !== "undefined" ? sessionStorage.getItem(pendingKey) : null;
    if (pending) {
      kickedOff.current = true;
      sessionStorage.removeItem(pendingKey);
      sendTurn(pending);
      return;
    }
    if (initialMessages.length > 0) return;
    kickedOff.current = true;
    sendTurn("Hi, I'd like to write a new PRD.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, skeletonSections]);

  const conversationUsage = useMemo(() => {
    const byModel = messages.flatMap((m) => m.usage?.byModel ?? []);
    const totalTokens = byModel.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
    return { totalTokens, totalCost: costForBreakdown(byModel) };
  }, [messages]);

  const phaseIndex = PHASES.indexOf(phaseState.current);
  const showSkeletonEditor =
    skeletonSections.length > 0 &&
    (phaseState.current === "skeleton_draft" || phaseState.current === "skeleton_revision");
  // A draft now gets saved (and the box below shown) as soon as Phase 8
  // produces a complete-looking draft -- well before the PM finalizes
  // anything. Finalizing (create_google_doc + advancing to Output) is a
  // separate, explicit action the PM takes from the PRD viewer once they're
  // done reviewing judge findings there, not a button in chat -- see
  // PrdViewerClient's Finalize action.
  const isFinalized = phaseState.current === "output";
  const openFindingCount = verificationFindings.filter((f) => f.status === "open").length;

  return (
    <div className="flex h-screen flex-col">
      <AppHeader
        userName={userName}
        userEmail={userEmail}
        signOutAction={signOutAction}
        onRefreshClick={() => setRefreshOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <PhaseStepper phaseState={phaseState} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-bb-border-subtle px-8 pb-5 pt-6">
            <div className="min-w-0">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  placeholder="Untitled PRD"
                  className="mb-1.5 w-full max-w-xl border-b border-bb-red bg-transparent text-2xl font-bold text-bb-text placeholder:text-bb-text-tertiary focus:outline-none"
                />
              ) : (
                <button
                  onClick={startEditingTitle}
                  title="Click to rename"
                  className="group mb-1.5 flex items-center gap-2 text-left"
                >
                  <h1 className="text-2xl font-bold text-bb-text">{title || "(untitled PRD)"}</h1>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0 text-bb-text-tertiary opacity-0 group-hover:opacity-100"
                  >
                    <path
                      d="M16.862 3.487a2.06 2.06 0 0 1 2.915 2.914L7.5 18.678l-4 1 1-4L16.862 3.487Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <div className="mb-1 text-xs font-semibold tracking-widest text-bb-red">
                PHASE {phaseIndex + 1} — {PHASE_LABELS[phaseState.current].toUpperCase()}
              </div>
              <p className="text-sm text-bb-text-secondary">{PHASE_HEADLINE[phaseState.current]}</p>
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-2">
              {conversationUsage.totalTokens > 0 && (
                <span
                  title="Total spend across this entire conversation so far"
                  className="rounded-full border border-bb-border-subtle px-3 py-1.5 text-xs text-bb-text-tertiary"
                >
                  {formatTokenCount(conversationUsage.totalTokens)} tokens ·{" "}
                  {formatCost(conversationUsage.totalCost)}
                </span>
              )}
              <Link
                href="/"
                className="rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
              >
                ← Dashboard
              </Link>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="space-y-4 px-8 py-6">
              {messages.map((m, i) => (
                <ChatMessageBubble key={i} message={m} />
              ))}
              {loading && <TypingIndicator phase={phaseState.current} />}
              {error && (
                <div className="rounded-lg border border-bb-red bg-bb-red-dim px-4 py-3 text-sm text-bb-text">
                  <div className="mb-0.5 font-semibold">{error.title}</div>
                  <div className="text-bb-text-secondary">{error.detail}</div>
                </div>
              )}
              {savedPrdPath && (
                <div className="rounded-lg border border-bb-green/40 bg-bb-surface px-4 py-3 text-sm text-bb-text">
                  <div>
                    {isFinalized ? (
                      <>
                        PRD saved: <code className="text-bb-text-secondary">{savedPrdPath}</code>
                      </>
                    ) : (
                      <>
                        Draft saved.{" "}
                        {openFindingCount > 0
                          ? `${openFindingCount} verification finding${openFindingCount === 1 ? "" : "s"} to review before finalizing.`
                          : "No verification findings flagged so far."}
                      </>
                    )}
                  </div>
                  {googleDocUrl && (
                    <div className="mt-1">
                      <a
                        href={googleDocUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-bb-red underline underline-offset-2"
                      >
                        Open Google Doc ↗
                      </a>
                    </div>
                  )}
                  <div className="mt-2">
                    <Link
                      href={`/prd/${conversationId}`}
                      className="text-bb-red underline underline-offset-2"
                    >
                      {isFinalized ? "View finished PRD →" : "Review the draft PRD →"}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {showSkeletonEditor && (
              <SkeletonEditor
                sections={skeletonSections}
                history={skeletonHistory}
                disabled={loading}
                onSubmitFeedback={(text) => sendTurn(text)}
                onApprove={() => sendTurn("The skeleton looks good — please expand it into the full PRD.")}
              />
            )}
          </div>

          <ChatInput onSend={sendTurn} disabled={loading} />
        </main>
      </div>

      {refreshOpen && <RefreshReposModal onClose={() => setRefreshOpen(false)} />}
    </div>
  );
}
