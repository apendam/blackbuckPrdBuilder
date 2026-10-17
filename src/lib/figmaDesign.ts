import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

// Figma generation for a finished PRD. The chatbot's own model has no Figma
// tools, and creating nodes needs the Figma Plugin API (reachable only through
// the Figma MCP server), so this shells out to the local Claude Code CLI --
// already signed in to Figma's MCP -- and has it run the `figma-designer`
// skill. Two gated stages, same as the skill itself: draft a design brief,
// wait for the PM to confirm, then build in Figma and return the links.
//
// The skill lives outside this repo on purpose: its context files are derived
// from internal Blackbuck code and this repo is public.
const DESIGNER_REPO = process.env.FIGMA_DESIGNER_DIR ?? path.join(os.homedir(), "blackbuckprdbuilder");
const SKILL_FILE = path.join(DESIGNER_REPO, ".claude/skills/figma-designer/SKILL.md");
const JOBS_DIR = path.join(process.cwd(), "data", "figma");
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? (fs.existsSync(path.join(os.homedir(), ".npm-global/bin/claude")) ? path.join(os.homedir(), ".npm-global/bin/claude") : "claude");
const MAX_PROGRESS = 12;

export type FigmaJobStatus = "briefing" | "brief_ready" | "building" | "done" | "error";

export interface FigmaJob {
  status: FigmaJobStatus;
  startedAt: string;
  updatedAt: string;
  brief?: string;
  corrections?: string;
  handoff?: string;
  appliedToPrd?: boolean;
  progress: string[];
  error?: string;
}

const running = new Map<string, ChildProcess>();

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

// Deliberately narrow: read-only file tools plus the Figma MCP. No Bash, no
// Write/Edit -- the run is fed PRD text and must not be able to touch the
// machine beyond reading the skill's context and drawing in Figma. Anything
// not listed is denied in headless mode.
const ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Skill", "mcp__figma", "mcp__plugin_figma_figma"];

function runClaude(id: string, prompt: string, onProgress: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--allowedTools",
      ...ALLOWED_TOOLS,
    ];
    if (process.env.FIGMA_MODEL) args.push("--model", process.env.FIGMA_MODEL);
    const child = spawn(CLAUDE_BIN, args, { cwd: DESIGNER_REPO, stdio: ["pipe", "pipe", "pipe"] });
    running.set(id, child);

    let buf = "";
    let result: string | null = null;
    let isError = false;
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "assistant") {
            for (const c of evt.message?.content ?? []) {
              if (c.type === "tool_use") onProgress(String(c.name).replace(/^mcp__[^_]+(_[^_]+)*__/, ""));
            }
          } else if (evt.type === "result") {
            result = typeof evt.result === "string" ? evt.result : "";
            isError = Boolean(evt.is_error);
          }
        } catch {
          // Not JSON -- ignore stray output.
        }
      }
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-2000);
    });
    child.on("error", (err) => {
      running.delete(id);
      reject(err);
    });
    child.on("close", (code) => {
      running.delete(id);
      if (result !== null && !isError) resolve(result);
      else reject(new Error(result || stderr.trim() || `claude exited with code ${code}`));
    });
    child.stdin.end(prompt);
  });
}

const BRIEF_PROMPT = (prd: string) => `Use the figma-designer skill (.claude/skills/figma-designer/SKILL.md), Mode A, Stage 0 and Stage 1 ONLY.

The PM has no Figma designs for this PRD and wants them generated. Read the PRD below, load only the context sections you need, and write the design brief using the template in section 8 of the skill. Do NOT open Figma or call any Figma tool in this step -- the PM must confirm the brief first.

Your final message must be the design brief in Markdown and nothing else (no preamble, no closing question).

<prd>
${prd}
</prd>`;

const BUILD_PROMPT = (prd: string, brief: string, corrections: string, title: string, fileKey?: string) => `Use the figma-designer skill (.claude/skills/figma-designer/SKILL.md), Mode A, Stages 2, 3 and 4.

The PM has CONFIRMED the design brief below${corrections ? ", with the corrections listed after it (they override the brief)" : ""}. Do not ask questions; where something is unknown, mark it ASSUMPTION and list it in the handoff block.

Figma setup: ${
  fileKey
    ? `reuse the existing file with fileKey ${fileKey} (inspect it first, reuse its components and variables, add new frames below the existing ones).`
    : `create a new file named "${title}: designs" in a plan where the account has a Full seat (use whoami). If no plan allows writing, stop and say so as the final message.`
}
Follow the skill exactly: load figma-use before every use_figma call, token variables first, then components, then screens, every state in the brief, editable layers only (no screenshots of the UI), one frame link per screen.

Your final message must be ONLY the "Design handoff block" from section 7 of the skill (Markdown, links only, no images, no preamble).

<design_brief>
${brief}
</design_brief>
${corrections ? `\n<pm_corrections>\n${corrections}\n</pm_corrections>\n` : ""}
<prd>
${prd}
</prd>`;

function pushProgress(job: FigmaJob, line: string): void {
  if (job.progress[job.progress.length - 1] === line) return;
  job.progress = [...job.progress, line].slice(-MAX_PROGRESS);
}

function start(id: string, job: FigmaJob, prompt: string, onDone: (job: FigmaJob, out: string) => void): FigmaJob {
  writeJob(id, job);
  let lastWrite = 0;
  runClaude(id, prompt, (line) => {
    pushProgress(job, line);
    const now = Date.now();
    if (now - lastWrite > 1500) {
      lastWrite = now;
      writeJob(id, job);
    }
  })
    .then((out) => onDone(job, out.trim()))
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => writeJob(id, job));
  return job;
}

export function startBrief(id: string, prd: string): FigmaJob {
  if (running.has(id)) throw new Error("A Figma run is already in progress for this PRD.");
  const now = new Date().toISOString();
  const job: FigmaJob = { status: "briefing", startedAt: now, updatedAt: now, progress: [] };
  return start(id, job, BRIEF_PROMPT(prd), (j, out) => {
    j.brief = out;
    j.status = "brief_ready";
  });
}

export function startBuild(id: string, prd: string, title: string, corrections: string): FigmaJob {
  if (running.has(id)) throw new Error("A Figma run is already in progress for this PRD.");
  const prev = readFigmaJob(id);
  if (!prev?.brief) throw new Error("Draft the design brief first.");
  const now = new Date().toISOString();
  const job: FigmaJob = {
    status: "building",
    startedAt: now,
    updatedAt: now,
    brief: prev.brief,
    corrections: corrections.trim() || undefined,
    progress: [],
  };
  return start(id, job, BUILD_PROMPT(prd, prev.brief, corrections.trim(), title, process.env.FIGMA_DESIGNS_FILE_KEY), (j, out) => {
    if (!/figma\.com\/design\//.test(out)) {
      j.status = "error";
      j.error = `Figma generation finished without any frame links. Last message: ${out.slice(0, 600)}`;
      return;
    }
    j.handoff = out;
    j.status = "done";
  });
}

export function resetFigmaJob(id: string): void {
  running.get(id)?.kill();
  running.delete(id);
  try {
    fs.unlinkSync(jobPath(id));
  } catch {
    // Nothing to reset.
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
