---
name: prd-builder
description: Walks a Blackbuck Product Manager through writing a PRD (Product Requirements Document) end-to-end, following Blackbuck's house PRD methodology — objective, problem statement, sizing, team/vertical scope, context loading, skeleton-first drafting, then full PRD expansion with Mermaid flowcharts and explicit Success/Failure/Timeout coverage for every API integration. Use this skill whenever the user asks to write, draft, spec out, or build a PRD, product spec, or feature requirements doc for Blackbuck, or mentions objective/problem statement/sizing/scope for a new feature, or references Blackbuck verticals (Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend/Website, Android, BB Pro) in the context of planning a product change — even if they don't say "PRD" explicitly, e.g. "help me spec out X feature" or "I need to plan the rollout for Y."
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
Work through this in order:

1. **Always read `references/system-map/README.md` first**, regardless of which verticals were selected in phase 4. It's two small tables (a repo index and a cross-repo flow index) and is cheap to load unconditionally — it's the only place cross-vertical dependencies are visible before you commit to a set of vertical files.
2. **Read `references/verticals/<vertical>.md` for each vertical selected in phase 4** (filename mapping is in the table at the bottom of this file), in the order the PM listed them. Load **only** the selected verticals — reading the others wastes context and risks pulling in details irrelevant to this PRD.
3. **Cross-reference for missed scope**: from the system map's flow index, find every flow row where its `verticals` intersect the phase-4 selection, or where a repo from a selected vertical's "Owning repos" table appears in that flow's repo list. Read those flow files (`references/system-map/flows/<id>.md`) in full — cap this at roughly 5 flows, ranked by how many selected verticals they touch; if more match, list the rest by name and let the PM ask for specific ones rather than silently loading everything.
4. **Surface scope gaps immediately**, before proceeding — e.g. "The flow you're touching also involves Android and TZF per the system map — should those be added to scope, or is this intentionally Toll-only?" This is the concrete mechanism for catching verticals nobody scoped in.
5. **Check staleness before treating anything as current**: a flow file with a `last_verified` date older than 90 days should be flagged to the PM as "likely stale, worth re-verifying" rather than cited as settled fact. The same goes for any vertical file that's still a placeholder — say so plainly and ask the PM to walk you through that vertical's relevant flows, owning repos, and jargon conversationally instead of proceeding on guesswork. Don't silently fabricate vertical or cross-repo context to fill a gap.

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

### 9. Output
Write the final PRD to a Google Doc via the Google Drive connector available in this session, matching the format and style of the PM's own reference PRDs (build it as a native Google Doc with real headings/tables, not pasted raw Markdown syntax). Also save a Markdown copy in-repo under `docs/prds/<kebab-case-title>.md` so there's a version-controlled source of truth. Tell the PM where both live.

Before finishing, ask one more thing: "Anything we learned while writing this PRD that should update a vertical file or the system map?" If yes, update the relevant `references/verticals/<name>.md` and/or `references/system-map/flows/<id>.md` (and its row in `references/system-map/README.md`) right then, including bumping `last_verified`. This is what keeps the knowledge base current through normal use instead of needing a separate documentation effort.

## Reference files

| File | When to load it |
|---|---|
| `references/style/prd-skeleton.md` | Phase 6 onward — the section-by-section template |
| `references/style/api-contract-block.md` | Phase 8 — whenever writing up an API/integration touchpoint |
| `references/style/tone-and-conventions.md` | Phase 8 — tone, formatting, jargon conventions |
| `references/verticals/<name>.md` | Phase 5 — only for verticals selected in phase 4 |
| `references/system-map/README.md` | Phase 5 — always, regardless of scope |
| `references/system-map/flows/<id>.md` | Phase 5 — only flows matching the selected scope, per the cross-reference step above |

Vertical filename mapping: Sales → `sales.md` · Toll → `toll.md` · Fuel → `fuel.md` · TZF → `tzf.md` · Payments → `payments.md` · GPS → `gps.md` · Supply → `supply.md` · Load Board → `load-board.md` · Finserve → `finserve.md` · Frontend/Website → `frontend.md` · Android → `android.md` · BB Pro → `bb-pro.md`.

## Cross-repo flows (`references/system-map/`)

A single vertical file can only tell one side of a story that crosses repo boundaries — e.g. a flow that starts in the Boss Android App and continues into the Toll backend and a TZF service. `references/system-map/` exists specifically for that cross-repo case:

- `references/system-map/README.md` — a repo index (which repo belongs to which vertical) and a cross-repo flow index (one row per flow that spans 2+ repos), always loaded in phase 5.
- `references/system-map/flows/<id>.md` — one file per cross-repo flow: YAML frontmatter (`id`, `title`, `status`, `verticals`, `repos`, `last_verified`, `verified_by`, `related_flows`) plus a Mermaid sequence diagram and a step-by-step narrative where each step names the repo, the code location (as a SHA-pinned GitHub permalink, never a branch link — those can point at whatever a branch happens to contain when clicked), and — for any step that crosses a repo boundary — one sentence on *why* it crosses (what business decision or ownership boundary causes the hop).

A flow entirely internal to one repo belongs in that vertical's own "Key flows" section, not here — this directory is reserved for the genuinely cross-repo case.

Code pointers everywhere (vertical files and flow files alike) use this exact format and are treated as a lead to re-verify, never as current truth to cite directly:

```
`<repo>` → `<path/to/file>` :: `<Symbol/Function/Endpoint>`
[permalink@<short-sha>](<full-SHA-pinned-URL>#L<line>) · verified <YYYY-MM-DD>
```

If you're about to write something into a PRD that depends on exact current behavior (a request/response shape, a validation rule, a specific error code), re-open the live repo and re-read the code — don't treat a pointer's cited line range as still accurate, especially past its 90-day staleness window.
