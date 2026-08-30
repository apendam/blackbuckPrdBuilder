import { NextRequest, NextResponse } from "next/server";
import { runChatTurn } from "@/lib/claude";
import { ChatTurnRequest, ChatTurnResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: ChatTurnRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }

  try {
    const result = await runChatTurn(body.messages, body.phaseState);
    const responseBody: ChatTurnResponse = {
      reply: result.reply,
      phaseState: result.phaseState,
      savedPrd: result.savedPrd,
    };
    return NextResponse.json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
