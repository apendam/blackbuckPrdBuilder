import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation } from "@/lib/conversations";
import { readPrdMarkdown } from "@/lib/knowledgeBase";
import {
  figmaDesignerAvailable,
  insertHandoffIntoPrd,
  readMockup,
  markAppliedToPrd,
  readFigmaJob,
  resetFigmaJob,
  startBrief,
  startBuild,
  startRefine,
} from "@/lib/figmaDesign";

async function load(params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  }
  const { id } = await params;
  const conversation = await getConversation(session.user.id, id);
  if (!conversation) {
    return { error: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) } as const;
  }
  if (!conversation.prdMarkdownPath) {
    return { error: NextResponse.json({ error: "This PRD has no saved draft yet" }, { status: 400 }) } as const;
  }
  return { id, conversation, prdPath: conversation.prdMarkdownPath } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  if (req.nextUrl.searchParams.get("mockup") !== null) {
    const html = readMockup(ctx.id);
    if (!html) return NextResponse.json({ error: "No mockup yet" }, { status: 404 });
    // Model-written HTML: served with a CSP that allows inline script/style
    // but no network, no framing others, and no form posts, so it can draw
    // and animate but can't call out or reach the app's own origin data.
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'; sandbox allow-scripts",
        "X-Content-Type-Options": "nosniff",
        ...(req.nextUrl.searchParams.get("download") !== null
          ? { "Content-Disposition": 'attachment; filename="design-mockup.html"' }
          : {}),
      },
    });
  }
  const avail = figmaDesignerAvailable();
  return NextResponse.json({
    job: readFigmaJob(ctx.id),
    available: avail.ok,
    unavailableReason: avail.ok ? null : avail.reason,
  });
}

// action: "brief" (draft the design brief), "build" (PM confirmed -- draw it in
// the mockup), "apply" (write the links into the PRD's Design section), "reset".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await load(params);
  if ("error" in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { action?: string; corrections?: string; request?: string };

  try {
    if (body.action === "reset") {
      resetFigmaJob(ctx.id);
      return NextResponse.json({ job: null });
    }

    if (body.action === "apply") {
      const job = readFigmaJob(ctx.id);
      if (!job?.handoff) return NextResponse.json({ error: "No designs to add yet" }, { status: 400 });
      const prd = readPrdMarkdown(ctx.prdPath);
      fs.writeFileSync(ctx.prdPath, insertHandoffIntoPrd(prd, job.handoff));
      markAppliedToPrd(ctx.id);
      return NextResponse.json({ job: readFigmaJob(ctx.id) });
    }

    const avail = figmaDesignerAvailable();
    if (!avail.ok) return NextResponse.json({ error: avail.reason }, { status: 503 });
    const prd = readPrdMarkdown(ctx.prdPath);

    if (body.action === "brief") {
      return NextResponse.json({ job: startBrief(ctx.id, prd) });
    }
    if (body.action === "refine") {
      return NextResponse.json({ job: startRefine(ctx.id, prd, body.request ?? "") });
    }
    if (body.action === "build") {
      return NextResponse.json({ job: startBuild(ctx.id, prd, body.corrections ?? "") });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
