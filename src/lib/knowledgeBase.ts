import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { KNOWN_REPOS } from "./repoList";

// Points at the worktree with this session's Pass 1/2 population work.
// Once claude/prd-builder-pass1-pass2 is pushed and merged, this should
// track wherever the skill repo is checked out instead of a fixed worktree path.
const WORKSPACE_ROOT = path.join(os.homedir(), "blackbuck-workspace");
const REFERENCES_ROOT = path.join(
  WORKSPACE_ROOT,
  ".prd-builder-worktree/.claude/skills/prd-builder/references"
);
const SKILL_MD_PATH = path.join(
  WORKSPACE_ROOT,
  ".prd-builder-worktree/.claude/skills/prd-builder/SKILL.md"
);

export { KNOWN_REPOS };
export { WORKSPACE_ROOT };

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path escapes allowed root: ${relativePath}`);
  }
  return resolved;
}

export function readSkillMd(): string {
  return fs.readFileSync(SKILL_MD_PATH, "utf-8");
}

/** relativePath is rooted at references/, e.g. "system-map/README.md" or "verticals/toll.md" */
export function readReferenceFile(relativePath: string): string {
  const cleaned = relativePath.replace(/^references\//, "");
  const full = resolveWithinRoot(REFERENCES_ROOT, cleaned);
  if (!fs.existsSync(full)) {
    return `ERROR: reference file not found: ${relativePath}`;
  }
  if (fs.statSync(full).isDirectory()) {
    const entries = fs.readdirSync(full);
    return `ERROR: ${relativePath} is a directory. Contents: ${entries.join(", ")}`;
  }
  return fs.readFileSync(full, "utf-8");
}

export function listReferenceDir(relativePath: string): string[] {
  const cleaned = relativePath.replace(/^references\//, "");
  const full = resolveWithinRoot(REFERENCES_ROOT, cleaned);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    return [];
  }
  return fs.readdirSync(full);
}

export function readRepoFile(repo: string, relativePath: string): string {
  if (!KNOWN_REPOS.includes(repo as (typeof KNOWN_REPOS)[number])) {
    return `ERROR: unknown repo "${repo}". Known repos: ${KNOWN_REPOS.join(", ")}`;
  }
  const repoRoot = path.join(WORKSPACE_ROOT, repo);
  let full: string;
  try {
    full = resolveWithinRoot(repoRoot, relativePath);
  } catch {
    return `ERROR: path escapes repo root: ${relativePath}`;
  }
  if (!fs.existsSync(full)) {
    return `ERROR: file not found in ${repo}: ${relativePath}`;
  }
  if (fs.statSync(full).isDirectory()) {
    const entries = fs.readdirSync(full);
    return `ERROR: ${relativePath} is a directory in ${repo}. Contents: ${entries.join(", ")}`;
  }
  const stat = fs.statSync(full);
  if (stat.size > 200_000) {
    return `ERROR: file too large to read in full (${stat.size} bytes): ${repo}/${relativePath}. Use list_repo_files to narrow down, or ask the PM which part matters.`;
  }
  return fs.readFileSync(full, "utf-8");
}

export function listRepoFiles(repo: string, relativePath: string): string {
  if (!KNOWN_REPOS.includes(repo as (typeof KNOWN_REPOS)[number])) {
    return `ERROR: unknown repo "${repo}". Known repos: ${KNOWN_REPOS.join(", ")}`;
  }
  const repoRoot = path.join(WORKSPACE_ROOT, repo);
  let full: string;
  try {
    full = resolveWithinRoot(repoRoot, relativePath || ".");
  } catch {
    return `ERROR: path escapes repo root: ${relativePath}`;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    return `ERROR: not a directory in ${repo}: ${relativePath}`;
  }
  const entries = fs
    .readdirSync(full, { withFileTypes: true })
    .filter((e) => e.name !== ".git" && e.name !== "node_modules" && e.name !== "build")
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  return entries.join("\n");
}

const SEARCH_EXCLUDE_DIRS = [".git", "node_modules", "build", "dist", "target", ".gradle", ".idea"];
const SEARCH_MAX_LINES = 200;

// Exhaustive-by-construction alternative to "open a few files and guess":
// a real grep across the whole repo clone, every match returned in one call.
// The postmortem audit that motivated this tool found the repeated failure
// mode wasn't missing knowledge (the repos had the answer) -- it was the
// model stopping at the first file that answered the immediate question
// instead of checking every other call site of the same class/enum. A
// mechanical, exhaustive search removes that gap at the tool level instead
// of hoping a skill instruction gets re-read carefully enough, every time.
export function searchRepo(repo: string, pattern: string): string {
  if (!KNOWN_REPOS.includes(repo as (typeof KNOWN_REPOS)[number])) {
    return `ERROR: unknown repo "${repo}". Known repos: ${KNOWN_REPOS.join(", ")}`;
  }
  if (!pattern || pattern.trim().length < 2) {
    return "ERROR: pattern is too short to search with -- use at least 2 characters.";
  }
  const repoRoot = path.join(WORKSPACE_ROOT, repo);
  if (!fs.existsSync(repoRoot)) {
    return `ERROR: no local clone of ${repo} found at ${repoRoot}. Run a repo refresh first.`;
  }

  const args = [
    "-rn", // recursive, with line numbers
    "-I", // skip binary files
    "-E", // pattern is an extended regex
    ...SEARCH_EXCLUDE_DIRS.flatMap((d) => [`--exclude-dir=${d}`]),
    "--", // end of options -- without this, a pattern starting with "-"
    // (e.g. an LLM-supplied "-f/etc/hosts") gets parsed by grep as its own
    // flag instead of a literal search string, which for -f specifically
    // means grep reads an arbitrary local file as a pattern list rather
    // than searching for anything.
    pattern,
    ".",
  ];

  let raw: string;
  try {
    raw = execFileSync("grep", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      maxBuffer: 10_000_000,
      // This runs synchronously on the same Node process serving every
      // other request -- an expensive pattern (or one targeting a very
      // large repo) with no bound would stall the whole server, not just
      // this one call, for as long as grep takes to finish.
      timeout: 15_000,
    });
  } catch (err) {
    const e = err as { status?: number; message?: string; signal?: string };
    if (e.status === 1) {
      return `No matches for "${pattern}" in ${repo}.`;
    }
    if (e.signal === "SIGTERM") {
      return `ERROR: search for "${pattern}" in ${repo} took too long and was stopped -- narrow the pattern (a more specific name, not a broad/generic term) and try again.`;
    }
    return `ERROR running search in ${repo}: ${e.message ?? "unknown error"}`;
  }

  const lines = raw.split("\n").filter(Boolean);
  const shown = lines.slice(0, SEARCH_MAX_LINES).map((l) => l.replace(/^\.\//, `${repo}/`));
  const truncated = lines.length > SEARCH_MAX_LINES;
  return (
    `${lines.length} match(es) for "${pattern}" in ${repo}:\n` +
    shown.join("\n") +
    (truncated
      ? `\n... truncated at ${SEARCH_MAX_LINES} of ${lines.length} matches -- narrow the pattern (e.g. a more specific method/class name) to see the rest.`
      : "")
  );
}

// Symbols confirmed, by direct audit, to be exactly the kind of thing a
// drafting pass reliably under-checks: enums/classes with more call sites or
// more distinct meanings than a single grep-and-move-on pass tends to
// surface. This list is the entire maintenance surface for that problem --
// appending a symbol name here (not writing a paragraph into a vertical doc)
// is how a newly-confirmed landmine gets fed back in, and the search that
// answers it is always exhaustive by construction, not by how well the
// prose was written.
export const KNOWN_RISKY_SYMBOLS: Record<string, string[]> = {
  "toll-gold": [
    "RecoveryType",
    "BillType",
    "TollMandate",
    "MandatePresentation",
    "ActivationStatus",
    "ARP_GOLD_INACTIVE",
  ],
  "tzf-fastag": ["TagStatusEngine", "TagStatusPriority", "WalletThreshold"],
};

// Runs every configured search up front, mechanically, before the drafting
// or verification model writes a word -- so exhaustiveness doesn't depend on
// the model remembering to dig further. Deliberately not scoped to the
// conversation's own verticals: the config is small enough (two repos, nine
// symbols today) that running all of it every time is cheap, and scoping it
// correctly would require plumbing repo->vertical mapping that doesn't exist
// yet for no real savings at this size.
export function buildRiskySymbolDump(): string {
  const blocks: string[] = [];
  for (const [repo, symbols] of Object.entries(KNOWN_RISKY_SYMBOLS)) {
    for (const symbol of symbols) {
      blocks.push(`### Every usage of \`${symbol}\` in ${repo}\n${searchRepo(repo, symbol)}`);
    }
  }
  return blocks.join("\n\n");
}

// Keyed by conversation ID, not title -- two versions of "the same" PRD
// (see createRevision in conversations.ts) can share a title without one
// version's file clobbering another's.
export function savePrdMarkdown(conversationId: string, content: string): string {
  const prdsDir = path.join(WORKSPACE_ROOT, "prd-builder-chatbot", "data", "prds");
  fs.mkdirSync(prdsDir, { recursive: true });
  const filePath = path.join(prdsDir, `${conversationId}.md`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function readPrdMarkdown(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
