import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation } from "@/lib/conversations";
import { getDocComments } from "@/lib/googleDocs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!conversation.googleDocUrl) {
    return NextResponse.json({ comments: [] });
  }

  try {
    const comments = await getDocComments(session.user.id, conversation.googleDocUrl);
    return NextResponse.json({ comments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
