# Tone and Formatting Conventions

These conventions come from the PM's own reference PRDs and describe how Blackbuck PRDs are actually written day-to-day. Follow them so a generated PRD reads like this PM's work, not like a generic AI-generated document.

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
- **API-response-to-status pivot tables** — one row per (API, response type) pair, showing the resulting state transition.
- **Eligibility/comparison matrices** — e.g. bank × KYC-type, feature × user-segment.
- **Any list with an Owner or Blocking column** — Open Questions, Dependencies.

Don't reach for a table just because a list has two attributes per item — if a bullet list reads fine, use a bullet list.

## Design links, not embedded mockups

Every PRD section that involves UI should link out to Figma rather than describing the screen in prose or trying to embed an image. Label it plainly: `Design:` or `Design Link:` followed by the link. The PRD's job is to narrate logic and flow; Figma is the source of truth for what things look like.

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
