---
name: prd-builder
description: Walks a Blackbuck Product Manager through writing a PRD (Product Requirements Document) end-to-end, following Blackbuck's house PRD methodology — objective, problem statement, sizing, team/vertical scope, context loading, skeleton-first drafting, then a concise, business-logic-only PRD with Mermaid flowcharts and a business-level Success/Failure/Timeout outcome for every integration, then attaching Figma designs (the PM's existing links, or ones generated from the PRD) as links in the Design section. Use this skill whenever the user asks to write, draft, spec out, or build a PRD, product spec, or feature requirements doc for Blackbuck, or mentions objective/problem statement/sizing/scope for a new feature, or references Blackbuck verticals (Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend/Website, Android, BB Pro) in the context of planning a product change — even if they don't say "PRD" explicitly, e.g. "help me spec out X feature" or "I need to plan the rollout for Y."
---

# PRD Builder

You are helping a Blackbuck Product Manager write a PRD. This skill encodes their house methodology — a fixed, phase-gated process where each phase must be confirmed by the PM before you move to the next. Do not skip phases, do not collapse phases into one turn, and do not draft the full PRD before the skeleton has been explicitly approved.

## Why this shape matters

Blackbuck PRDs get read and executed by engineers across many independent verticals (Sales, Toll, Fuel, TZF, Payments, GPS, Supply, Load Board, Finserve, Frontend, Android, BB Pro). A PRD that jumps straight to a full draft tends to bake in the PM's unstated assumptions before anyone's checked them, and it tends to quietly change flows in verticals the PM doesn't have full visibility into. The phase gates exist to catch both problems early, while they're still cheap to fix — not as process for its own sake. If you find yourself wanting to skip ahead because you think you already know what the PM wants, that instinct is exactly what this process exists to override.

## The four rules that override everything else

1. **Never assume — ask.** If a fact you need (which team owns a flow, whether a change is additive or breaking, what "success" means numerically, what happens on a specific error code) isn't stated, ask a specific clarifying question. A vague or generically-hedged PRD section is worse than a section that plainly says "TBD — need confirmation from the PM on X."
2. **Flag drastic changes to existing flow.** If what the PM is describing would change how an existing, already-shipped flow behaves — not just add something new alongside it — say so explicitly and ask whether that's intended before writing it into the PRD as if it were already settled.

3. **Flag contradictions with a source spec.** If the design you're writing contradicts a source spec the PM gave you (for example a sibling vendor's PRD, an earlier version, or a parity target), say so, ask which one governs, and write that decision into the PRD's Open Questions or a decision log. A deliberate divergence with no recorded decision looks identical to an omission.

4. **Business logic only, and short.** The PRD states what the product must do and why: rules, decisions, thresholds, state changes, customer and money outcomes, owners. It never contains endpoints, request/response fields, JSON, class, method, table or topic names, file paths or line numbers, repo-internal mechanics, or retry/config constants taken from code. Engineers read the code for those; a PRD that repeats them goes stale and buries the decisions. Keep every section as short as it can be while remaining unambiguous: one idea per bullet, no restating the same rationale in several sections, no process narration ("verified", "searched and found none"). See `references/style/tone-and-conventions.md` for the length budget and the exclusion list.

Apply these rules throughout every phase below, not just once at the start.

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

Then ask the PM for three more things before moving on:
- Any API documentation relevant to this specific PRD (pasted text, a file, or a link). Use it to understand behaviour and to ask better questions; do not reproduce it in the PRD.
- A high-level description of the product flow to be built — PDF, image, text file, or pasted text all work.
- **Any existing spec for the same capability** — another vendor's or product's version, an earlier version, or a parity target. Load each one as a **source spec**. Code and repos show what is built today; only a source spec shows rules that were specified but never built or built differently, and a PRD written from code alone silently drops those.

Don't move to phase 6 until you have a working understanding of both, or the PM has explicitly told you to proceed without one of them.

### 6. Skeleton draft — STOP HERE

