import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { KNOWN_REPOS } from "./repoList";
import { DESIGNER_SKILL_DIR, DESIGNER_SKILL_FILE, running, runClaude } from "./claudeRun";

const execFileAsync = promisify(execFile);

// Repos the PM added from the UI, on top of the built-in list in repoList.ts.
// Kept in data/ (gitignored): the built-in list is source-controlled, but a
// machine's extra clones are local state. NOTE: this module must not import
// knowledgeBase.ts -- that file imports getKnownRepos from here.
const WORKSPACE_ROOT = path.join(os.homedir(), "blackbuck-workspace");
const REGISTRY_FILE = path.join(process.cwd(), "data", "custom-repos.json");
const JOBS_DIR = path.join(process.cwd(), "data", "repo-jobs");
const PRD_SKILL_ROOT = path.join(WORKSPACE_ROOT, ".prd-builder-worktree/.claude/skills/prd-builder");
const SYSTEM_MAP_FILE = path.join(PRD_SKILL_ROOT, "references/system-map/README.md");
const ALLOWED_ORG = process.env.REPO_ALLOWED_ORG ?? "BLACKBUCK-LABS";
const MAX_PROGRESS = 12;

export interface CustomRepo {
  name: string;
  url: string;
  description?: string;
  addedAt: string;
}

export function getCustomRepos(): CustomRepo[] {
  try {
    const list = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
    return Array.isArray(list) ? list.filter((r) => r && typeof r.name === "string") : [];
  } catch {
    return [];
  }
}

export function getKnownRepos(): string[] {
  return [...KNOWN_REPOS, ...getCustomRepos().map((r) => r.name)];
}

function registerRepo(repo: CustomRepo): void {
  const list = getCustomRepos().filter((r) => r.name !== repo.name);
  fs.mkdirSync(path.dirname(REGISTRY_FILE), { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify([...list, repo], null, 2));
}

export type AddRepoStatus = "cloning" | "analyzing" | "done" | "error";

export interface AddRepoJob {
  name: string;
  url: string;
  status: AddRepoStatus;
  startedAt: string;
  updatedAt: string;
  progress: string[];
  written?: string[];
  error?: string;
}

function jobPath(name: string): string {
  return path.join(JOBS_DIR, `${name}.json`);
}

function writeJob(job: AddRepoJob): void {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(jobPath(job.name), JSON.stringify(job, null, 2));
}

export function readAddRepoJob(name: string): AddRepoJob | null {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  let job: AddRepoJob;
  try {
    job = JSON.parse(fs.readFileSync(jobPath(name), "utf-8"));
  } catch {
    return null;
  }
  if ((job.status === "cloning" || job.status === "analyzing") && !running.has(`repo:${name}`)) {
    job.status = "error";
    job.error = "The server restarted while this was running. Add the repo again to retry.";
    writeJob(job);
  }
  return job;
}

export function listAddRepoJobs(): AddRepoJob[] {
  try {
    return fs
      .readdirSync(JOBS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readAddRepoJob(f.slice(0, -5)))
      .filter((j): j is AddRepoJob => j !== null);
  } catch {
    return [];
  }
}

// Only repos in the allowed GitHub org, in the two standard URL shapes. The
// clone uses the machine's own git credentials, so this is the guard against
// pointing the tool at an arbitrary remote.
export function parseRepoUrl(raw: string): { name: string; url: string } | { error: string } {
  const url = raw.trim();
  const m =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url) ??
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!m) return { error: "Use a GitHub URL like https://github.com/BLACKBUCK-LABS/<repo>" };
  if (m[1].toLowerCase() !== ALLOWED_ORG.toLowerCase()) {
    return { error: `Only repos in the ${ALLOWED_ORG} GitHub org can be added.` };
  }
  const name = m[2];
  if (name.startsWith(".") || name.includes("..")) return { error: "Invalid repo name." };
  return { name, url: `https://github.com/${m[1]}/${name}.git` };
}

function pushProgress(job: AddRepoJob, line: string): void {
  if (job.progress[job.progress.length - 1] === line) return;
  job.progress = [...job.progress, line].slice(-MAX_PROGRESS);
}

