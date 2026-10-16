# Tone and Formatting Conventions

These conventions come from the PM's own reference PRDs and describe how Blackbuck PRDs are actually written day-to-day. Follow them so a generated PRD reads like this PM's work, not like a generic AI-generated document.

## Length budget and exclusions (business logic only)

**Budget.** Aim for a PRD a PM can read in one sitting: roughly 3,000-5,000 words for a typical multi-flow feature, less for a single-flow one. Per sub-flow in section 7: a 2-4 sentence intent, the nested-bullet logic, and at most one table or diagram. If a draft runs past the budget, cut before presenting and offer the PM a link to what was cut instead of keeping it in.

**Cut rules.**
- One idea per bullet; no bullet restates another section.
- State a rule once, in the section that owns it, and refer to it by section number elsewhere.
- Give the decision and a one-clause reason. Skip history ("an earlier draft said...") unless it changes what the reader must do, and skip process narration ("verified", "searched and found none").
- Open questions: one line each, with owner and blocking flag.
- Instrumentation, dashboards and marketing: short bullets tied to a success metric, not exhaustive lists.

**Never in a PRD (keep in the knowledge base or code, not the document):**
- Endpoints, HTTP methods, request/response fields, JSON samples, status codes.
- Class, method, function, table, topic, queue, cron or config-key names; file paths and line numbers; repo names inside rules.
- Retry counts, backoff and timeouts copied from code. Where a number is a business decision, state it; where it is still undecided, use `X`/`Y`.
- Descriptions of how the code works today. State only the current business behaviour that the change depends on, in plain language.

If an engineer needs a technical pointer, the PM can ask for a separate engineering-notes appendix; do not add one unprompted.

## Voice

Write for engineers who need to implement this, not for an executive audience. First-person-plural ("we need to," "we will") is the house voice. Prefer direct, specific statements over hedged or padded ones — "we will retry 3 times" beats "the system may attempt to retry the request." Fragments and terse phrasing are fine in flow-narration bullets; save full sentences for sections that need to stand alone (Objective, Problem Statement, Sizing).

## Flow narration: nested bullets, not paragraphs

The dominant way Blackbuck PRDs express conditional logic is deeply nested bullet lists, using indentation as if/else branching, rather than prose paragraphs. For example:

```markdown
- Next shift time is within shift (n+1)
    - Yes:
        - Keep the same spot, update shift time
    - No:
        - Keep going with the same location until shift time
```

Use this pattern for any flow with more than one branch. Reserve Mermaid flowcharts (see below) for flows complex enough that nested bullets get hard to follow — the two aren't mutually exclusive; a flowchart plus a short nested-bullet walkthrough underneath it is a common and useful combination.

## Tables: for state and structure, not narrative

Use tables for:
- **Status-mapping matrices** — frontend status ↔ backend status ↔ description ↔ resulting CTA. This is effectively how this PM documents a state machine.
- **Outcome-to-status pivot tables** — one row per (dependency, outcome) pair, showing the resulting state transition, in business terms.
- **Eligibility/comparison matrices** — e.g. bank × KYC-type, feature × user-segment.
- **Any list with an Owner or Blocking column** — Open Questions, Dependencies.

Don't reach for a table just because a list has two attributes per item — if a bullet list reads fine, use a bullet list.

## Design links, not embedded mockups

Every PRD section that involves UI should link out to Figma rather than describing the screen in prose or trying to embed an image. Label it plainly: `Design:` or `Design Link:` followed by the link. The PRD's job is to narrate logic and flow; Figma is the source of truth for what things look like.

How designs appear in a generated PRD (produced by the `figma-designer` skill in phase 8b):
- **Section 9** holds the full handoff block: the Figma file link, a table with one row per screen (PRD flow, screen, app, frame link, states shown, status), the design assumptions, and the open design gaps. Frame links are real hyperlinks to the specific frame, not just the file.
- **Section 7** gets a single `Design: <frame link(s)>` line under each sub-flow that has designed screens. Do not restate the screen layout in prose underneath it.
- Frame states the flow describes but the design leaves out are listed in Open Questions, not silently skipped.
- The block follows the exclusion list above: screen names and plain-language states and assumptions only, with no route names, constants, field names or component names.
- No screenshots in the PRD, in the Google Doc or in the Markdown copy.

## Flowcharts: Mermaid, used deliberately

Add a Mermaid flowchart wherever a flow has enough branches that nested bullets would get hard to scan, or wherever a sequence spans multiple systems/actors (e.g. app → backend → external vendor → webhook back). Keep node labels short; put the detail in the nested-bullet walkthrough beneath the diagram rather than cramming it into node text.

## Notification-copy block

Whenever a flow triggers an SMS or push notification, document it with this consistent shape rather than just a sentence describing that a notification is sent:

```markdown
- Title: <exact copy>
- Subtext: <exact copy, if applicable>
- Landing Page: <where tapping it goes>
- CTA: <what the user is expected to do>
```

Use `{{VARIABLE_NAME}}` placeholders for dynamic content in copy (e.g. `{{VEHICLE_NUMBER}}`, `{{ACTIVATION_TIMESTAMP}}`).

## Support-ticket taxonomy block

If a flow creates a support ticket, document it with:

```markdown
- Type: <ticket type>
- SL1 / SL2 / SL3 / SL4: <support-level taxonomy>
- Ticket Description: <what gets written into the ticket>
```

## Placeholder conventions for unresolved numbers

When a numeric value (retry count, timeout duration, threshold) is genuinely still TBD with a vendor or backend team, write it as a literal placeholder (`X`, `Y`, `N` — e.g. "retry for X times within Y minutes") rather than inventing a plausible-sounding number or leaving the sentence vague. This signals clearly to the reader that a number belongs there and it's a known open item, not an oversight. Log it in the Open Questions section if it's actually blocking.

## Bold usage

Use bold sparingly and specifically: for the exact state a system ends up in (e.g. **Tag Hotlisted**), for priority markers (**P0**), or as an inline mini-header inside a bullet (**Edge Cases:**). Don't use bold for general emphasis — if everything is bold, nothing is.

## Jargon: pull from the vertical file, don't invent it

Each vertical has its own dense internal jargon (e.g. TZF's world includes TZF, CRO, TSL, FO, LFO, PPI, VPA, M2P, NETC, KYV). Don't assume terms from one vertical apply to another, and don't invent an abbreviation that sounds plausible — pull real terms from that vertical's `references/verticals/<name>.md` file, and if a term you need isn't defined there yet, ask the PM rather than guessing at what it stands for.

## "In progress" is a valid state

Blackbuck PRDs are living documents — it's normal and expected for a section to say "TBD," "pending confirmation from `<team>`," or contain an open question rather than a final answer. Don't fill an unresolved section with confident-sounding filler to make it look complete — an honest TBD is more useful to the reader than a plausible-sounding guess.
