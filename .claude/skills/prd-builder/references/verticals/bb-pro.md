# BB Pro (Agent Sales App)

> Populated 2026-10-16 from the code-derived notes in `.claude/skills/figma-designer/context/` (BB Pro at commit f7cc17d). Static code reading only; nothing was run on a device. Detail lives in `bb-pro-app.md` there; this file is the short version. Anything marked *unverified* needs the PM to confirm.

React Native / Expo app used by BlackBuck employees and partners, not by fleet owners (fleet owners use the Boss app, see `android.md`). Android first, English only. What a user sees depends heavily on their `user_type` and on server flags.

## Key flows
- **Buy FASTag for a customer (TZF issuance):** drawer "Buy FASTag", order summary (bill, coupon, T&C), add vehicle (registration or 17-character chassis), server-driven forms (customer, RC or chassis documents), scan the FASTag barcode, OTP consent from the customer's phone, optional KYC, then the customer pays in their own BlackBuck app (the agent never takes payment). Activation is asynchronous.
- **Replace FASTag / change bank**, **FASTag inventory** (add by scan, mark lost), **FT installation** (photo evidence), **biometric device inventory**.
- **Toll KYC:** vendor branches: IDFC biometric, TZF web KYC, LIVQ SDK.
- **Incentives, earnings and sale history** (toll bonus UI behind a flag).
- **Loans** (application to sanction, e-sign, e-NACH), **Collections** (meeting log with location and photos), **Brokerage** (indents, bids, orders), **GPS install jobs** (guided activation), **Channel partner onboarding and KYC**, **Field sales meetings** (v1 and a smaller v2 for the new CP sales force).

## Owning repos
- `blackbuck-pro-app` (BB Pro).
- Backends it works with: `fms_toll` (Toll), `tzf-fastag` and `ppi-wallet` (called through the BlackBuck backend, not directly from the app). Web hand-offs: `tzf-activation-web-sdk`, `tzf-full-kyc-sdk-web`.

## Core entities & jargon
- Roles: ASO (shown as "CRO" in UI), TSL, ASM, ZSH / RSH / NH (senior levels), CP (channel partner), KAM (a CP_ASO in CP screens), FO (fleet owner, the customer). `CP_` prefixed types use the v2 app.
- FT = FASTag. TZF = the BlackBuck FASTag issuer entity (shown as "BlackBuck" in the partner-bank list). KYV, KYC, NETC: see `tzf.md`.
- "Mimic" = an admin viewing the app as another user.

## Common API integrations
- Server-driven screens: dynamic forms and 11 server action types (SHOW_ALERT, NAVIGATE_TO, MAKE_API_CALL and others). Form fields, tabs, labels and timeline steps come from the backend, so a PRD must name the form ids or ask the backend team rather than assume fields.
- TZF issuance order, vehicle assign, barcode assign, OTP generate and validate, KYC status (in `fms_toll`). Which exact endpoint each screen calls is in `bb-pro-app.md` (`Endpoints.*` keys).

## Notes
- No backend notes exist yet for loans, collections, brokerage, incentives, meetings or the GPS install backend. For those, ask the PM to walk through the flow.
- The existing screen map, states and flows are in `figma-designer/context/bb-pro-app.md`; use it when a PRD changes an existing screen.
