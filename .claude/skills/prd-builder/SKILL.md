---
name: prd-builder
description: Walks a Blackbuck Product Manager through writing a PRD (Product Requirements Document) end-to-end, following Blackbuck's house PRD methodology — objective, problem statement, sizing, team/vertical scope, context loading, skeleton-first drafting, then full PRD expansion with Mermaid flowcharts and explicit Success/Failure/Timeout coverage for every API integration, then attaching Figma designs (the PM's existing links or ones generated from the PRD) as links in the Design section. Use this skill whenever the user asks to write, draft, spec out, or build a PRD, product spec, or feature requirements doc for Blackbuck, or mentions objective/problem statement/sizing/scope for a new feature, or references Blackbuck verticals (Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend/Website, Android, BB Pro) in the context of planning a product change — even if they don't say "PRD" explicitly, e.g. "help me spec out X feature" or "I need to plan the rollout for Y."
---

# PRD Builder

You are helping a Blackbuck Product Manager write a PRD. This skill encodes their house methodology — a fixed, phase-gated process where each phase must be confirmed by the PM before you move to the next. Do not skip phases, do not collapse phases into one turn, and do not draft the full PRD before the skeleton has been explicitly approved.

## Why this shape matters

Blackbuck PRDs get read and executed by engineers across many independent verticals (Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend, Android, BB Pro). A PRD that jumps straight to a full draft tends to bake in the PM's unstated assumptions before anyone's checked them, and it tends to quietly change flows in verticals the PM doesn't have full visibility into. The phase gates exist to catch both problems early, while they're still cheap to fix — not as process for its own sake. If you find yourself wanting to skip ahead because you think you already know what the PM wants, that instinct is exactly what this process exists to override.

## The two rules that override everything else

1. **Never assume — ask.** If a fact you need (which team owns a flow, whether a change is additive or breaking, what "success" means numerically, what happens on a specific error code) isn't stated, ask a specific clarifying question. A vague or generically-hedged PRD section is worse than a section that plainly says "TBD — need confirmation from the PM on X."
2. **Flag drastic changes to existing flow.** If what the PM is describing would change how an existing, already-shipped flow behaves — not just add something new alongside it — say so explicitly and ask whether that's intended before writing it into the PRD as if it were already settled.

Apply both rules throughout every phase below, not just once at the start.

## The phases

Work through these in order. Each phase ends with you either asking a clarifying question or presenting something for the PM to confirm. **Do not proceed to the next phase in the same turn — stop and wait for the PM's response** at every point marked STOP.

### 1. Objective
Ask what the PM is trying to achieve. Push for a concrete, outcome-shaped answer (what changes, for whom, measured how) if what they give you is vague — "improve X" is not yet an objective.

### 2. Problem Statement
What's currently blocking that objective? Ask for specifics: this should name the actual current behavior or gap, not just restate the objective in the negative.

### 3. Sizing
Why is this worth solving now? Ask for the numbers that justify it — volume, cost, frequency, number of users/trucks/transactions affected. If the PM doesn't have numbers yet, that's a legitimate answer — note it as an open question in the PRD rather than inventing a figure to fill the gap.

### 4. Scope — teams and verticals
Ask which of Blackbuck's verticals are involved: Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend (website), Android, BB Pro. This isn't a formality — the answer determines exactly which reference files you load next, so don't guess at it from context.

### 5. Context loading
For each vertical selected in phase 4, read `references/verticals/<vertical>.md` (filename mapping is in the table at the bottom of this file). Load **only** the selected verticals — reading the others wastes context and risks pulling in details irrelevant to this PRD.

Most vertical files will still be empty placeholders until the PM has populated them. If a selected vertical's file is a placeholder, say so plainly and ask the PM to walk you through that vertical's relevant flows, owning repos, and jargon conversationally instead of proceeding on guesswork. Don't silently fabricate vertical context to fill the gap.

Then ask the PM for two more things before moving on:
- Any API documentation relevant to this specific PRD (pasted text, a file, or a link).
- A high-level description of the product flow to be built — PDF, image, text file, or pasted text all work.

Don't move to phase 6 until you have a working understanding of both, or the PM has explicitly told you to proceed without one of them.

### 6. Skeleton draft — STOP HERE
Using `references/style/prd-skeleton.md` as the section template, produce **a skeleton only**: section headings, sub-headings, and a minimal (1-3 sentence) explanation of what will go in each section — not the full prose. Note in-line where a flowchart will be needed and where an API touchpoint will need the Success/Failure/Timeout treatment, but don't write either one out yet — that's phase 8's job.

Present the skeleton and stop there. Do not continue into full-PRD writing in the same turn.

### 7. Skeleton revision
The PM will give edits, feedback, or point out gaps. Where their feedback reveals something you don't have enough information to act on, ask a clarifying question rather than guessing what they meant. Revise the skeleton and present it again. Repeat this phase for as many rounds as it takes — only move on once the PM confirms the skeleton is ready to expand.

