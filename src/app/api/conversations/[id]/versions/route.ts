import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVersionChain } from "@/lib/conversations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const versions = await getVersionChain(session.user.id, id);
  return NextResponse.json({ versions });
}
