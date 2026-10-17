import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { WORKSPACE_ROOT } from "./knowledgeBase";
import { refreshRepos, type RepoRefreshResult } from "./repoRefresh";
import { getCustomRepos, getKnownRepos } from "./repoRegistry";
import { DESIGNER_SKILL_DIR, DESIGNER_SKILL_FILE, running, runClaude } from "./claudeRun";

const execFileAsync = promisify(execFile);

// Screen designs for a finished PRD, as a self-contained HTML mockup. (Figma
// generation was the first version; the connected Figma account has no write
// access, so the build stage now produces HTML instead.) The chatbot's own
// model has no file or skill tools, so this shells out to the local Claude Code
// CLI and has it run the `figma-designer` skill's research stages. Two gated
// stages, same as the skill itself: draft a design brief, wait for the PM to
// confirm, then build the mockup.
//
// The skill lives outside this repo on purpose: its context files are derived
// from internal Blackbuck code and this repo is public.
const SKILL_FILE = DESIGNER_SKILL_FILE;
const JOBS_DIR = path.join(process.cwd(), "data", "figma");
const MOCKUPS_DIR = path.join(process.cwd(), "data", "mockups");
const MAX_PROGRESS = 12;

export type FigmaJobStatus = "briefing" | "brief_ready" | "building" | "done" | "error";

export interface FigmaJob {
  status: FigmaJobStatus;
  startedAt: string;
  updatedAt: string;
  brief?: string;
  corrections?: string;
  handoff?: string;
  hasMockup?: boolean;
  // Result of the automatic repo refresh that precedes every run, so the PM
  // can see whether the code the design is checked against is current.
  repos?: { at: string; results: RepoRefreshResult[] };
  appliedToPrd?: boolean;
  progress: string[];
  error?: string;
}


