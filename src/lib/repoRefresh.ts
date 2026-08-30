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

    const pullArgs = shallow
      ? ["-c", "http.version=HTTP/1.1", "pull", "--depth=1", "origin", branch]
      : ["-c", "http.version=HTTP/1.1", "pull", "--ff-only", "origin", branch];
    await git(pullArgs, repoDir);

    const after = await git(["rev-parse", "HEAD"], repoDir);
    if (before === after) {
      return { repo, status: "up-to-date", detail: before.slice(0, 7) };
    }
    const log = await git(["log", "--oneline", `${before}..${after}`], repoDir);
    return {
      repo,
      status: "updated",
      detail: log || `${before.slice(0, 7)} -> ${after.slice(0, 7)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { repo, status: "failed", detail: message.slice(0, 300) };
  }
}

export async function refreshRepos(repos: string[]): Promise<RepoRefreshResult[]> {
  const valid = repos.filter((r): r is RepoName => (KNOWN_REPOS as readonly string[]).includes(r));
  return Promise.all(valid.map(refreshRepo));
}
