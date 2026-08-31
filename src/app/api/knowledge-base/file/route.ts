import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readReferenceFile } from "@/lib/knowledgeBase";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  const content = readReferenceFile(path);
  return NextResponse.json({ content });
}
