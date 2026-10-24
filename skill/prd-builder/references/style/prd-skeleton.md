# PRD Skeleton Template

This is the section-by-section shape every Blackbuck PRD built by the skill should follow. It merges Blackbuck's blank PRD template with the fullest, most formally-structured PRD found in the PM's own reference material (the "LFO Portal" spec), reorganized to match the PM's stated build order: objective → problem → sizing → scope → everything else.

## How to use this at each stage

- **Skeleton stage (phase 6):** write the heading, plus 1-3 sentences describing what will go there **in business-logic terms** — what the customer/ops user/business actually experiences or decides, not which system calls which. Note `[FLOWCHART NEEDED]` inline wherever a flow has branches. Note `[API: <name>]` inline wherever an integration point will need the Success/Failure/Timeout block from `api-contract-block.md` — this is a bare flag for later expansion, not something to build the sentence around; the PM reading the skeleton should be able to follow the whole business flow without knowing what any of the flagged APIs are called. Do not write the full content yet.
- **Full PRD stage (phase 8):** replace each skeleton entry with the real content, expand `[FLOWCHART NEEDED]` markers into actual diagrams via `render_archify_diagram` (see `references/style/archify-diagrams.md`), and expand `[API: <name>]` markers into full API contract blocks. The business-logic-first framing from the skeleton carries forward into the full PRD too — see "Business logic first, APIs as supporting reference" in `tone-and-conventions.md`.

A section that genuinely doesn't apply to a given PRD (e.g. no Marketing & PR plan needed for a backend-only change) should still appear with a one-line "Not applicable — <why>" rather than being silently dropped. A missing section reads as an oversight; an explicitly-scoped-out section reads as a decision.

## Sections, in order

### 1. Title & Metadata
Title, Status (Draft / In Review / Approved), Author, Date, and the teams/repos in scope (from phase 4). This is the only section that's pure bookkeeping — keep it to a few lines.

### 2. Objective
What we're trying to achieve, stated as a concrete outcome — not an activity. One short paragraph.

### 3. Problem Statement
What's currently blocking that objective. Name the actual current behavior or gap, not a restatement of the objective in the negative.

### 4. Sizing
Why this is worth solving now — the numbers (volume, cost, frequency, users/trucks/transactions affected) that justify prioritizing it. If real numbers aren't available yet, say so explicitly as an open item rather than omitting the section.

### 5. Scope
- **Goals** — what this PRD covers.
- **Non-Goals / Out of Scope** — what it explicitly does not cover, and why (a two-column Out of Scope / Rationale table works well here).
- **Teams & repos involved** — the verticals selected in phase 4, and which repos within each are touched.

### 6. Users and Use Cases
Who this is for, as personas, plus concrete use cases in "As a `<persona>`, I want `<capability>`, so that `<outcome>`" form. Keep this to the use cases that actually drive a requirement below — not a generic list of everyone who might ever touch the feature.

### 7. Product Features & Workflow
The core of the PRD. Break the flow into sub-flows (e.g. by screen, by actor — app flow vs backend flow vs field-agent flow — or by step), and for each:
- **Describe what happens in business-logic terms first** — what the customer/ops user experiences, what decision or state change occurs, and why — including validations and edge cases. A reader with no engineering background should be able to follow the whole sub-flow from this description alone.
- Add `[FLOWCHART NEEDED]` (skeleton stage) / an actual diagram via `render_archify_diagram` (full stage) for any sub-flow with more than one branch.
- Flag every point where the flow calls an external or internal API with `[API: <name>]` (skeleton stage) / the full contract block (full stage) — but keep the flag out of the business-logic sentence itself; it's a pointer to the technical detail living in section 8 / that touchpoint's API Contract Block, not part of how the flow is narrated.
- If this flow changes behavior in an existing, already-shipped flow rather than adding something new, say so explicitly per the "flag drastic changes" rule in SKILL.md.

