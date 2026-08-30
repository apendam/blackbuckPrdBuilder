import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runChatTurn } from "@/lib/claude";
import { getUserModelSettings } from "@/lib/modelSettings";
import { ChatTurnRequest, ChatTurnResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

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
    const modelSettings = await getUserModelSettings(session.user.id);
    const result = await runChatTurn(body.messages, body.phaseState, modelSettings);
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