function jobPath(id: string): string {
  return path.join(JOBS_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
}

function writeJob(id: string, job: FigmaJob): void {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(jobPath(id), JSON.stringify(job, null, 2));
}

export function readFigmaJob(id: string): FigmaJob | null {
  let job: FigmaJob;
  try {
    job = JSON.parse(fs.readFileSync(jobPath(id), "utf-8"));
  } catch {
    return null;
  }
  // A job left "running" by a previous server process has no child behind it.
  if ((job.status === "briefing" || job.status === "building") && !running.has(id)) {
    job.status = "error";
    job.error = "The server restarted while this was running. Start it again.";
    writeJob(id, job);
  }
  return job;
}

export function figmaDesignerAvailable(): { ok: true } | { ok: false; reason: string } {
  if (!fs.existsSync(SKILL_FILE)) {
    return {
      ok: false,
      reason: `figma-designer skill not found at ${SKILL_FILE}. Check out the branch that has it, or set FIGMA_DESIGNER_DIR.`,
    };
  }
  return { ok: true };
}

// Repo folder names as the skill's commit table spells them -> local clone.
const REPO_DIR_BY_TABLE_NAME: Record<string, string> = {
  "bb-supply-fo-android": "bb-supply-fo-android",
  "blackbuck-pro-app": "blackbuck-pro-app",
  fms_toll: "fms_toll",
  "toll-gold": "toll-gold",
  "tzf-fastag": "tzf-fastag",
  "ppi-wallet": "ppi-wallet",
  "TZF-portal": "TZF-portal",
  "tzf-activation-web-sdk": "tzf-activation-web-sdk",
  "tzf-full-kyc-sdk-web": "tzf-full-kyc-sdk-web",
  "tzf-ops-portal": "tzf-ops-portal",
  boss_help_desk: "boss_help_desk",
};
const REPO_REFRESH_TTL_MS = 15 * 60 * 1000;

async function gitOut(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim();
}

// The skill's context files were generated from specific commits (table in
// SKILL.md section 9). Refreshing the repos makes the code current, but the
// context files stay as written -- so tell the run exactly which areas of the
// code have moved since, and have it check those against the code itself.
async function codeDriftNote(): Promise<string> {
  let skill = "";
  try {
    skill = fs.readFileSync(SKILL_FILE, "utf-8");
  } catch {
    return "";
  }
  const lines: string[] = [];
  for (const m of skill.matchAll(/^\|\s*([\w.-]+)[^|]*\|\s*([0-9a-f]{7,40})\s*\|/gm)) {
    const dir = REPO_DIR_BY_TABLE_NAME[m[1]] ?? (getCustomRepos().some((r) => r.name === m[1]) ? m[1] : undefined);
    if (!dir) continue;
    const cwd = path.join(WORKSPACE_ROOT, dir);
    if (!fs.existsSync(path.join(cwd, ".git"))) continue;
    try {
      const head = await gitOut(["rev-parse", "--short", "HEAD"], cwd);
      if (head.startsWith(m[2].slice(0, 7)) || m[2].startsWith(head)) {
        lines.push(`- ${dir}: unchanged since the context was written (${head}).`);
        continue;
      }
      const changed = await gitOut(["diff", "--name-only", `${m[2]}..HEAD`], cwd).catch(() => null);
      if (changed === null) {
        lines.push(`- ${dir}: now at ${head}, context written at ${m[2]}; the history between them is not available locally, so check this repo's code directly.`);
      } else {
        const files = changed.split("\n").filter(Boolean);
        lines.push(
          `- ${dir}: now at ${head}, context written at ${m[2]}; ${files.length} files changed${
            files.length ? ", including:\n    " + files.slice(0, 40).join("\n    ") : ""
          }`
        );
      }
    } catch {
      lines.push(`- ${dir}: could not be compared.`);
    }
  }
  return lines.join("\n");
}

function repoDirs(): string[] {
  return getKnownRepos()
    .map((r) => path.join(WORKSPACE_ROOT, r))
    .filter((d) => fs.existsSync(d));
}

// Services added from the UI have their own context file under context/repos/.
function customRepoNote(): string {
  const names = getCustomRepos().map((r) => r.name);
  if (names.length === 0) return "";
  return ` Services added later have their own context files, in ${DESIGNER_SKILL_DIR}/context/repos/: ${names
    .map((n) => `${n}.md`)
    .join(", ")}. Load the one for any service the PRD touches; the repo is at ~/blackbuck-workspace/<name>.`;
}

const FRESHNESS = (drift: string) => `
<code_freshness>
The local repos under ~/blackbuck-workspace were just refreshed to their latest upstream commits. The skill's context files describe the code as of the commits in SKILL.md section 9; the code has moved as follows:
${drift || "(comparison unavailable)"}

Treat the context files as an index, not as the truth. For every screen you design or mock, check the current code in the repo before relying on the context (Boss = bb-supply-fo-android, BB Pro = blackbuck-pro-app, toll = fms_toll, gold = toll-gold, customer portal = TZF-portal, help desk = boss_help_desk; the other repos keep their names; they are at ~/blackbuck-workspace/<repo>). Where the code and the context disagree, the code wins. Say so under a "Drift from context" heading. Never copy secrets, keys or internal hostnames from the code into any output.${customRepoNote()}
</code_freshness>
`;

const BRIEF_PROMPT = (prd: string, drift: string) => `Use the figma-designer skill (.claude/skills/figma-designer/SKILL.md), Mode A, Stage 0 and Stage 1 ONLY.

The PM has no Figma designs for this PRD and wants them generated. Read the PRD below, load only the context sections you need, and write the design brief using the template in section 8 of the skill. Do NOT open Figma or call any Figma tool in this step -- the PM must confirm the brief first.

Your final message must be the design brief in Markdown and nothing else (no preamble, no closing question). Include a short "Drift from context" section only if you found code that differs from the context files.
${FRESHNESS(drift)}
<prd>
${prd}
</prd>`;

const BUILD_PROMPT = (prd: string, brief: string, corrections: string, drift: string) => `Use the figma-designer skill (.claude/skills/figma-designer/SKILL.md): its context files, hard rules and design brief. Figma is NOT available, so instead of Stages 2-3 build an HTML mockup of the screens in the brief.

The PM has CONFIRMED the design brief below${corrections ? ", with the corrections listed after it (they override the brief)" : ""}. Do not ask questions; where something is unknown, mark it ASSUMPTION in the mockup and list it in the handoff block.

Ground every screen in the skill's code-derived context -- do not design from general knowledge:
- Read context/products.md, context/design-system.md and the context file for each app in the brief (boss-app.md and/or bb-pro-app.md), plus the domain file for the PRD's area (domain-toll-gold.md or domain-tzf-ppi.md, web-and-ops-surfaces.md for web surfaces). Read by heading, not whole files.
- Then check the screens you mock against the live code (see code_freshness below).
- Take colours, type, spacing, radii, button and component styles from design-system.md (note Boss and BB Pro differ: e.g. Boss primary action is navy #0D2C40, BB Pro forms use blue #1554F6), and screen names, layout, states and copy from the app file.

Mockup requirements:
- ONE self-contained HTML document: inline <style> and <script> only. No external fonts, scripts, images or network requests (it runs in a sandbox with no network). Use inline SVG for icons.
- Phone-sized frames for the app(s) in the brief, in flow order, each labelled with its screen name and the app (Boss or BB Pro). A small tab or stepper to move between flows, and a toggle or tabs for each state of a screen (default, loading, empty, error, success, plus the domain states in the brief).
- Use the real labels, copy, colours, spacing and component patterns from the skill's context (design-system.md and the app file), including the right Boss vs BB Pro look. Do not invent states, fields, limits or fees.
- Mark server-driven pieces and assumptions visibly (small badges).
- If the brief says nothing visual changes in the apps, mock the changed screens/states it does list and say so on the first screen.

Your final message must be EXACTLY two parts and nothing else:
1. The HTML document in a single \`\`\`html fenced block.
2. After the fence, the "Design handoff block" from section 7 of the skill, adapted: Markdown, screen names and plain-language states only, no frame links (the mockup is attached in the PRD viewer, say so in one line), assumptions and open design gaps as short bullets. End with a "Grounded in:" line naming the context files you actually read and the existing screens (from the app file) each mocked screen is based on.

${FRESHNESS(drift)}
<design_brief>
${brief}
</design_brief>
${corrections ? `\n<pm_corrections>\n${corrections}\n</pm_corrections>\n` : ""}
<prd>
${prd}
</prd>`;

const REFINE_PROMPT = (prd: string, brief: string, html: string, handoff: string, request: string, drift: string) => `Use the figma-designer skill (.claude/skills/figma-designer/SKILL.md): its context files and hard rules. Figma is NOT available; the designs are an HTML mockup.

An HTML mockup for this PRD already exists (below). The PM wants it changed:

<pm_request>
${request}
</pm_request>

Do exactly that. KEEP every existing screen, state, flow tab and assumption that the request doesn't touch, word for word where you can; add or change only what is asked, in the same visual language and file structure (one self-contained HTML document, inline <style> and <script> only, no external resources or network, inline SVG icons, labelled frames, state toggles, NEW/CHANGED/ASSUMPTION/SERVER-DRIVEN/DRIFT badges).
For any new screen, ground it in the skill's code-derived context (read the relevant context files by heading, e.g. web-and-ops-surfaces.md for ops and support portals, plus the app/domain file) and check the live code (see code_freshness). Web and ops surfaces use their own look, not the Boss or BB Pro mobile look: take it from the context and the portal's code. Do not invent fields, statuses, reason codes or limits; use only what the PRD and code give, and mark anything else ASSUMPTION.
${FRESHNESS(drift)}
Your final message must be EXACTLY two parts and nothing else:
1. The COMPLETE updated HTML document in a single \`\`\`html fenced block.
2. After the fence, the updated "Design handoff block" (Markdown, screen names and plain-language states only, no frame links, assumptions and gaps as short bullets), covering all screens including the new ones, ending with a "Grounded in:" line naming the context files you read.

<current_handoff>
${handoff}
</current_handoff>

<current_mockup>
\`\`\`html
${html}
\`\`\`
</current_mockup>

<design_brief>
${brief}
</design_brief>

<prd>
${prd}
</prd>`;

function pushProgress(job: FigmaJob, line: string): void {
  if (job.progress[job.progress.length - 1] === line) return;
  job.progress = [...job.progress, line].slice(-MAX_PROGRESS);
}

function start(
  id: string,
  job: FigmaJob,
  buildPrompt: (drift: string) => string,
  onDone: (job: FigmaJob, out: string) => void,
  forceRefresh: boolean
): FigmaJob {
  writeJob(id, job);
  let lastWrite = 0;
  const progress = (line: string) => {
    pushProgress(job, line);
    const now = Date.now();
    if (now - lastWrite > 1500) {
      lastWrite = now;
      writeJob(id, job);
    }
  };
  // Reserve the slot immediately so a second click can't start a parallel run
  // while the refresh below is still going.
  running.set(id, { kill() {} } as ChildProcess);
  (async () => {
    // Pull the latest code first, by default. A failed repo doesn't stop the
    // run (the PM sees it flagged and the run falls back to the local copy).
    const fresh = job.repos && Date.now() - new Date(job.repos.at).getTime() < REPO_REFRESH_TTL_MS;
    if (forceRefresh || !fresh) {
      progress("Refreshing repos");
      job.repos = { at: new Date().toISOString(), results: await refreshRepos(getKnownRepos()) };
      writeJob(id, job);
    }
    progress("Comparing code with the design context");
    const drift = await codeDriftNote();
    running.delete(id);
    return runClaude(id, buildPrompt(drift), progress, repoDirs());
  })()
    .then((out) => onDone(job, out.trim()))
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      running.delete(id);
      writeJob(id, job);
    });
  return job;
}