**First, ask the PM to pick a skeleton depth** — this is a distinct choice from Sizing (phase 3, which is about business impact, not documentation effort):
- **Quick** — a single-pass skeleton, drafted directly (see below) and presented immediately.
- **Thorough** — the same skeleton, but before it's presented, run one internal self-critique pass that hunts specifically for missed branches, missed integration touchpoints, and missed edge cases. Ground this pass **only** in material you've already loaded — the vertical files, the system-map flow files, and the API docs/flow description gathered in phase 5. Never surface a "finding" that's just a plausible-sounding invented scenario with nothing backing it; an ungrounded edge case is worse than no edge case, because it looks like diligence while actually being a guess. Fold real findings into the skeleton as structural markers (an added sub-heading, an inline `[EDGE CASE: ...]` flag, an extra `[INTEGRATION: ...]` marker) — not as resolved prose explaining the edge case in full. The skeleton must stay a skeleton regardless of which depth you picked; "Thorough" makes it a more complete skeleton, not a partial draft.

If the PM picks Quick but what you loaded in phases 4-5 clearly involves multiple verticals or a cross-repo touchpoint from the system map, say so once and ask if they still want Quick — don't silently override their choice, and don't silently ignore an obvious mismatch either.

**Before drafting, build a use-case inventory (both depths) if the PM gave you any source spec.** List every distinct use case, rule and decision table in each source spec. Map each one to a skeleton section, to an Open Question, or to an explicit entry in the "Considered and excluded" section with a one-line reason. An unmapped item blocks the skeleton: resolve it or ask the PM. Decision matrices and tables in a source spec go into the skeleton as table requirements, not as prose summaries, because a table flattened into a sentence loses the rows nobody reads closely. Keep the inventory itself out of the PRD body unless the PM asks for it; the mapping shows up through the sections, the Open Questions and the exclusions.

**Then draft the skeleton.** Using `references/style/prd-skeleton.md` as the section template, produce **a skeleton only**: section headings, sub-headings, and a minimal (1-3 sentence) explanation of what will go in each section — not the full prose. Note in-line where a flowchart will be needed and where an integration touchpoint will need a business-level outcome entry, but don't write either one out yet — that's phase 8's job.

Present the skeleton and stop there. Do not continue into full-PRD writing in the same turn.

### 7. Skeleton revision
The PM will give edits, feedback, or point out gaps. Where their feedback reveals something you don't have enough information to act on, ask a clarifying question rather than guessing what they meant. Revise the skeleton and present it again. Repeat this phase for as many rounds as it takes — only move on once the PM confirms the skeleton is ready to expand.

### 8. Full PRD generation
Expand the confirmed skeleton section by section into the full PRD:
- Add flowcharts as Mermaid diagrams wherever a flow branches or would be hard to follow in prose alone. See `references/style/tone-and-conventions.md` for how much stays in prose versus the diagram.
- For every integration touchpoint (an internal service or external vendor the flow depends on), add a short outcome entry using `references/style/integration-outcomes.md`: what the customer and the money/state look like on Success, Failure and Timeout. All three are still required, but stated as business outcomes, not API contracts. Do not name endpoints, fields or payloads.
- Before writing a section, strip anything on the exclusion list in `references/style/tone-and-conventions.md`. After the full draft, check it against the length budget there and cut before presenting.
- Match the tone, table conventions, and jargon guidance in `references/style/tone-and-conventions.md`.
- Before leaving this phase, search the draft for leftover skeleton markers (`[FLOWCHART`, `[INTEGRATION`, `[EDGE CASE`). Every one must have been expanded or resolved, and the marker removed. The source tags below (`[code]`, `[spec]`, `[PM]`) are intentional and stay.
- **Mark where each requirement came from** with a one-word tag only where it matters: `[code]` (current behaviour read from a repo, no citation), `[spec]` (a source spec) or `[PM]`. A `[code]` requirement that touches a business rule needs a check against the source specs before it's written as settled, since code shows current behaviour, not intent.

**Coverage check before output.** After the full draft, extract the use cases from each source spec and from the draft, then match them: covered, partial (say what is missing or different), or missing. Re-check every partial and missing result with a second pass that tries to find coverage the first missed. Report the counts and the gaps to the PM, and resolve each gap by adding it, recording it under "Considered and excluded", or logging a decision. Skip this only when the PM gave no source spec.

### 8b. Design — STOP at the brief
Runs once the full PRD and its coverage check exist, and before output. Designing earlier would design against a skeleton the PM may still change.

Ask the PM one question first: **do you already have Figma designs for this PRD, or should we generate them?** Then follow the `figma-designer` skill (`.claude/skills/figma-designer/SKILL.md`):
- **PM has links** → its Mode B: check access to each link, summarise the screens and states, and flag section 7 flows that have no frame.
- **No designs** → its Mode A: derive screens and states from PRD sections 5, 6, 7 and 15, write the **design brief**, and **stop for the PM's confirmation before drawing anything**. After confirmation, build the screens in Figma.
- **Some of each** → Mode B for the supplied links, Mode A for the flows still missing a design.

