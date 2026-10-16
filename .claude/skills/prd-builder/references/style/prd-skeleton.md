# PRD Skeleton Template

This is the section-by-section shape every Blackbuck PRD built by the skill should follow. It merges Blackbuck's blank PRD template with the fullest, most formally-structured PRD found in the PM's own reference material (the "LFO Portal" spec), reorganized to match the PM's stated build order: objective → problem → sizing → scope → everything else.

## How to use this at each stage

- **Skeleton stage (phase 6):** write the heading, plus 1-3 sentences describing what will go there. Note `[FLOWCHART NEEDED]` inline wherever a flow has branches. Note `[INTEGRATION: <name>]` inline wherever a dependency will need the business-level outcome entry from `integration-outcomes.md`. Do not write the full content yet.
- **Full PRD stage (phase 8):** replace each skeleton entry with the real content, expand `[FLOWCHART NEEDED]` markers into actual Mermaid diagrams, and expand `[INTEGRATION: <name>]` markers into short outcome entries (no endpoints, fields or payloads).

A section that genuinely doesn't apply to a given PRD (e.g. no Marketing & PR plan needed for a backend-only change) should still appear with a one-line "Not applicable — <why>" rather than being silently dropped. A missing section reads as an oversight; an explicitly-scoped-out section reads as a decision.

## Sections, in order

### 1. Title & Metadata
Title, Status (Draft / In Review / Approved), Author, Date, and the verticals/teams in scope (from phase 4). No repo names. This is the only section that's pure bookkeeping — keep it to a few lines.

### 2. Objective
What we're trying to achieve, stated as a concrete outcome — not an activity. One short paragraph.

### 3. Problem Statement
What's currently blocking that objective. Name the actual current behavior or gap, not a restatement of the objective in the negative.

### 4. Sizing
Why this is worth solving now — the numbers (volume, cost, frequency, users/trucks/transactions affected) that justify prioritizing it. If real numbers aren't available yet, say so explicitly as an open item rather than omitting the section.

### 5. Scope
- **Goals** — what this PRD covers.
- **Non-Goals / Out of Scope** — what it explicitly does not cover, and why (a two-column Out of Scope / Rationale table works well here).
- **Teams involved** — the verticals selected in phase 4, and what each team must change in business terms (one line each). No repo or class names.
- **Considered and excluded** — a table (Item | Source | Reason) for every use case or rule in a source spec that this PRD deliberately does not carry over, including deliberate design differences from the source. Without it, a reader cannot tell an omission from a decision. If there is no source spec, write "No source spec provided" instead of dropping the entry.

### 6. Users and Use Cases
Who this is for, as personas, plus concrete use cases in "As a `<persona>`, I want `<capability>`, so that `<outcome>`" form. Keep this to the use cases that actually drive a requirement below — not a generic list of everyone who might ever touch the feature.

### 7. Product Features & Workflow
The core of the PRD. Break the flow into sub-flows (e.g. by screen, by actor — app flow vs backend flow vs field-agent flow — or by step), and for each:
- Describe what happens, including validations and edge cases.
- Add `[FLOWCHART NEEDED]` (skeleton stage) / an actual Mermaid diagram (full stage) for any sub-flow with more than one branch.
- Flag every point where the flow depends on another service or vendor with `[INTEGRATION: <name>]` (skeleton stage) / a short Success/Failure/Timeout outcome entry (full stage).
- If this flow changes behavior in an existing, already-shipped flow rather than adding something new, say so explicitly per the "flag drastic changes" rule in SKILL.md.

### 8. Business Rules Summary
One place for the decision tables an engineer or QA will check against: thresholds and tiers, status-to-behaviour matrices, funding or priority orders, eligibility matrices. Tables only, each row traceable to a section 7 rule. No endpoints, params or payloads. If section 7 already holds a table, reference it instead of copying it; if there are no such tables, write "Not applicable".

### 9. Design
Link(s) to Figma (or other design tool) mockups. Don't try to describe the UI in prose here — the PRD's job is to narrate logic and flow; the design tool is the source of truth for visuals. If mockups don't exist yet, say so and note who owns producing them.

At the skeleton stage, write one line: whether designs exist, will be supplied, or will be generated in phase 8b. At the full stage, paste the **Design handoff block** returned by the `figma-designer` skill: file link, a table of screens with a frame link and states per screen, design assumptions, and open design gaps. Links only, no embedded images. Mark `Design: not yet available, owner: <name>` if phase 8b was skipped or Figma was unavailable.

### 10. Data and Instrumentation
What events/properties need to be tracked (e.g. Mixpanel), and why — tie each tracked event back to a success metric in section 13 where possible, rather than listing events with no stated purpose.

### 11. Dashboards
Links to (or a request for) reporting/monitoring dashboards that will surface this feature's health post-launch.

### 12. System Overview
- **Internal Dependency Matrix** — which internal teams/systems are touched and what must change, in business terms (Team/System | Change Needed | Owner). No repo, class or method names.
- **External Dependencies** — third-party vendors/APIs this depends on (e.g. a banking partner, a toll network, a payment processor), and what happens to this feature if that dependency is unavailable or slow.

### 13. Success Criteria & Expected Impact
A metrics table: Metric | Target | Measurement method. Tie back to the sizing numbers in section 4 where possible — the PRD should make it obvious how you'll know if the sizing argument was right.

### 14. Rollout Plan
Phased or staggered rollout plan, and any experiments (A/B tests, limited pilots) planned before full rollout. Note what triggers moving from one phase to the next.

### 15. Open Questions
A table: `#` | Question | Owner | Blocking? Every clarifying question that came up during phases 1-8 and never got a firm answer belongs here — don't let an unresolved question silently disappear from the document just because the conversation moved on.

### 16. Marketing & PR plan
Only include if user-facing comms are relevant to this launch. If not applicable, say so in one line rather than omitting the section outright (see the note under "How to use this at each stage" above).