export function startBrief(id: string, prd: string): FigmaJob {
  if (running.has(id)) throw new Error("A Figma run is already in progress for this PRD.");
  const now = new Date().toISOString();
  const job: FigmaJob = { status: "briefing", startedAt: now, updatedAt: now, progress: [] };
  return start(
    id,
    job,
    (drift) => BRIEF_PROMPT(prd, drift),
    (j, out) => {
      j.brief = out;
      j.status = "brief_ready";
    },
    true
  );
}

export function startBuild(id: string, prd: string, corrections: string): FigmaJob {
  if (running.has(id)) throw new Error("A design run is already in progress for this PRD.");
  const prev = readFigmaJob(id);
  if (!prev?.brief) throw new Error("Draft the design brief first.");
  const now = new Date().toISOString();
  const job: FigmaJob = {
    status: "building",
    startedAt: now,
    updatedAt: now,
    brief: prev.brief,
    corrections: corrections.trim() || undefined,
    repos: prev.repos,
    progress: [],
  };
  return start(id, job, (drift) => BUILD_PROMPT(prd, prev.brief!, corrections.trim(), drift), (j, out) => {
    const fence = /```html\s*\n([\s\S]*?)\n```/i.exec(out);
    const html = fence?.[1].trim();
    if (!html || !/<html[\s>]|<!doctype/i.test(html)) {
      j.status = "error";
      j.error = `The run finished without an HTML mockup. Last message: ${out.slice(0, 600)}`;
      return;
    }
    fs.mkdirSync(MOCKUPS_DIR, { recursive: true });
    fs.writeFileSync(mockupPath(id), html);
    j.hasMockup = true;
    j.handoff = out.slice(fence!.index + fence![0].length).trim();
    j.status = "done";
  }, false);
}

