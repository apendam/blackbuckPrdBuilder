import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getUserModelSettings,
  setUserModelSetting,
  AVAILABLE_MODELS,
  EFFORT_LEVELS,
  isKnownProvider,
} from "@/lib/modelSettings";
import { PHASES, Phase } from "@/lib/types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const settings = await getUserModelSettings(session.user.id);
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { phase?: string; provider?: string; model?: string; effort?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phase, provider, model, effort } = body;

  if (!phase || !(PHASES as readonly string[]).includes(phase)) {
    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  }
  if (!provider || !isKnownProvider(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (!model || !model.trim()) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }

  let resolvedEffort: (typeof EFFORT_LEVELS)[number] | undefined;
  if (provider === "anthropic") {
    const modelDef = AVAILABLE_MODELS.find((m) => m.id === model);
    if (!modelDef) {
      return NextResponse.json({ error: "Unknown Anthropic model" }, { status: 400 });
    }
    resolvedEffort = modelDef.supportsEffort
      ? effort && (EFFORT_LEVELS as string[]).includes(effort)
        ? (effort as (typeof EFFORT_LEVELS)[number])
        : "high"
      : undefined;
  }
  // OpenRouter model ids aren't validated against a fixed list -- the
  // catalog is dynamic and searched live in Settings; effort doesn't apply.

  await setUserModelSetting(session.user.id, phase as Phase, provider, model, resolvedEffort);

  return NextResponse.json({ ok: true });
}
