# TZF

> Populated 2026-10-16 from code-derived notes (`tzf-fastag` 2492cfd, `ppi-wallet` 04ef116, web repos), kept in `.claude/skills/figma-designer/context/` (`domain-tzf-ppi.md` and `web-and-ops-surfaces.md` have the detail). Static code reading only. Anything marked *unverified* needs the PM to confirm. This file is a lead for you and the PM, never PRD body text.

TZF is BlackBuck's FASTag issuer entity. A "TZF FASTag" is a NETC tag issued through vendor M2P and paid from a prepaid PPI wallet.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `tzf-fastag` | github.com/BLACKBUCK-LABS/tzf-fastag | FASTag issuance, tag status, KYV, mandates, SMS (NETC / M2P) |
| `ppi-wallet` | github.com/BLACKBUCK-LABS/ppi-wallet | PPI (Prepaid Payment Instrument) wallet: wallet, KYC levels, UPI, BBPS, mandates. Also listed under Payments; which is primary is **unconfirmed** |
| `tzf-activation-web-sdk` | github.com/BLACKBUCK-LABS/tzf-activation-web-sdk | Agent-assisted FASTag activation, mobile web |
| `tzf-full-kyc-sdk-web` | github.com/BLACKBUCK-LABS/tzf-full-kyc-sdk-web | Biometric full-KYC flow, mobile web |
| `TZF-portal` | github.com/BLACKBUCK-LABS/TZF-portal | Customer-facing TZF portal (desktop) |
| `tzf-ops-portal` | github.com/BLACKBUCK-LABS/tzf-ops-portal | Internal ops portal |

`fms_toll` holds the order side when issuance starts from BB Pro (see `toll.md`).

## Key flows
- **Issuance:** kit assigned to the agent, wallet active, vehicle lookup, OTP, submit, asynchronous activation (client polls; about 10 minutes before it is marked failed), then KYV within 3 days or the tag is hotlisted. Types: VRN issuance, chassis issuance, chassis later updated to a VRN. Replacement closes the old tag first.
- **Tag ON/OFF toggle:** OFF hotlists, ON dehotlists. Outcomes are SUCCESS, FAILURE or BLOCKED, with fixed messages.
- **Tag status** follows a priority order: BLACKLIST, then HOTLISTED, E_NOTICE, LOW_BALANCE, CLOSED, ACTIVE.
- **Wallet:** dedupe, OTP, create (PAN verified); recharge by BC, UPI (two-phase) or BBPS; auto-recharge mandate with retries.
- **KYC:** MIN (small limits) versus MAX (full KYC, higher cap). Full KYC involves the customer, an agent and a TSL reviewer; Paper KYC is agent or portal assisted.
- Closure, replacement and chassis-to-VRN update.

## Cross-repo touchpoints
- Issuance starts in BB Pro (`bb-pro.md`), is ordered through Toll (`toll.md`), then activated and KYV-tracked here. Both TZF services are called by the BlackBuck backend, not by Boss or BB Pro directly.
- The activation web SDK embeds the KYC web SDK in an iframe. Likely bug, not tested at runtime: the KYC SDK only reports completion in a way a native webview understands, so completion may never reach the activation SDK.
- Payments (`payments.md`) shares the PPI wallet; no cross-repo flow file exists yet in `../system-map/`.

## Core entities & jargon
- TZF, NETC (national toll collection; tag standing is an exception list), M2P (vendor enabler), VC4 (car, jeep: KYV exempt, never LOW_BALANCE), KYV (know your vehicle: photos and documents), KYC MIN / MAX, PPI wallet, BC (BlackBuck customer or agent id, also the credit pool), BBPS (bill payments), e-mandate, E-notice, hotlist / dehotlist, TSL, CAF (customer application form), PEP (politically exposed person screening), CP (channel partner), FO (fleet owner).
- LFO and VPA appeared in the PM's earlier PRDs but are not defined in the code notes: ask the PM rather than assume.

## Common API integrations
- External: M2P, Setu (BBPS), Vyakhya (SMS), Zigram (PEP screening). The screen-to-endpoint mapping is not in these repos.
- Issuance validation failures return a failure status with an error code, not an HTTP error.

## Notes
- SMS only for notifications; no push or WhatsApp in these repos. No GST logic exists in either service. `/caf/blank` appears only in docs, not in code (*unverified* as an endpoint).
- The query parameters `salesCode` and `sales_code` are used inconsistently in the activation web SDK. Do not write a PRD that assumes these two hops work without confirming.
- Do not copy secrets. `ppi-wallet`'s committed prod config contains secret-like values that should be rotated.