// Changes an existing mockup: more screens, different states, fixes.
export function startRefine(id: string, prd: string, request: string): FigmaJob {
  if (running.has(id)) throw new Error("A design run is already in progress for this PRD.");
  const prev = readFigmaJob(id);
  const html = readMockup(id);
  if (!prev?.brief || !html) throw new Error("Build the mockup first.");
  if (!request.trim()) throw new Error("Say what to add or change.");
  const now = new Date().toISOString();
  const job: FigmaJob = {
    status: "building",
    startedAt: now,
    updatedAt: now,
    brief: prev.brief,
    handoff: prev.handoff,
    hasMockup: true,
    repos: prev.repos,
    progress: [],
  };
  return start(
    id,
    job,
    (drift) => REFINE_PROMPT(prd, prev.brief!, html, prev.handoff ?? "", request.trim(), drift),
    (j, out) => {
      const fence = /```html\s*\n([\s\S]*?)\n```/i.exec(out);
      const next = fence?.[1].trim();
      if (!next || !/<html[\s>]|<!doctype/i.test(next)) {
        // Keep the previous mockup; surface what the run said instead.
        j.status = "error";
        j.error = `The run finished without an updated mockup (the previous one is unchanged). Last message: ${out.slice(0, 600)}`;
        return;
      }
      // Never overwrite a good mockup with a much smaller one -- that is a
      // truncated or dropped-screens result, not a refinement.
      if (next.length < html.length * 0.6) {
        j.status = "error";
        j.error = "The updated mockup came back much smaller than the original, so it looks like screens were dropped. The previous mockup is unchanged. Try again.";
        return;
      }
      fs.writeFileSync(mockupPath(id), next);
      const rest = out.slice(fence!.index + fence![0].length).trim();
      if (rest) j.handoff = rest;
      j.appliedToPrd = false;
      j.status = "done";
    },
    false
  );
}

function mockupPath(id: string): string {
  return path.join(MOCKUPS_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, "")}.html`);
}

export function readMockup(id: string): string | null {
  try {
    return fs.readFileSync(mockupPath(id), "utf-8");
  } catch {
    return null;
  }
}

export function resetFigmaJob(id: string): void {
  running.get(id)?.kill();
  running.delete(id);
  for (const f of [jobPath(id), mockupPath(id)]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // Nothing to reset.
    }
  }
}

export function markAppliedToPrd(id: string): void {
  const job = readFigmaJob(id);
  if (!job) return;
  job.appliedToPrd = true;
  writeJob(id, job);
}

// Puts the handoff block into the PRD's Design section (replacing what's
// there), or appends a Design section if the PRD has none.
export function insertHandoffIntoPrd(prd: string, handoff: string): string {
  const lines = prd.split("\n");
  const headingRe = /^(#{1,3})\s+(?:\d+\.?\s+)?Design\b/i;
  const start = lines.findIndex((l) => headingRe.test(l));
  const block = handoff.trim();
  if (start === -1) {
    return `${prd.replace(/\s+$/, "")}\n\n## Design\n\n${block}\n`;
  }
  const level = headingRe.exec(lines[start])![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start + 1), "", block, "", ...lines.slice(end)].join("\n");
}
