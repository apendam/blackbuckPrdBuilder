import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation } from "@/lib/conversations";
import { readPrdMarkdown } from "@/lib/knowledgeBase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!conversation.prdMarkdownPath) {
    return NextResponse.json({ error: "No PRD saved for this conversation yet" }, { status: 404 });
  }
  try {
    const content = readPrdMarkdown(conversation.prdMarkdownPath);
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "PRD file missing on disk" }, { status: 404 });
  }
}
