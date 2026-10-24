# TZF

> Populated by Pass 1 (2026-08-27) from local clones of all 6 owning repos below. Grounded in code, not repo naming. This is the best-covered vertical in this knowledge base — a good first choice for test-driving the skill end-to-end.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `tzf-activation-web-sdk` | github.com/BLACKBUCK-LABS/tzf-activation-web-sdk | Next.js web port of `blackbuck-pro-app`'s FASTag activation flows — lead search, activation forms, truck search/assign, barcode scan, installation ticketing, order status/billing. |
| `tzf-ops-portal` | github.com/BLACKBUCK-LABS/tzf-ops-portal | Vanilla-JS internal ops portal (Google-SSO gated) — issuance/closure/replacement, tag control tower, KYV upload, wallet ops, compliance checks (PEP, LFO whitelist). |
| `tzf-fastag` | github.com/BLACKBUCK-LABS/tzf-fastag | Core FASTag-lifecycle backend: issuance, KYV, M2P/NETC vendor ops, tag status/control rules, wallet recharge/mandates/BBPS, portal-facing read APIs. |
| `tzf-full-kyc-sdk-web` | github.com/BLACKBUCK-LABS/tzf-full-kyc-sdk-web | "Full KYC" web flow (PAN/address-proof, liveness selfie, e-sign, OTP consent), built to run inside a React Native WebView. |
| `TZF-portal` | github.com/BLACKBUCK-LABS/TZF-portal | Customer-facing portal for the FASTag/"Tag Wallet" product (payments.blackbuck.com, operated by "TZF Logistics Solutions Private Limited"). |
| `ppi-wallet` | github.com/BLACKBUCK-LABS/ppi-wallet | PPI wallet backend — also listed under Payments. The shared financial + identity backbone underneath the whole TZF ecosystem (KYC + money movement). |

Also touched by (owned elsewhere, see those verticals): `fms_toll` (Toll — has native TZF packages), `blackbuck-pro-app` (BB Pro — embeds the Full KYC flow and calls `fms_toll`).

