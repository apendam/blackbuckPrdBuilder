# API Contract Block

This is the single most consistent convention found across the PM's own reference PRDs: every API or system integration touchpoint gets documented with explicit **Success**, **Failure**, and **Timeout** handling. Use this template for every `[API: <name>]` marker in the full PRD (phase 8). Never write an API section that only covers the happy path.

## Why all three, every time

Engineers implement PRDs, they don't just read them once — the failure and timeout branches are usually where real incidents happen, and they're the parts most likely to get skipped if the PM doesn't force the question. If you don't know what should happen on failure or timeout for a given API, that's a clarifying question to ask, not a section to leave blank.

## Template

```markdown
### `<API Name>`

**Purpose:** one sentence on what this call does and where it sits in the flow.

**Request:**
```json
{
  "field": "value — annotate any non-obvious field inline"
}
```

**Response:**
```json
{
  "field": "value — annotate any non-obvious field inline, e.g. which field must be stored and reused in a later call"
}
```

**Success:**
- What happens in the product when this call succeeds.
- Any conditional success states (e.g. "success, but already in target state" is still success — say what happens then too).

**Failure:**
- What the user/agent sees.
- Whether the failure reason is surfaced (and where it comes from — an error-code mapping, a vendor-provided message, etc.).
- Whether the user can retry, and how.

**Timeout:**
- How long before this is considered a timeout.
- Retry behavior: how many times, over what interval (use placeholders like `X times within Y minutes` if the exact numbers are still TBD with a vendor/backend team — don't invent numbers to look complete).
- What happens if retries are exhausted: does the user get a notification? What does it say (Title / Body / Landing page / CTA)? Does a background job keep checking?
```

## Worked example

```markdown
### SIM Binding Request API

**Purpose:** Confirms the phone's SIM matches the wallet's registered number before proceeding with UPI VPA creation.

**Request:**
```json
{
  "channelCode": "...",
  "deviceInfo": { "deviceId": "...", "os": "...", "mobile": "..." },
  "seqNo": "..."
}
```

**Response:**
```json
{
  "status": "...",
  "callbackRef": "...", // reference ID — store this, required in the next API call
  "result": {
    "data": "...", // encrypted string to send via SMS
    "to": "..."    // number the SMS must be sent to
  }
}
```

**Success:**
- SMS is sent from the bound SIM to the number in `result.to` with the body from `result.data`.
- Once delivery is confirmed, proceed to the next API in the chain.

**Failure:**
- Store the failure reason.
- Surface it in the sim-binding status screen, with a retry option.

**Timeout:**
- Retry the API up to X times within Y minutes so the user isn't blocked mid-flow.
- If retries are exhausted, send a push notification:
  - Title: "UPI ID creation failed for your Blackbuck PPI Wallet"
  - Subtext: "Please click here to retry"
  - Landing page: Ledger screen, UPI ID banner
  - Tapping the banner restarts the SIM binding process automatically.
```

## Ground every Failure/Timeout branch in the code, not boilerplate

"Customer notified in Boss App, can retry" is not a Failure section — it's a sentence that's true of almost every API touchpoint whether or not any retry logic actually exists, which means it tells the engineer nothing. Before writing Failure/Timeout for a touchpoint, grep the owning repo for the actual mechanism (retry-count constants, scheduler/cron classes, status enums for that call) and write one of these two outcomes — never the generic sentence that could apply either way:

**The repo has real retry/escalation logic — cite it by name:**

```markdown
**Timeout:**
- `tzf-fastag`'s `MandateServiceImpl` retries mandate presentation up to `MAX_PRESENTATION_RETRY_COUNT = 3`.
- `MandatePresentationRetryScheduler` runs a differentiated cron: general failures retry every 10 min (excluding insufficient-funds), insufficient-funds failures get their own 15-min job over a 2-day window, and a 6-hourly reconciliation pass catches anything still unresolved.
- After 3 retries: dues remain outstanding, tag stays hotlisted, customer notified in Boss App.
```

> **This specific example is scoped to `tzf-fastag`'s `ArmMandate` — a TZF/PPI wallet auto-recharge mandate.** It is illustrating the *shape* of a real, grounded Timeout section, not a fact about mandates in general. Blackbuck has more than one thing called a "mandate" (this wallet one, and a separate Gold-subscription `TollMandate` in `toll-gold`, at minimum) — they share a naming convention, not a mechanism. If the touchpoint you're actually writing up concerns a different mandate entity, this example's retry count and scheduler do not apply to it; go grep *that* entity's owning repo from scratch. Reusing this example's specifics for a different mandate system by name-similarity alone is exactly the kind of mistake this note exists to prevent.

**The repo has no retry/escalation logic for this state — say that plainly, don't paper over it:**

```markdown
**Failure:**
- Searched `fms-inbound-payment` and `tzf-fastag` for retry logic on mandate registration failure — found none. `REGISTRATION_FAILED` / `MandateStatus.REJECTED` / `FAILED` are all coded as terminal states; the only reaction in either repo is a one-time tenant notification.
- This means "how does the user retry a failed mandate registration" is currently an open product question, not documented behavior — flag it in Open Questions rather than inventing a retry flow the code doesn't have.
```

Both are acceptable PRD content. What's not acceptable is writing text that reads the same regardless of which of these is actually true — that's the tell that the repo was never actually checked for this specific touchpoint.

## Notes on real usage

- If an API is asynchronous (fire-and-acknowledge, with the real result arriving later via webhook), say so, and document the acknowledgment's Success/Failure/Timeout separately from the eventual webhook result's Success/Failure/Timeout — they're two different contracts, don't collapse them into one.
- Use `X` / `Y` / `N` placeholders freely for numeric values (retry counts, intervals, thresholds) that are genuinely still being finalized with a vendor or backend team — that's a normal, expected state for a PRD in progress, not a gap to hide. Flag it as an open question (skeleton section 15) if it's blocking.
- Prefer real, annotated sample JSON over an abstract schema description when you have it — it's more useful to the engineer implementing the flow and matches how Blackbuck PRDs are actually written.