**Before finalizing the skeleton, run this checklist against the feature and mark each one in-scope, out-of-scope-with-a-reason, or "already covered above in §X" — don't silently drop one just because nothing upstream happened to mention it.** These are the categories a review of this skill's own past output found missing most often, precisely because nothing else in the process reliably surfaces them:

| Category | What to check for |
|---|---|
| **Exit flows** | What happens when the customer deliberately leaves — deactivation, closure of the specific thing being changed (tag/wallet/account/subscription), and reactivation after leaving. Include any precondition (e.g. dues must be clear first) and what does/doesn't get refunded. |
| **Failure & in-progress states, per status-changing action** | For every action that changes a status/flag on something — not just the ones with an obvious external API — what happens if the underlying call fails outright, and what happens while it's pending/unconfirmed (retry count, interval, and what "success" actually means, e.g. an API 200 versus a partner's own confirmation event/webhook landing later). |
| **Notifications** | Push/SMS/email copy for each state change a customer should hear about — title, body, and where it links to. If none are needed, say so explicitly rather than leaving the category out. |
| **Plans & value proposition** | If this feature has a plan/tier/pricing construct: what exactly is bundled into it, how a "recommended" option (if any) is chosen, any eligibility gate before the offer is even shown, and the opt-in/trial mechanics. |
| **Fee/cost collection priority** | If more than one funding source can pay for something, the explicit priority order between them (which is tried first, second, ...), what happens if collection succeeds from more than one source (refund the excess), and what changes about that order when one source becomes unavailable (e.g. a mandate is revoked). |
| **Ops/portal-facing changes** | Any field, view, or workflow change needed in an internal ops tool, not just the customer-facing surface — a new status value to display, a new filter, a support-team action. |

If a category genuinely doesn't apply, write the one-line "Not applicable — <why>" per the note at the top of this file — don't just omit it.

### 8. API Reference
A summary table of every API/integration touchpoint named in section 7 — Feature | Method | Endpoint | Key Params — each row linking down to its full Success/Failure/Timeout block. This section (and every `[API: <name>]` block it links to) is technical reference material for engineers, kept deliberately separate from section 7's narrative — a PM or other non-engineering stakeholder should be able to read section 7 top to bottom, skip this section entirely, and still understand exactly what the product does.

### 9. Design
Link(s) to Figma (or other design tool) mockups. Don't try to describe the UI in prose here — the PRD's job is to narrate logic and flow; the design tool is the source of truth for visuals. If mockups don't exist yet, say so and note who owns producing them.

### 10. Data and Instrumentation
What events/properties need to be tracked (e.g. Mixpanel), and why — tie each tracked event back to a success metric in section 13 where possible, rather than listing events with no stated purpose.

### 11. Dashboards
Links to (or a request for) reporting/monitoring dashboards that will surface this feature's health post-launch.

### 12. System Overview
- **Internal Tech Dependency Matrix** — which internal repos/services are touched and how (a table works well: Repo/Service | Change Needed | Owning Team).
- **External Dependencies** — third-party vendors/APIs this depends on (e.g. a banking partner, a toll network, a payment processor), and what happens to this feature if that dependency is unavailable or slow.

### 13. Success Criteria & Expected Impact
A metrics table: Metric | Target | Measurement method. Tie back to the sizing numbers in section 4 where possible — the PRD should make it obvious how you'll know if the sizing argument was right.

### 14. Rollout Plan
Phased or staggered rollout plan, and any experiments (A/B tests, limited pilots) planned before full rollout. Note what triggers moving from one phase to the next.

### 15. Open Questions
A table: `#` | Question | Owner | Blocking? Every clarifying question that came up during phases 1-8 and never got a firm answer belongs here — don't let an unresolved question silently disappear from the document just because the conversation moved on.

### 16. Marketing & PR plan
Only include if user-facing comms are relevant to this launch. If not applicable, say so in one line rather than omitting the section outright (see the note under "How to use this at each stage" above).
