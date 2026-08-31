import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversation, updateNotes } from "@/lib/conversations";

export async function PATCH(
  req: NextRequest,
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
  const body = (await req.json()) as { notes?: string };
  await updateNotes(session.user.id, id, body.notes ?? "");
  return NextResponse.json({ ok: true });
}