const ANALYSIS_PROMPT = (name: string, repoDir: string, description: string) => `You are adding a new service to Blackbuck's PRD-builder and design tooling. The repo "${name}" has just been cloned at ${repoDir}${description ? `. The PM describes it as: "${description}"` : ""}.

Study the repo (README, build files, package layout, controllers/routes, enums and status values, config key NAMES, UI screens and copy if it is a frontend or mobile app, Kafka topics, calls to and from other services) and write a code-derived context file for it, in the same house style as the existing ones.

Before writing, look at the existing examples (read by heading, not whole files):
- ${DESIGNER_SKILL_DIR}/context/domain-tzf-ppi.md and web-and-ops-surfaces.md (context file style, confidence tags: unmarked = verified in code, *unverified* = inferred, *(doc-only)* = only in docs/comments)
- ${SYSTEM_MAP_FILE} (the "Repo index" table: how each repo's row is written)

Rules:
- Facts only, each with a file path (and line where useful). Never invent endpoints, states, fields, limits or fees; mark anything inferred *unverified*.
- NEVER include secrets, keys, tokens, passwords, certificates, connection strings, internal hostnames or the contents of any committed credentials file. Config keys by name only.
- If it is a UI (web or mobile) repo, document every screen, its states, and its real copy; the design tool relies on this.
- Say plainly what you could not determine.
- Keep the context file under about 40 KB.

Your final message must contain exactly these three tags and nothing outside them:
<context_md>
(the full Markdown context file, starting with "# ${name}")
</context_md>
<system_map_row>
(ONE line, a Markdown table row for the system-map Repo index: | \`${name}\` | Vertical(s) | What it is, grounded in the code | github.com/${process.env.REPO_ALLOWED_ORG ?? "BLACKBUCK-LABS"}/${name} |)
</system_map_row>
<load_when>
(ONE short line: when a design or PRD about a screen or flow should load this context file)
</load_when>`;

function tag(out: string, name: string): string | null {
  const m = new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`).exec(out);
  return m ? m[1] : null;
}

// Puts `row` in the first Markdown table (after `headerRe`) of `file`: replaces
// the line starting with `marker` if there is one, else appends to the table.
function insertTableRow(file: string, headerRe: RegExp, row: string, marker: string): boolean {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return false;
  }
  const lines = text.split("\n");
  const existing = lines.findIndex((l) => l.startsWith(marker));
  if (existing !== -1) {
    if (lines[existing] === row) return false;
    lines[existing] = row;
    fs.writeFileSync(file, lines.join("\n"));
    return true;
  }
  const h = lines.findIndex((l) => headerRe.test(l));
  if (h === -1) return false;
  let end = h + 1;
  while (end < lines.length && lines[end].trimStart().startsWith("|")) end++;
  lines.splice(end, 0, row);
  fs.writeFileSync(file, lines.join("\n"));
  return true;
}

async function analyzeAndRegister(job: AddRepoJob, repoDir: string, description: string): Promise<void> {
  const key = `repo:${job.name}`;
  const out = await runClaude(
    key,
    ANALYSIS_PROMPT(job.name, repoDir, description),
    (line) => {
      pushProgress(job, line);
      writeJob(job);
    },
    [repoDir, path.dirname(SYSTEM_MAP_FILE)]
  );

  const ctx = tag(out, "context_md");
  const row = tag(out, "system_map_row")?.split("\n")[0].trim();
  const loadWhen = (tag(out, "load_when") ?? "").split("\n")[0].trim() || `the PRD touches ${job.name}`;
  if (!ctx || ctx.length < 400) throw new Error("The analysis finished without a context file.");
  if (ctx.length > 200_000) throw new Error("The generated context file was unreasonably large.");
  if (!row || !row.startsWith("|") || !row.includes(`\`${job.name}\``)) {
    throw new Error("The analysis did not return a valid system-map row.");
  }

  const written: string[] = [];
  const ctxPath = path.join(DESIGNER_SKILL_DIR, "context", "repos", `${job.name}.md`);
  fs.mkdirSync(path.dirname(ctxPath), { recursive: true });
  fs.writeFileSync(ctxPath, ctx.endsWith("\n") ? ctx : `${ctx}\n`);
  written.push(`figma-designer/context/repos/${job.name}.md`);

  // Register the new context in the design skill: when to load it, and the
  // commit it was written from (the design runs use that table to tell which
  // code has changed since).
  const sha = (await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoDir })).stdout.trim();
  if (
    insertTableRow(
      DESIGNER_SKILL_FILE,
      /^\|\s*File\s*\|\s*Load when\s*\|/,
      `| \`repos/${job.name}.md\` | ${loadWhen.replace(/\|/g, "/")} |`,
      `| \`repos/${job.name}.md\` |`
    )
  )
    written.push("figma-designer/SKILL.md (context file table)");
  if (
    insertTableRow(
      DESIGNER_SKILL_FILE,
      /^\|\s*Repo\s*\|\s*Commit\s*\|\s*Used in\s*\|/,
      `| ${job.name} | ${sha} | \`repos/${job.name}.md\` |`,
      `| ${job.name} |`
    )
  )
    written.push("figma-designer/SKILL.md (commit table)");
  if (insertTableRow(SYSTEM_MAP_FILE, /^\|\s*Repo\s*\|\s*Vertical\(s\)\s*\|/, row, `| \`${job.name}\` |`)) {
    written.push("prd-builder system-map README (repo index)");
  }
  job.written = written;
}

