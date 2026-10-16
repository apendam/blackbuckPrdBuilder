# Toll

> Populated 2026-10-16 from code-derived notes (`fms_toll` 79d2ca0, `toll-gold` 5228007), kept in `.claude/skills/figma-designer/context/` (`domain-toll-gold.md` has the detail). Static code reading only. Anything marked *unverified* needs the PM to confirm. This file is a lead for you and the PM, never PRD body text.

FASTag (toll) for fleet owners: ordering and issuing tags, recharge, balance, transactions, chargebacks, KYC, and the FASTag Gold subscription.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `fms_toll` | github.com/BLACKBUCK-LABS/fms_toll | Toll backend (modules toll-core, toll-non-web, toll-web): FASTag orders, recharge, balance, transactions, chargebacks, KYC cards, vendor differences |
| `toll-gold` | github.com/BLACKBUCK-LABS/toll-gold | FASTag Gold (ARP v2): subscription that gives instant top-ups on low balance. Legacy version is ZBPP/ARP |

## Key flows
- **Order and issue a FASTag** (Boss, BB Pro): order lifecycle, vehicle pre-validation (answers come back as server-driven bottom sheets, not errors), barcode assignment, payment, activation. Vendors differ.
- **Recharge, balance and transactions** (Boss), per vendor; recharge and KYC limits apply.
- **Chargebacks and refunds** (a limit of 3 chargeback requests per transaction per the code), **tag removal**, **Priority Plus**.
- **FASTag Gold (ARP v2):** plan status, mandate, suspension (10-day window) and hotlist rules, top-up cap, dues.
- **KYC cards** with status, copy and CTA per state.

## Cross-repo touchpoints
- Boss reaches Gold through the `supplywrapper` BFF (source not in the shared repos); which of `fms_toll` or `toll-gold` answers is *unverified* (both implement the Gold APIs).
- TZF issuance orders placed from BB Pro are created here and handed to TZF for activation (`tzf.md`, `bb-pro.md`).
- No cross-repo flow file exists yet in `../system-map/`.

## Core entities & jargon
- Vendors (issuers): IDFC, AXIS, LIVQ, TZF (see `tzf.md`). **Never assume parity between vendors.**
- Gold / ARP v2 versus ZBPP / ARP, hotlist, mandate (including UPI AutoPay for TZF), order and request statuses (CREATED, CONFIRMED, REQUESTED, APPROVED, ACTIVATED and others), Priority Plus.

## Common API integrations
- Gold APIs exist in both `fms_toll` and `toll-gold`; Boss never calls `/toll-gold/` directly.
- Responses carry error envelopes and server-driven sheets; fee values and GST are config-driven, not in code.

## Notes
- Notification copy and cadence per state are in `figma-designer/context/domain-toll-gold.md`, sections 4 and 7.
- Unread in the survey: IDFC, AXIS and LIVQ client internals, and the union, BBPS and replacement service bodies.
