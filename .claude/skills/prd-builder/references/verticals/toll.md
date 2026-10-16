# Toll

> Populated 2026-10-16 from the code-derived notes in `.claude/skills/figma-designer/context/` (`fms_toll` 79d2ca0, `toll-gold` 5228007). Static code reading only. Detail: `domain-toll-gold.md` there. Anything marked *unverified* needs the PM to confirm.

FASTag (toll) for fleet owners: ordering and issuing tags, recharge, balance, transactions, chargebacks, KYC, and the FASTag Gold subscription.

## Key flows
- **Order and issue a FASTag** (Boss, BB Pro): order lifecycle, vehicle pre-validation (answers come back as server-driven bottom sheets, not errors), barcode assignment, payment, activation. Vendors differ.
- **Recharge, balance and transactions** (Boss), per vendor; recharge and KYC limits apply.
- **Chargebacks and refunds** (a limit of 3 chargeback requests per transaction per the code), **tag removal**, **Priority Plus**.
- **FASTag Gold (ARP v2):** subscription that gives instant top-ups on low balance. Plan status, mandate, suspension (10-day window) and hotlist rules, top-up cap, dues. Legacy version is ZBPP/ARP.
- **KYC cards** with status, copy and CTA per state.

## Owning repos
- `fms_toll` (modules toll-core, toll-non-web, toll-web) and `toll-gold` (Gold). Boss reaches Gold through the `supplywrapper` BFF (source not in the shared repos).

## Core entities & jargon
- Vendors (issuers): IDFC, AXIS, LIVQ, TZF (see `tzf.md`). **Never assume parity between vendors.**
- Gold / ARP v2 versus ZBPP / ARP, hotlist, mandate (including UPI AutoPay for TZF), order and request statuses (CREATED, CONFIRMED, REQUESTED, APPROVED, ACTIVATED and others), Priority Plus.

## Common API integrations
- Gold APIs exist in both `toll` and `gold`; Boss never calls `/toll-gold/` directly. The `supplywrapper` BFF forwards to one of them (*unverified* which).
- Responses carry error envelopes and server-driven sheets; fee values and GST are config-driven, not in code.

## Notes
- Notification copy and cadence per state are in `domain-toll-gold.md` sections 4 and 7.
- Unread in the survey: IDFC, AXIS and LIVQ client internals, and the union, BBPS and replacement service bodies.
