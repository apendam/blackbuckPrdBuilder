import { NextRequest, NextResponse } from "next/server";
import { diffLines } from "diff";
import { auth } from "@/auth";
import { getConversation } from "@/lib/conversations";
import { readPrdMarkdown } from "@/lib/knowledgeBase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const against = req.nextUrl.searchParams.get("against");
  if (!against) {
    return NextResponse.json({ error: "Missing 'against' query param" }, { status: 400 });
  }

  const [a, b] = await Promise.all([
    getConversation(session.user.id, id),
    getConversation(session.user.id, against),
  ]);
  if (!a || !b) {
    return NextResponse.json({ error: "One or both versions not found" }, { status: 404 });
  }
  if (!a.prdMarkdownPath || !b.prdMarkdownPath) {
    return NextResponse.json({ error: "One or both versions have no saved PRD" }, { status: 404 });
  }

  try {
    const contentA = readPrdMarkdown(a.prdMarkdownPath);
    const contentB = readPrdMarkdown(b.prdMarkdownPath);
    const parts = diffLines(contentB, contentA); // "against" (b) is the baseline
    return NextResponse.json({
      parts: parts.map((p) => ({ added: !!p.added, removed: !!p.removed, value: p.value })),
      fromVersion: b.version,
      toVersion: a.version,
    });
  } catch {
    return NextResponse.json({ error: "Failed to read PRD files for diff" }, { status: 500 });
  }
}
