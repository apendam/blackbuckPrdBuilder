import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { KNOWN_REPOS, RepoName } from "./repoList";
import { WORKSPACE_ROOT } from "./knowledgeBase";

const execFileAsync = promisify(execFile);

export interface RepoRefreshResult {
  repo: string;
  status: "up-to-date" | "updated" | "failed" | "skipped";
  detail: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 120_000 });
  return stdout.trim();
}

async function isShallow(repoDir: string): Promise<boolean> {
  try {
    return (await git(["rev-parse", "--is-shallow-repository"], repoDir)) === "true";
  } catch {
    return false;
  }
}

export async function refreshRepo(repo: string): Promise<RepoRefreshResult> {
  if (!(KNOWN_REPOS as readonly string[]).includes(repo)) {
    return { repo, status: "failed", detail: "unknown repo" };
  }
  const repoDir = path.join(WORKSPACE_ROOT, repo);
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    return { repo, status: "skipped", detail: "not cloned locally" };
  }

  try {
    const before = await git(["rev-parse", "HEAD"], repoDir);
    const shallow = await isShallow(repoDir);
    const branch = await git(["symbolic-ref", "--short", "-q", "HEAD"], repoDir);

    // These are read-only reference mirrors -- nothing is ever committed
    // here, so there's no local history worth merging. A plain `pull`
    // (fetch+merge) refuses outright the moment origin's branch has been
    // force-pushed, since the local tip is no longer an ancestor of the new
    // remote tip ("divergent branches, need to specify how to reconcile") --
    // several of these repos' release-ci/main branches get force-pushed
    // routinely. Fetch + hard-reset to the fetched tip is immune to that:
    // origin is always authoritative for a mirror like this.
    const dirty = (await git(["status", "--porcelain"], repoDir)) !== "";
    if (dirty) {
      await git(["stash", "push", "-u", "-m", "repoRefresh auto-stash before reset"], repoDir);
    }
    const fetchArgs = shallow
      ? ["-c", "http.version=HTTP/1.1", "fetch", "--depth=1", "origin", branch]
      : ["-c", "http.version=HTTP/1.1", "fetch", "origin", branch];
    await git(fetchArgs, repoDir);
    await git(["reset", "--hard", "FETCH_HEAD"], repoDir);

    const after = await git(["rev-parse", "HEAD"], repoDir);
    if (before === after) {
      return { repo, status: "up-to-date", detail: before.slice(0, 7) };
    }
    // A rewritten remote history means `before` may not be an ancestor of
    // `after` at all, so a `before..after` range log can be a near-total
    // history dump (or fail outright against a shallow boundary commit) --
    // just show the tip movement instead of attempting a real range diff.
    const log = shallow
      ? ""
      : await git(["log", "--oneline", `${before}..${after}`], repoDir).catch(() => "");
    return {
      repo,
      status: "updated",
      detail: log || `${before.slice(0, 7)} -> ${after.slice(0, 7)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { repo, status: "failed", detail: message.slice(0, 800) };
  }
}

export async function refreshRepos(repos: string[]): Promise<RepoRefreshResult[]> {
  const valid = repos.filter((r): r is RepoName => (KNOWN_REPOS as readonly string[]).includes(r));
  return Promise.all(valid.map(refreshRepo));
}