export function startAddRepo(rawUrl: string, description: string): AddRepoJob {
  const parsed = parseRepoUrl(rawUrl);
  if ("error" in parsed) throw new Error(parsed.error);
  const { name, url } = parsed;
  const key = `repo:${name}`;
  if (running.has(key)) throw new Error(`${name} is already being added.`);
  if (getKnownRepos().includes(name)) throw new Error(`${name} is already in the repo list.`);
  const repoDir = path.join(WORKSPACE_ROOT, name);
  if (fs.existsSync(repoDir)) {
    throw new Error(`${repoDir} already exists on disk. Remove or rename it, then add the repo again.`);
  }

  const now = new Date().toISOString();
  const job: AddRepoJob = { name, url, status: "cloning", startedAt: now, updatedAt: now, progress: ["Cloning"] };
  writeJob(job);
  // Reserve the slot immediately; the analysis replaces it with the real child.
  running.set(key, { kill() {} } as ChildProcess);

  (async () => {
    try {
      await execFileAsync("git", ["clone", "--depth", "1", "--", url, repoDir], {
        timeout: 15 * 60 * 1000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (err) {
      fs.rmSync(repoDir, { recursive: true, force: true });
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Clone failed: ${msg.replace(/https:\/\/[^@\s]+@/g, "https://").slice(0, 500)}`);
    }
    // Registered as soon as the clone lands, so refresh and the code-reading
    // tools can use the repo even if the analysis below fails.
    registerRepo({ name, url, description: description || undefined, addedAt: new Date().toISOString() });
    job.status = "analyzing";
    pushProgress(job, "Cloned. Analysing the code");
    writeJob(job);
    running.delete(key);
    await analyzeAndRegister(job, repoDir, description);
    job.status = "done";
  })()
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      running.delete(key);
      writeJob(job);
    });
  return job;
}

// Re-runs only the analysis for a repo that is already cloned and registered
// (for example after the first analysis failed, or the repo changed a lot).
export function reanalyzeRepo(name: string): AddRepoJob {
  const repo = getCustomRepos().find((r) => r.name === name);
  if (!repo) throw new Error(`${name} was not added from the UI.`);
  const key = `repo:${name}`;
  if (running.has(key)) throw new Error(`${name} is already being analysed.`);
  const repoDir = path.join(WORKSPACE_ROOT, name);
  if (!fs.existsSync(repoDir)) throw new Error(`${repoDir} is missing on disk.`);
  const now = new Date().toISOString();
  const job: AddRepoJob = {
    name,
    url: repo.url,
    status: "analyzing",
    startedAt: now,
    updatedAt: now,
    progress: ["Analysing the code"],
  };
  writeJob(job);
  running.set(key, { kill() {} } as ChildProcess);
  (async () => {
    running.delete(key);
    await analyzeAndRegister(job, repoDir, repo.description ?? "");
    job.status = "done";
  })()
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      running.delete(key);
      writeJob(job);
    });
  return job;
}
