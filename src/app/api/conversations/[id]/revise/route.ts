import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createRevision } from "@/lib/conversations";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const revision = await createRevision(session.user.id, id);
  if (!revision) {
    return NextResponse.json({ error: "Original conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation: revision });
}