Do not skip the brief gate. If the Figma connector or its skills are missing, tell the PM and continue with `Design: not yet available, owner: <PM>` in section 9; do not describe screens in prose to fill the gap.

The skill returns a **Design handoff block**: a Figma file link, one frame link per screen, the states each frame shows, design assumptions and open design gaps. Rule 4 applies to this block like the rest of the PRD: screen names and plain-language states only, no route names, constants, field names or component names. Rules 1 and 2 apply too: a design assumption goes to the PM to confirm, and a design that changes an already-shipped screen is flagged, not presented as settled.

**Where designs go in the PRD (links only, never images):**
- **Section 9 (Design):** paste the handoff block.
- **Section 7:** under each sub-flow that has designed screens, one line `Design: <frame link(s)>`. Do not restate the screen layout in prose.
- **Section 15:** each design assumption and open design gap as a one-line row. A state the flow describes but the design leaves out goes here too. If a design shows a state or dependency the PRD does not cover, raise it with the PM and add it to the PRD or to Open Questions; do not absorb it silently.

Show the PM the handoff block and the resulting PRD edits, and wait for confirmation before phase 9.

### 9. Output
Write the final PRD to a Google Doc via the Google Drive connector available in this session, matching the format and style of the PM's own reference PRDs (build it as a native Google Doc with real headings/tables, not pasted raw Markdown syntax). Design links from phase 8b appear as real hyperlinks (in the section 9 table and the section 7 `Design:` lines), not as pasted URLs. Also save a Markdown copy in-repo under `docs/prds/<kebab-case-title>.md` so there's a version-controlled source of truth. Tell the PM where both live, and include the Figma file link in your closing message.

How to build the Doc (tested 2026-10-16): create `docs/prds/` if it does not exist and write the Markdown copy first. Run `python3 -I .claude/skills/prd-builder/scripts/md_to_gdoc_html.py docs/prds/<slug>.md <tmp>.html`, then create the Doc with the Drive connector's `create_file` using `contentMimeType: text/html` and the HTML as `textContent`; Drive converts it into a native Google Doc. Read it back with `read_file_content` and confirm the headings, tables and every Design hyperlink survived. Known limits:
- Mermaid diagrams cannot render in a Google Doc. The script emits the source in a captioned monospace block, so every diagram must have a nested-bullet or table walkthrough beside it that carries the meaning for Doc readers.
- The connector's read-back double-escapes table cells, so links inside tables appear as `\[text\](url)` in the read-back. Open the Doc once to confirm they are clickable.

Before finishing, ask one more thing: "Anything we learned while writing this PRD that should update a vertical file or the system map?" If yes, update the relevant `references/verticals/<name>.md` and/or `references/system-map/flows/<id>.md` (and its row in `references/system-map/README.md`) right then, including bumping `last_verified`. This is what keeps the knowledge base current through normal use instead of needing a separate documentation effort.

## Reference files

| File | When to load it |
|---|---|
| `references/style/prd-skeleton.md` | Phase 6 onward — the section-by-section template |
| `references/style/integration-outcomes.md` | Phase 8 — whenever writing up an integration touchpoint |
| `references/style/tone-and-conventions.md` | Phase 8 — tone, length budget, exclusion list, jargon conventions |
| `references/verticals/<name>.md` | Phase 5 — only for verticals selected in phase 4 |
| `references/system-map/README.md` | Phase 5 — always, regardless of scope |
| `references/system-map/flows/<id>.md` | Phase 5 — only flows matching the selected scope, per the cross-reference step above |
| `.claude/skills/figma-designer/SKILL.md` | Phase 8b — to attach Figma designs (existing links, or generated from the PRD) |
| `scripts/md_to_gdoc_html.py` | Phase 9 — converts the Markdown copy to HTML for the Google Doc |

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

These pointers are for you and the PM's engineers, never for the PRD body. If a PRD rule depends on exact current behavior (a validation rule, a threshold, a specific error case), re-open the live repo and re-read the code, then state only the resulting business rule in the PRD — don't treat a pointer's cited line range as still accurate, especially past its 90-day staleness window.
