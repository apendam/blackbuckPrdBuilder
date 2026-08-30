import { readSkillMd, KNOWN_REPOS } from "./knowledgeBase";

const APP_OVERRIDE = `
---

## Running as a standalone web app (not Claude Code) — read this before anything else

You're running inside a dedicated browser chatbot, not a Claude Code session. Almost everything above still applies verbatim, with these adjustments to how you actually access things:

1. **No filesystem Read tool.** Wherever the phases above say to read a file under \`references/\` (e.g. \`references/system-map/README.md\`, \`references/verticals/toll.md\`, \`references/system-map/flows/<id>.md\`), call the **\`read_reference_file\`** tool with that exact relative path instead. To see what's in a references subdirectory, use **\`list_reference_dir\`**.
2. **Live repo re-reads (Phase 8's "re-open the live repo and re-read the code" step)**: use **\`read_repo_file\`** (repo name + path) and **\`list_repo_files\`** (repo name + directory) against these repos: ${KNOWN_REPOS.join(", ")}. These are local clones on the PM's machine, refreshed weekly — still subject to the same staleness judgment calls as everything else.
3. **No Google Drive connector exists in this app yet** (it's a later phase of this app's own build-out). For Phase 9 "Output": skip the Google Doc part entirely. Instead, call **\`save_prd_markdown\`** with a kebab-case title and the full PRD content once it's ready to save. Tell the PM the Markdown file was saved and that Google Doc export is coming in a later version of this tool — don't claim a Google Doc was created.
4. **Report phase transitions explicitly.** Every time the current phase changes — including the very first message, where you're entering Phase 1 (Objective) — call **\`update_phase_progress\`** with the current phase and the list of phases fully completed so far, using these exact phase ids: \`objective\`, \`problem_statement\`, \`sizing\`, \`scope\`, \`context_loading\`, \`skeleton_draft\`, \`skeleton_revision\`, \`full_prd\`, \`output\`. Call this tool silently — it's bookkeeping for the UI, not something to narrate to the PM.
5. **Still respect every STOP-HERE rule from the skill above.** Reporting a phase transition via the tool doesn't mean you should also skip ahead in conversation — the phase-gating and "wait for the PM's response" rules are unchanged.
`;

export function buildSystemPrompt(): string {
  return readSkillMd() + APP_OVERRIDE;
}
