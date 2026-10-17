import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

// Shared headless runner for the local Claude Code CLI, used by the design
// generator (figmaDesign.ts) and the add-a-repo analysis (repoRegistry.ts).
//
// The skill folder lives outside this repo on purpose: its context files are
// derived from internal Blackbuck code and this repo is public.
export const DESIGNER_REPO = process.env.FIGMA_DESIGNER_DIR ?? path.join(os.homedir(), "blackbuckprdbuilder");
export const DESIGNER_SKILL_DIR = path.join(DESIGNER_REPO, ".claude/skills/figma-designer");
export const DESIGNER_SKILL_FILE = path.join(DESIGNER_SKILL_DIR, "SKILL.md");

const CLAUDE_BIN =
  process.env.CLAUDE_BIN ??
  (fs.existsSync(path.join(os.homedir(), ".npm-global/bin/claude"))
    ? path.join(os.homedir(), ".npm-global/bin/claude")
    : "claude");

// Deliberately narrow: read-only file tools only. No Bash, no Write/Edit, no
// MCP -- the run is fed PRD text or third-party repo code and must not be able
// to touch the machine beyond reading. Whatever it produces comes back in the
// final message and is saved by this server. Anything not listed is denied in
// headless mode.
const ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Skill"];

// One entry per in-flight run, keyed by caller (conversation id, "repo:<name>").
export const running = new Map<string, ChildProcess>();

export function runClaude(
  key: string,
  prompt: string,
  onProgress: (line: string) => void,
  extraDirs: string[] = []
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      ...extraDirs.flatMap((d) => ["--add-dir", d]),
      "--allowedTools",
      ...ALLOWED_TOOLS,
    ];
    if (process.env.FIGMA_MODEL) args.push("--model", process.env.FIGMA_MODEL);
    const child = spawn(CLAUDE_BIN, args, { cwd: DESIGNER_REPO, stdio: ["pipe", "pipe", "pipe"] });
    running.set(key, child);

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
              if (c.type === "tool_use") {
                const name = String(c.name).replace(/^mcp__[^_]+(_[^_]+)*__/, "");
                // Show which file is being read, so it's visible what the
                // output is grounded in.
                const target = typeof c.input?.file_path === "string" ? ` ${path.basename(c.input.file_path)}` : "";
                onProgress(`${name}${target}`);
              }
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
      running.delete(key);
      reject(err);
    });
    child.on("close", (code) => {
      running.delete(key);
      if (result !== null && !isError) resolve(result);
      else reject(new Error(result || stderr.trim() || `claude exited with code ${code}`));
    });
    child.stdin.end(prompt);
  });
}
