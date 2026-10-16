# TZF

> Populated 2026-10-16 from the code-derived notes in `.claude/skills/figma-designer/context/` (`tzf-fastag` 2492cfd, `ppi-wallet` 04ef116, web repos). Static code reading only. Detail: `domain-tzf-ppi.md` and `web-and-ops-surfaces.md` there. Anything marked *unverified* needs the PM to confirm.

TZF is BlackBuck's FASTag issuer entity. A "TZF FASTag" is a NETC tag issued through vendor M2P and paid from a prepaid PPI wallet.

## Key flows
- **Issuance:** kit assigned to the agent, wallet active, vehicle lookup, OTP, submit, asynchronous activation (client polls; about 10 minutes before it is marked failed), then KYV within 3 days or the tag is hotlisted. Types: VRN issuance, chassis issuance, chassis later updated to a VRN. Replacement closes the old tag first.
- **Tag ON/OFF toggle:** OFF hotlists, ON dehotlists. Outcomes are SUCCESS, FAILURE or BLOCKED, with fixed messages.
- **Tag status** follows a priority order: BLACKLIST, then HOTLISTED, E_NOTICE, LOW_BALANCE, CLOSED, ACTIVE.
- **Wallet:** dedupe, OTP, create (PAN verified); recharge by BC, UPI (two-phase) or BBPS; auto-recharge mandate with retries.
- **KYC:** MIN (small limits) versus MAX (full KYC, higher cap). Full KYC involves the customer, an agent and a TSL reviewer; Paper KYC is agent or portal assisted.
- Closure, replacement and chassis-to-VRN update.

## Owning repos
- `tzf-fastag` (issuance, tag status, KYV, mandates, SMS), `ppi-wallet` (wallet, KYC, UPI, BBPS, mandates).
- Web: `tzf-activation-web-sdk` (agent-assisted activation, mobile web), `tzf-full-kyc-sdk-web` (biometric full KYC), `tzf-customer-portal` (customers, desktop), `tzf-ops-portal` (internal ops).
- `fms_toll` holds the order side when issuance starts from BB Pro (see `toll.md`).

## Core entities & jargon
- TZF, NETC (national toll collection; tag standing is an exception list), M2P (vendor enabler), VC4 (car, jeep: KYV exempt, never LOW_BALANCE), KYV (know your vehicle: photos and documents), KYC MIN / MAX, PPI wallet, BC (BlackBuck customer or agent id, also the credit pool), BBPS (bill payments), e-mandate, E-notice, hotlist / dehotlist, TSL, CAF (customer application form), PEP (politically exposed person screening), CP (channel partner), FO (fleet owner).

## Common API integrations
- External: M2P, Setu (BBPS), Vyakhya (SMS), Zigram (PEP screening). Both services are called by the BlackBuck backend, not by Boss or BB Pro directly; the screen-to-endpoint mapping is not in these repos.
- Issuance validation failures return HTTP 200 with a failure status and error code, not an HTTP error.

## Notes
- SMS only for notifications; no push or WhatsApp in these repos. No GST logic exists in either service. `/caf/blank` appears only in docs, not in code (*unverified* as an endpoint).
- Likely bugs, not tested at runtime: KYC completion may never reach the activation web SDK when the KYC SDK runs in an iframe; `salesCode` and `sales_code` query params are used inconsistently. Do not write a PRD that assumes those hops work.
- Do not copy secrets. `ppi-wallet`'s committed prod config contains secret-like values that should be rotated.
