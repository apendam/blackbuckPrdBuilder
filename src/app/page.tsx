"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PhaseStepper } from "@/components/PhaseStepper";
import { ChatMessage as ChatMessageBubble } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import {
  ChatMessage,
  ChatTurnResponse,
  PhaseState,
  INITIAL_PHASE_STATE,
  Phase,
  PHASES,
  PHASE_LABELS,
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

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phaseState, setPhaseState] = useState<PhaseState>(INITIAL_PHASE_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPrd, setSavedPrd] = useState<{ title: string; path: string } | null>(null);
  const kickedOff = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const phaseStateRef = useRef(phaseState);
  phaseStateRef.current = phaseState;

  async function sendTurn(nextMessages: ChatMessage[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, phaseState: phaseStateRef.current }),
      });
      const data: ChatTurnResponse & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      setPhaseState(data.phaseState);
      if (data.savedPrd) setSavedPrd(data.savedPrd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (kickedOff.current) return;
    kickedOff.current = true;
    const seed: ChatMessage[] = [
      { role: "user", content: "Hi, I'd like to write a new PRD." },
    ];
    setMessages(seed);
    sendTurn(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend(text: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    sendTurn(next);
  }

  const phaseIndex = PHASES.indexOf(phaseState.current);
  const visibleMessages = messages.length > 1 ? messages : [];

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <PhaseStepper phaseState={phaseState} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-bb-border-subtle px-8 pb-5 pt-6">
            <div className="mb-1 text-xs font-semibold tracking-widest text-bb-red">
              PHASE {phaseIndex + 1} — {PHASE_LABELS[phaseState.current].toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-bb-text">
              {PHASE_HEADLINE[phaseState.current]}
            </h1>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-8 py-6">
            {visibleMessages.map((m, i) => (
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
            {savedPrd && (
              <div className="rounded-lg border border-bb-green/40 bg-bb-surface px-4 py-3 text-sm text-bb-text">
                PRD saved: <code className="text-bb-text-secondary">{savedPrd.path}</code>
              </div>
            )}
          </div>

          <ChatInput onSend={handleSend} disabled={loading} />
        </main>
      </div>
    </div>
  );
}
