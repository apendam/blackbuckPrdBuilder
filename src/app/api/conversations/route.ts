import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createConversation, createFromTemplate, listConversations } from "@/lib/conversations";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");
  const statuses = statusParam ? statusParam.split(",") : ["draft", "completed"];
  const query = params.get("query") ?? undefined;
  const verticalsParam = params.get("verticals");
  const verticals = verticalsParam ? verticalsParam.split(",") : undefined;
  const sort = params.get("sort") === "created" ? "created" : "updated";

  const conversations = await listConversations(session.user.id, statuses, {
    query,
    verticals,
    sort,
  });
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let body: { templateId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine -- plain new conversation */
  }

  const conversation = body.templateId
    ? await createFromTemplate(session.user.id, body.templateId)
    : await createConversation(session.user.id);

  if (!conversation) {
    return NextResponse.json({ error: "Template conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}