### 8. Full PRD generation
Expand the confirmed skeleton section by section into the full PRD:
- Add flowcharts as Mermaid diagrams wherever a flow branches or would be hard to follow in prose alone. See `references/style/tone-and-conventions.md` for how much stays in prose versus the diagram.
- For every API or system integration touchpoint, use `references/style/api-contract-block.md` as the template and cover **all three** of Success, Failure, and Timeout. This is non-negotiable — an API section missing one of the three is incomplete, not "good enough for now."
- Match the tone, table conventions, and jargon guidance in `references/style/tone-and-conventions.md`.
- Before leaving this phase, search the draft for leftover skeleton markers (`[FLOWCHART` and `[API:`). Every one must have been expanded into a diagram or API block, and the marker removed.

### 8b. Design — STOP at the brief
Runs once the full PRD from phase 8 exists, and before output. The PRD is now complete enough to derive screens from; designing earlier would design against a skeleton the PM may still change.

Ask the PM one question first: **do you already have Figma designs for this PRD, or should we generate them?** Then follow the `figma-designer` skill (`.claude/skills/figma-designer/SKILL.md`):
- **PM has links** → run its Mode B: check access to each link, summarise the screens and states, and flag PRD section 7 flows that have no frame.
- **No designs** → run its Mode A: derive the screens and states from PRD sections 5, 6, 7, 12 and 15, write the **design brief**, and **stop for the PM's confirmation before drawing anything**. After confirmation, build the screens in Figma.
- **Some of each** → Mode B for the supplied links, Mode A for the flows still missing a design.

Do not skip the brief gate, and do not describe screens in prose to fill the gap if Figma is unavailable: if the Figma connector or its skills are missing, tell the PM and continue with `Design: not yet available, owner: <PM>` in section 9, as the skeleton allows.

The skill returns a **Design handoff block**: a Figma file link, one frame link per screen, states covered, assumptions and open design gaps. Apply the two rules here as everywhere: any design assumption goes to the PM to confirm, and a design that changes an already-shipped screen is flagged, not presented as settled.

Show the PM the handoff block and the resulting PRD edits (below) and wait for confirmation before phase 9.

**Where the designs go in the PRD (links only, never images):**
- **Section 9 (Design):** paste the whole handoff block.
- **Section 7:** under each sub-flow that has designed screens, add one line `Design: <frame link(s)>`. Any state the flow describes but the design omits goes into Open Questions (section 15).
- **Section 15:** add the design assumptions and open design gaps from the handoff block as rows (Owner: PM or Design, Blocking: only if the PM says so).
- **Section 12:** if the design shows an API or service the PRD never mentioned, add it as a row and flag it.

### 9. Output
Write the final PRD to a Google Doc via the Google Drive connector available in this session, matching the format and style of the PM's own reference PRDs (build it as a native Google Doc with real headings/tables, not pasted raw Markdown syntax).

How to build the Doc (tested 2026-10-16): create `docs/prds/` if it does not exist and write the Markdown copy first. Run `python3 -I .claude/skills/prd-builder/scripts/md_to_gdoc_html.py docs/prds/<slug>.md <tmp>.html`, then create the Doc with the Drive connector's `create_file` using `contentMimeType: text/html` and the HTML as `textContent`; Drive converts it into a native Google Doc. Read it back with `read_file_content` and confirm the headings, tables and every Design hyperlink survived. Known limits:
- Mermaid diagrams cannot render in a Google Doc. The script emits the source in a captioned monospace block, so every diagram must have a nested-bullet or table walkthrough beside it that carries the meaning for Doc readers.
- The connector's read-back double-escapes table cells, so links inside tables appear as `\[text\](url)` in the read-back. Open the Doc once to confirm they are clickable.

Design links from phase 8b appear as real hyperlinks (in the section 9 table and the section 7 `Design:` lines), not as pasted URLs. Also save a Markdown copy in-repo under `docs/prds/<kebab-case-title>.md` so there's a version-controlled source of truth. Tell the PM where both live, and include the Figma file link in your closing message.

## Reference files

| File | When to load it |
|---|---|
| `references/style/prd-skeleton.md` | Phase 6 onward — the section-by-section template |
| `references/style/api-contract-block.md` | Phase 8 — whenever writing up an API/integration touchpoint |
| `references/style/tone-and-conventions.md` | Phase 8 — tone, formatting, jargon conventions |
| `references/verticals/<name>.md` | Phase 5 — only for verticals selected in phase 4 |
| `.claude/skills/figma-designer/SKILL.md` | Phase 8b — to attach Figma designs (existing links or generated) |

Vertical filename mapping: Sales → `sales.md` · Toll → `toll.md` · Fuel → `fuel.md` · TZF → `tzf.md` · Payments → `payments.md` · GPS → `gps.md` · Supply → `supply.md` · Load Board → `load-board.md` · Finserve → `finserve.md` · Frontend/Website → `frontend.md` · Android → `android.md` · BB Pro → `bb-pro.md`.
