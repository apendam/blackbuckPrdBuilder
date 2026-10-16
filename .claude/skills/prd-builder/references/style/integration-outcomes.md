# Integration Outcomes

Every point where the flow depends on another service or an external vendor gets an explicit **Success**, **Failure** and **Timeout** outcome. This keeps the house rule that failure and timeout branches are never skipped, but states them as business outcomes, not API contracts. Use this for every `[INTEGRATION: <name>]` marker in the full PRD (phase 8).

## What to write

Describe what the customer, the money and the system state look like in each case. Do not name endpoints, request or response fields, payloads, status codes, or any code identifier.

```markdown
### <Dependency, in business terms>  (e.g. "Mandate authorisation by the customer's bank")

**Purpose:** one line on what we need from it and where it sits in the flow.

- **Success:** what the customer sees, what state changes, what happens next.
- **Failure:** what the customer sees, whether the reason is shown, whether they can retry, what state we are left in.
- **Timeout:** treat as failure with unknown outcome unless stated. Retry rule as `X times every Y`, what happens when retries run out (customer message, ops alert, background re-check).
```

Keep each entry to the three bullets plus the purpose line. If a dependency is asynchronous (acknowledged now, result later), give the acknowledgement and the final result separate Success/Failure/Timeout bullets.

## Worked example

```markdown
### Mobile-number verification by SIM

**Purpose:** Confirms the phone's SIM matches the wallet's registered number before the UPI ID is created.

- **Success:** Verification completes and the flow continues to UPI ID creation.
- **Failure:** The customer sees the reason on the verification status screen with a Retry button.
- **Timeout:** Retry X times within Y minutes. If all fail, push the customer: "UPI ID creation failed for your Blackbuck PPI Wallet. Please click here to retry", landing on the UPI ID banner in the Ledger screen; tapping it restarts verification.
```

## Notes

- Use `X` / `Y` / `N` for numbers still being finalised with a vendor or backend team; log them in Open Questions only if blocking.
- If you do not know what should happen on failure or timeout, ask the PM. Do not leave it blank and do not invent it.
- Notification copy still follows the Title / Subtext / Landing Page / CTA block in `tone-and-conventions.md`.
