import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, setConversationStatus, setConversationTitle, deleteConversation } from "@/lib/conversations";

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
  return NextResponse.json({ conversation });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as { status?: string; title?: string };
  if (body.status === undefined && body.title === undefined) {
    return NextResponse.json({ error: "Nothing to update -- pass status and/or title" }, { status: 400 });
  }
  if (body.status !== undefined && !["draft", "completed", "archived"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.title !== undefined && body.title.trim().length === 0) {
    return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
  }
  const existing = await getConversation(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (body.status !== undefined) {
    await setConversationStatus(session.user.id, id, body.status as "draft" | "completed" | "archived");
  }
  if (body.title !== undefined) {
    await setConversationTitle(session.user.id, id, body.title.trim());
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getConversation(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteConversation(session.user.id, id);
  return NextResponse.json({ ok: true });
}
