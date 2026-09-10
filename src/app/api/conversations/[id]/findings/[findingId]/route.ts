import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, saveVerificationFindings } from "@/lib/conversations";

// Status changes on a verification thread -- resolve/dismiss/reopen. These
// are pure PM decisions with no model investigation involved, so unlike
// comments/replies/new questions (which batch into the compiled feedback
// message and only reach the server on "Redo PRD"), these persist
// immediately: the PM expects the document/panel to reflect a triage
// decision right away, not after the next redraft cycle.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id, findingId } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const findingIndex = conversation.verificationFindings.findIndex((f) => f.id === findingId);
  if (findingIndex === -1) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  let body: { action?: "resolve" | "dismiss" | "reopen" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.action) {
    return NextResponse.json({ error: "action is required (resolve, dismiss, or reopen)" }, { status: 400 });
  }

  const status = body.action === "resolve" ? "resolved" : body.action === "dismiss" ? "dismissed" : "open";
  const findings = [...conversation.verificationFindings];
  findings[findingIndex] = { ...findings[findingIndex], status };
  await saveVerificationFindings(session.user.id, id, findings);
  return NextResponse.json({ finding: findings[findingIndex] });
}
