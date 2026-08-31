import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
