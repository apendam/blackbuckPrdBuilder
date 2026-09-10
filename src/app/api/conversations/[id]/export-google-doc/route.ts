import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, setGoogleDocUrl } from "@/lib/conversations";
import { createGoogleDoc } from "@/lib/googleDocs";
import { readPrdMarkdown } from "@/lib/knowledgeBase";

// Manual trigger for the same Google Doc creation runChatTurn's Phase 9
// create_google_doc tool call does -- lets the PM (re)export on demand,
// independent of a chat turn. Needed because create_google_doc previously
// only ran as a side effect of the drafting model choosing to call it, so a
// PM whose export failed (e.g. an expired Google token) had no way to retry
// it without re-triggering a full model turn.
export async function POST(
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
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!conversation.prdMarkdownPath) {
    return NextResponse.json({ error: "No saved PRD to export yet" }, { status: 400 });
  }

  let content: string;
  try {
    content = readPrdMarkdown(conversation.prdMarkdownPath);
  } catch {
    // Matches GET /api/conversations/:id/prd's own handling of the same
    // underlying condition.
    return NextResponse.json({ error: "PRD file missing on disk" }, { status: 404 });
  }

  try {
    const doc = await createGoogleDoc(session.user.id, conversation.title || "Untitled PRD", content);
    await setGoogleDocUrl(session.user.id, id, doc.url);
    return NextResponse.json({ url: doc.url, hadTables: doc.hadTables, hadMermaid: doc.hadMermaid });
  } catch (err) {
    console.error(`POST /api/conversations/${id}/export-google-doc failed:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
