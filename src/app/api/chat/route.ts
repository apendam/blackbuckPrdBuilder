import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runChatTurn } from "@/lib/claude";
import { getUserModelSettings } from "@/lib/modelSettings";
import {
  getConversation,
  saveConversationTurn,
  startConversationTurn,
  clearTurnInProgress,
} from "@/lib/conversations";
import { ChatTurnRequest, ChatTurnResponse, ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: ChatTurnRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.conversationId || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json(
      { error: "conversationId and a non-empty message are required" },
      { status: 400 }
    );
  }

  const conversation = await getConversation(userId, body.conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const userAt = body.at ?? new Date().toISOString();
  const nextMessages: ChatMessage[] = [
    ...conversation.messages,
    { role: "user", content: body.message, attachments: body.attachments, at: userAt },
  ];

  // Claims the "a turn is running" lock and persists the PM's own message
  // immediately (before the potentially many-minute-long generation even
  // starts) -- so a page reload mid-turn shows the message plus a "still
  // generating" state, instead of looking like it vanished. Also refuses a
  // second, overlapping turn on the same conversation rather than racing two
  // saveConversationTurn calls against each other.
  const claimed = await startConversationTurn(userId, conversation.id, nextMessages);
  if (!claimed) {
    return NextResponse.json(
      {
        error:
          "A turn is already running for this conversation -- wait for it to finish, or reload the page to see its progress.",
      },
      { status: 409 }
    );
  }

  try {
    const modelSettings = await getUserModelSettings(userId);
    // A conversation forked from a parent (createRevision/createPrdRevision)
    // carries the parent's full message history forward, which can already
    // describe an older version's PRD as saved/complete -- until THIS
    // conversation has saved its own PRD, that history is ambiguous enough
    // that the model needs an explicit note it's looking at an older
    // version's finished state, not this one's.
    const isFreshRevision = Boolean(conversation.parentId) && !conversation.prdMarkdownPath;
    const result = await runChatTurn(
      nextMessages,
      { current: conversation.currentPhase, completed: conversation.completedPhases },
      modelSettings,
      userId,
      conversation.id,
      conversation.skeletonSections,
      conversation.skeletonHistory,
      isFreshRevision,
      conversation.verificationFindings,
      body.skipVerify
    );

    const assistantAt = new Date().toISOString();
    const finalMessages: ChatMessage[] = [
      ...nextMessages,
      { role: "assistant", content: result.reply, at: assistantAt, usage: result.usage },
    ];

    await saveConversationTurn(userId, conversation.id, finalMessages, result.phaseState, {
      title: result.title,
      verticals: result.verticals,
      skeletonSections: result.skeletonSections,
      skeletonHistory: result.skeletonHistory,
      savedPrd: result.savedPrd,
      googleDocUrl: result.googleDocUrl,
      verificationFindings: result.verificationFindings,
    });

    const responseBody: ChatTurnResponse = {
      reply: result.reply,
      phaseState: result.phaseState,
      title: result.title,
      skeletonSections: result.skeletonSections,
      skeletonHistory: result.skeletonHistory,
      savedPrd: result.savedPrd,
      googleDocUrl: result.googleDocUrl,
      verificationFindings: result.verificationFindings,
      userAt,
      assistantAt,
      usage: result.usage,
    };
    return NextResponse.json(responseBody);
  } catch (err) {
    console.error("POST /api/chat failed:", err);
    // The success path clears the lock as part of saveConversationTurn's own
    // write -- this only runs when that never happened, so the conversation
    // isn't left permanently "in progress" after a real failure.
    await clearTurnInProgress(userId, conversation.id).catch(() => {});
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
