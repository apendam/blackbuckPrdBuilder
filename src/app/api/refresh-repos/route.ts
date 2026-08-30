import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { refreshRepos } from "@/lib/repoRefresh";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { repos?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requested = Array.isArray(body.repos) ? body.repos : [];
  if (requested.length === 0) {
    return NextResponse.json({ error: "No repos selected" }, { status: 400 });
  }

  const results = await refreshRepos(requested);
  return NextResponse.json({ results });
}
