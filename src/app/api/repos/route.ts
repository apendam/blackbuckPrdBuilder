import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { KNOWN_REPOS } from "@/lib/repoList";
import { getCustomRepos, listAddRepoJobs, reanalyzeRepo, startAddRepo } from "@/lib/repoRegistry";

// GET: every repo the tool knows (built-in + added from the UI) and the state
// of any add/analysis runs. POST {url, description}: clone a new repo and
// generate its context files. POST {action: "reanalyze", name}: regenerate
// them for a repo that was added earlier.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const custom = getCustomRepos();
  return NextResponse.json({
    repos: [
      ...KNOWN_REPOS.map((name) => ({ name, custom: false })),
      ...custom.map((r) => ({ name: r.name, custom: true })),
    ],
    jobs: listAddRepoJobs(),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    description?: string;
    action?: string;
    name?: string;
  };
  try {
    if (body.action === "reanalyze") {
      return NextResponse.json({ job: reanalyzeRepo(String(body.name ?? "")) });
    }
    if (!body.url) return NextResponse.json({ error: "A repo URL is required" }, { status: 400 });
    return NextResponse.json({ job: startAddRepo(body.url, (body.description ?? "").trim().slice(0, 500)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
