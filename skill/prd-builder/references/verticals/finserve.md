# Finserve

> Populated by Pass 1 (2026-08-27), first real evidence for this vertical (previously fully empty). Evidence is entirely from `blackbuck-pro-app`'s `loans` feature module — no dedicated Finserve backend repo has been cloned.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | Its `src/feature/loans` module is a full loan-origination front-end: application form, CIBIL check/OTP, penny-drop bank verification, digital verification, vehicle valuation/repossession, video-FI (field investigation). Calls a backend at `/los/api` (Loan Origination System) — **not among the 11 cloned repos**. |

`ppi-wallet`'s production config also references a bucket named `gcp-sit-finserv-los` — same "LOS" term, suggesting the actual loan-origination backend repo exists somewhere and isn't in scope yet. Worth asking the PM specifically for the LOS repo.

## Key flows
- Loan application (dynamic form, `loans-application-form`)
- CIBIL credit check with OTP consent
- Penny-drop bank account verification
- Digital verification / Form 60 (tax-related declaration)
- Video-FI (video field investigation, likely a lending-compliance requirement)
- Vehicle valuation and repossession (for asset-backed lending against trucks)
- Credit line management, loan application history/status tracking

## Cross-repo touchpoints
- `blackbuck-pro-app` → `los` backend (unmapped — no repo cloned)
- Possible connection to `ppi-wallet`'s `gcp-sit-finserv-los` bucket reference, unconfirmed

## Core entities & jargon
- **LOS** — Loan Origination System (working expansion, standard fintech term, matches the API path and bucket naming — not spelled out in any repo surveyed).
- **CIBIL** — India's credit bureau; a CIBIL check is a standard lending-eligibility step.
- **Penny-drop** — a ₹1 test transfer used to verify a bank account belongs to the applicant.
- **Video-FI** — Video Field Investigation, a verification step (exact process not yet detailed).

## Common API integrations
- `/los/api` — the loan-origination backend; not yet cloned/surveyed in detail.
- CIBIL bureau API (via `los` presumably, not called directly from the app per code surveyed).

## Notes
- This is the least-verified vertical of the newly populated ones — everything here comes from client-side feature-module names and one API base URL, not from reading the actual LOS backend. Treat as a starting point for a PM conversation, not settled fact.
