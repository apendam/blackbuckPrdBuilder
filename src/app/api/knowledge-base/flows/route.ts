import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listReferenceDir, readReferenceFile } from "@/lib/knowledgeBase";

function extractFrontmatterField(content: string, field: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const line = match[1].split("\n").find((l) => l.trim().startsWith(`${field}:`));
  if (!line) return null;
  return line.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "");
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const files = listReferenceDir("system-map/flows").filter((f) => f.endsWith(".md"));
  const flows = files.map((file) => {
    const path = `system-map/flows/${file}`;
    const content = readReferenceFile(path);
    const lastVerified = extractFrontmatterField(content, "last_verified");
    const title = extractFrontmatterField(content, "title") ?? file.replace(/\.md$/, "");
    const status = extractFrontmatterField(content, "status");
    let staleDays: number | null = null;
    if (lastVerified) {
      const days = Math.floor((Date.now() - new Date(lastVerified).getTime()) / 86_400_000);
      if (!Number.isNaN(days)) staleDays = days;
    }
    return { path, file, title, status, lastVerified, staleDays };
  });

  return NextResponse.json({ flows });
}
