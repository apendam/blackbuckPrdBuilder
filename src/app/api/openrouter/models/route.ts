import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchOpenRouterModels } from "@/lib/openRouterCatalog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const models = await searchOpenRouterModels(q);
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