## Key flows
- **FASTag activation**: lead search → dynamic activation form → truck search/assign → barcode scan → installation ticketing → order status/billing. See `../system-map/flows/fastag-onboarding-and-activation.md` for the full cross-repo sequence.
- **Full KYC**: PAN + address-proof upload, live selfie + liveness check, e-signature, customer + agent OTP consent, TSL review. Also a "Minimum KYC" opt-out fallback with a lower recharge limit (₹10k min-KYC vs ₹2L full-KYC, per `TZF-portal`).
- **Paper KYC** ("TZF Agent Flow", per `ppi-wallet`'s own docs): field-agent-driven onboarding — agent verified via `tsl_repo`, physical document capture, CAF PDF generation, Aadhaar masking.
- **Tag issuance / vehicle binding**, incl. chassis/VRN validation and a Kafka-driven retry/recovery flow for vendor (M2P/NETC) failures.
- **Wallet recharge & payments**: UPI recharge (M2P two-phase credit-hold-then-credit), eNACH mandate auto-recharge, BBPS bill payments via Setu.
- **Ops-side tag control**: hotlist/blacklist ("Tag Control Tower"), status refresh, closure, replacement.
- **Compliance checks**: PEP (Politically Exposed Person) status, LFO whitelist.

## Cross-repo touchpoints
Full sequence in `../system-map/flows/fastag-onboarding-and-activation.md`. Summary of the dependency graph found in Pass 1:
- `tzf-activation-web-sdk` → `fms_toll` (`/fmstoll/api/*`, nearly every core endpoint) and → `tzf-full-kyc-sdk-web` (iframe embed)
- `tzf-activation-web-sdk` → `ppi-wallet` (KYC transaction detail lookup)
- `tzf-full-kyc-sdk-web` → `ppi-wallet` (100% of its backend calls — no other dependency)
- `tzf-ops-portal` → `tzf-fastag` (nearly all calls) and → `ppi-wallet` (wallet debit/lookup, LFO whitelist, FO selfie-link)
- `tzf-fastag` → `ppi-wallet` (UPI recharge funding) and ← `ppi-wallet` (mandate-status forwarded via Kafka)
- `tzf-fastag` → a `tzfPortal` package consumed by `TZF-portal` and/or `tzf-ops-portal` — **which one is unconfirmed**, no direct code evidence disambiguates it
- `TZF-portal` → `ppi-wallet` (wallet/user details) and → `tzf-fastag` (truck list, transaction ledger)
- `ppi-wallet` ↔ `fms_toll` (bidirectional — KYC-status callback, toll sales-code lookup, shared Kafka event contract)
- `blackbuck-pro-app` (BB Pro) embeds the Full KYC flow natively and calls `fms_toll`, tagging requests `source=BB_PRO`

## Core entities & jargon
Confirmed or partially confirmed from code (earlier research had flagged these as needing re-derivation — updated below):
- **TZF** — "Toll & FASTag" per `tzf-fastag`'s own `TZF_FASTAG_DATA_DICTIONARY.md` ("System: TZF-FASTag (Toll & FASTag Management Platform)"). Never spelled out as a formal acronym anywhere in code — this is the working expansion, not a confirmed breakdown.
- **CRO** — appears in `fms_toll` and `ppi-wallet` (selfie/mobile resolution flow); a field-agent-ish role, exact expansion still unconfirmed.
- **TSL** — appears across `ppi-wallet` (`tsl_repo`, `TslController`, `TSL_SELFIE_VERIFICATION`) and `blackbuck-pro-app` (`toll-tsl-checkin`/`checkout`, multiple `feature/*/tsl` folders); a role/workflow tied to physical Paper-KYC verification, exact expansion still unconfirmed — ask the PM.
- **FO** — Fleet Owner (confirmed by usage — `searchFleetOwnerTruck`, "FO selfie link", "fleet-owner-facing" throughout).
- **LFO** — "Large Fleet Owner" is the working guess (LFO whitelist sits alongside PEP compliance checks); unconfirmed.
- **PPI** — Prepaid Payment Instrument (confirmed — `ppi-wallet`'s full name/purpose).
- **VPA** — UPI Virtual Payment Address, standard UPI terminology, used in wallet/recharge flows.
- **M2P** — M2P Fintech, the NETC-authorized vendor for FASTag tag issuance/status/swipe (confirmed — `M2PClient.java` calls `fleet-gateway.m2pfintech.com`).
- **NETC** — National Electronic Toll Collection, the national FASTag interoperability network (standard industry term, confirmed via usage).
- **KYV** — Know Your Vehicle (confirmed — vehicle RC/document verification, distinct from KYC).
- **KYC tiers**: Min-KYC (₹10k recharge limit) vs Full-KYC (₹2L limit) — confirmed in `TZF-portal`.

## Common API integrations
- `/ppi-wallet/api/*` — wallet, KYC document/OTP, TSL review (the single most-called backend across this vertical)
- `/tzf-fastag/api/*` — tag issuance, status, portal reads
- `/fmstoll/api/*` — shared with Toll; activation, order status, sales-code, KYC callback
- M2P Fintech (`fleet-gateway.m2pfintech.com`) — NETC vendor tag operations
- Setu — BBPS bill-payment aggregator
- IDFY / Surepass — digital KYC verification vendors (`ppi-wallet`)
- Kotak — bank-partner account backing the PPI wallet ledger

## Notes
- **Security**: `tzf-fastag`'s and `ppi-wallet`'s **production** configs both have hardcoded AWS access keys in plaintext (the latter has two full key+secret pairs, one guarding a KYC-document bucket). Flagged to the PM/security separately — not a PRD-writing concern, but relevant context if a PRD touches these services' infra.
- `ppi-wallet` is jointly TZF- and Payments-owned in practice (KYC/identity serves TZF, wallet ledger serves Payments) — the code doesn't self-declare a single owning team, worth a PM sanity-check when scoping a PRD that touches it.
