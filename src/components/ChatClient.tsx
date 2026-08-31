"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PhaseStepper } from "@/components/PhaseStepper";
import { ChatMessage as ChatMessageBubble } from "@/components/ChatMessage";
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
} from "@/lib/types";

const PHASE_HEADLINE: Record<Phase, string> = {
  objective: "What are you trying to achieve?",
  problem_statement: "What's blocking that today?",
  sizing: "Why solve this now?",
  scope: "Which teams does this touch?",
  context_loading: "Loading relevant context",
  skeleton_draft: "Reviewing the skeleton draft",
  skeleton_revision: "Revising the skeleton",
  full_prd: "Expanding into the full PRD",
  output: "Wrapping up and saving",
};

export function ChatClient({
  conversationId,
  initialMessages,
  initialPhaseState,
  initialSkeletonSections,
  initialSavedPrd,
  initialGoogleDocUrl,
  userName,
  userEmail,
  signOutAction,
}: {
  conversationId: string;
  initialMessages: ChatMessage[];
  initialPhaseState: PhaseState;
  initialSkeletonSections: SkeletonSection[];
  initialSavedPrd: string | null;
  initialGoogleDocUrl: string | null;
  userName?: string | null;
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [phaseState, setPhaseState] = useState<PhaseState>(initialPhaseState);
  const [skeletonSections, setSkeletonSections] = useState<SkeletonSection[]>(
    initialSkeletonSections
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPrdPath, setSavedPrdPath] = useState<string | null>(initialSavedPrd);
  const [googleDocUrl, setGoogleDocUrl] = useState<string | null>(initialGoogleDocUrl);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const kickedOff = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function sendTurn(message: string, attachments: Attachment[] = []) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message, attachments }),
      });
      const data: ChatTurnResponse & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setMessages((prev) => [
        ...prev,
        { role: "user", content: message, attachments },
        { role: "assistant", content: data.reply },
      ]);
      setPhaseState(data.phaseState);
      if (data.skeletonSections) setSkeletonSections(data.skeletonSections);
      if (data.savedPrd) setSavedPrdPath(data.savedPrd.path);
      if (data.googleDocUrl) setGoogleDocUrl(data.googleDocUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (kickedOff.current || initialMessages.length > 0) return;
    kickedOff.current = true;
    sendTurn("Hi, I'd like to write a new PRD.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, skeletonSections]);

  const phaseIndex = PHASES.indexOf(phaseState.current);
  const showSkeletonEditor =
    skeletonSections.length > 0 &&
    (phaseState.current === "skeleton_draft" || phaseState.current === "skeleton_revision");

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
            <div>
              <div className="mb-1 text-xs font-semibold tracking-widest text-bb-red">
                PHASE {phaseIndex + 1} — {PHASE_LABELS[phaseState.current].toUpperCase()}
              </div>
              <h1 className="text-2xl font-bold text-bb-text">
                {PHASE_HEADLINE[phaseState.current]}
              </h1>
            </div>
            <Link
              href="/"
              className="mt-1 shrink-0 rounded-full border border-bb-border px-3 py-1.5 text-xs font-semibold text-bb-text-secondary hover:border-bb-red hover:text-bb-text"
            >
              ← Dashboard
            </Link>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="space-y-4 px-8 py-6">
              {messages.map((m, i) => (
                <ChatMessageBubble key={i} message={m} />
              ))}
              {loading && (
                <div className="text-xs text-bb-text-tertiary">PRD Builder is thinking…</div>
              )}
              {error && (
                <div className="rounded-lg border border-bb-red bg-bb-red-dim px-4 py-3 text-sm text-bb-text">
                  {error}
                </div>
              )}
              {savedPrdPath && (
                <div className="rounded-lg border border-bb-green/40 bg-bb-surface px-4 py-3 text-sm text-bb-text">
                  <div>
                    PRD saved: <code className="text-bb-text-secondary">{savedPrdPath}</code>
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
                      View finished PRD →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {showSkeletonEditor && (
              <SkeletonEditor
                sections={skeletonSections}
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
