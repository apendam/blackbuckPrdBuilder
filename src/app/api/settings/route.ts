import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getUserModelSettings,
  setUserModelSetting,
  AVAILABLE_MODELS,
  EFFORT_LEVELS,
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

  let body: { phase?: string; model?: string; effort?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phase = body.phase;
  const model = body.model;
  const effort = body.effort;

  if (!phase || !(PHASES as readonly string[]).includes(phase)) {
    return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
  }
  const modelDef = AVAILABLE_MODELS.find((m) => m.id === model);
  if (!modelDef) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  const resolvedEffort = modelDef.supportsEffort
    ? effort && (EFFORT_LEVELS as string[]).includes(effort)
      ? effort
      : "high"
    : "high"; // stored but ignored for models that don't support effort

  await setUserModelSetting(
    session.user.id,
    phase as Phase,
    modelDef.id,
    resolvedEffort as (typeof EFFORT_LEVELS)[number]
  );

  return NextResponse.json({ ok: true });
}
