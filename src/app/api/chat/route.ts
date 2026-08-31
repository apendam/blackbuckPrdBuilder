import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runChatTurn } from "@/lib/claude";
import { getUserModelSettings } from "@/lib/modelSettings";
import { getConversation, saveConversationTurn } from "@/lib/conversations";
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

  const nextMessages: ChatMessage[] = [
    ...conversation.messages,
    { role: "user", content: body.message },
  ];

  try {
    const modelSettings = await getUserModelSettings(userId);
    const result = await runChatTurn(
      nextMessages,
      { current: conversation.currentPhase, completed: conversation.completedPhases },
      modelSettings,
      userId,
      conversation.id
    );

    const finalMessages: ChatMessage[] = [
      ...nextMessages,
      { role: "assistant", content: result.reply },
    ];

    await saveConversationTurn(userId, conversation.id, finalMessages, result.phaseState, {
      title: result.title,
      verticals: result.verticals,
      savedPrd: result.savedPrd,
      googleDocUrl: result.googleDocUrl,
    });

    const responseBody: ChatTurnResponse = {
      reply: result.reply,
      phaseState: result.phaseState,
      title: result.title,
      savedPrd: result.savedPrd,
      googleDocUrl: result.googleDocUrl,
    };
    return NextResponse.json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
