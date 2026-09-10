import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, saveVerificationFindings } from "@/lib/conversations";
import { getUserModelSettings } from "@/lib/modelSettings";
import { runVerificationPass, buildIncompleteVerificationFinding, anchorFindings } from "@/lib/claude";
import { readPrdMarkdown } from "@/lib/knowledgeBase";

// Manual trigger for the same independent fact-check runChatTurn runs
// automatically after a full-PRD draft -- lets the PM re-run it on demand
// (e.g. after asking Claude to address the flagged findings, or if the
// automatic pass's "looks like a complete draft" heuristic missed a turn).
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

  // Prefer the saved Markdown (the actual finished artifact) once it exists;
  // otherwise fall back to the most recent assistant message, which is
  // where an unapproved Phase 8 draft lives.
  let prdText: string;
  if (conversation.prdMarkdownPath) {
    try {
      prdText = readPrdMarkdown(conversation.prdMarkdownPath);
    } catch {
      // Matches GET /api/conversations/:id/prd's own handling of the same
      // underlying condition (prdMarkdownPath pointing at a file that no
      // longer exists) -- an ordinary 404, not a server error.
      return NextResponse.json({ error: "PRD file missing on disk" }, { status: 404 });
    }
  } else {
    const lastAssistant = [...conversation.messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) {
      return NextResponse.json({ error: "No PRD draft found to verify yet" }, { status: 400 });
    }
    prdText = lastAssistant.content;
  }

  try {
    const modelSettings = await getUserModelSettings(session.user.id);
    const result = await runVerificationPass(prdText, modelSettings);
    // Same rule as the automatic pass in claude.ts: an incomplete run must
    // never be saved/shown as "0 findings" -- that reads as a clean bill of
    // health when it actually means the check didn't finish.
    const freshJudgeFindings = result.completed
      ? anchorFindings(prdText, result.findings)
      : buildIncompleteVerificationFinding();
    // A fresh sweep re-derives judge findings from scratch, but PM-initiated
    // question threads are a separate, ongoing conversation with the judge
    // that this sweep didn't re-evaluate -- carry them forward untouched,
    // same rule runChatTurn's auto-verify applies on every redraft.
    const preservedPmFindings = conversation.verificationFindings.filter((f) => f.author === "pm");
    const findings = [...freshJudgeFindings, ...preservedPmFindings];
    await saveVerificationFindings(session.user.id, id, findings);
    return NextResponse.json({ findings });
  } catch (err) {
    console.error(`POST /api/conversations/${id}/verify failed:`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
