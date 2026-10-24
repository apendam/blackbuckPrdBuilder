# BB Pro (Agent Sales App)

> Populated by Pass 1 (2026-08-27), from a local clone of `blackbuck-pro-app` (the PM confirmed this is the BB Pro repo — the earlier placeholder's guess that it was distinct from `bb-supply-fo-android` was correct). This is a genuinely multi-vertical "super app" — its content overlaps heavily with `sales.md`, `tzf.md`, `finserve.md`, `load-board.md`, and `gps.md`. This file focuses on the app itself; see those files for the vertical-specific flow detail.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | React Native/Expo app, `applicationId com.cpt_oe_react_app`, display name "Blackbuck Pro". Agent/field-rep-facing — confirmed distinct from `bb-supply-fo-android` (fleet-owner-facing, formerly named "BOSS"). |

## Key flows
BB Pro's `src/feature/` directory spans most of Blackbuck's verticals in one app:
- **Sales** — ASM/ASO reports, channel-partner management, meetings, leads (see `sales.md`)
- **TZF/FASTag** — `ft-activation`, `ft-installation`, `ft-inventory`, `tzf-full-kyc` (embeds the same Full KYC flow as `tzf-full-kyc-sdk-web` — see `tzf.md`)
- **Finserve** — `loans` module: application, CIBIL, penny-drop, vehicle valuation/repossession, video-FI (see `finserve.md`)
- **Load Board/Supply** — `indent`, bids, brokerage order creation (see `load-board.md`, `supply.md`)
- **GPS** — `gps-orders`, `gps-tickets`, `gps-coupon-codes` (see `gps.md`)
- Also: collections, coupon codes, POD (proof of delivery) performance tracking, BT-inventory, driver OTP, my-team/my-account management

## Cross-repo touchpoints
- → `fms_toll` (`/fmstoll/api/*`) — FASTag activation, cancel reason, OTP validate/generate; requests are source-tagged (`source=BB_PRO` on at least one endpoint), implying `fms_toll` distinguishes callers by client app.
- → `ppi-wallet` (`ENV.ppiWallet`) — TZF KYC transaction detail lookup.
- → `/supplywrapper/boss/fastag/*` — shared with `bb-supply-fo-android`; see `system-map/README.md`'s "Boss" naming note before assuming shared ownership.
- → `salesServiceApi`, `omsWrapper`, `/los/api` — three backend gateways referenced in code but **not yet cloned/mapped** as their own repos. Ask the PM for these.
- Embeds the Full KYC flow (`TZFKYCView.tsx`) the same way `tzf-activation-web-sdk` does via iframe — this app does it as a native WebView screen instead.

## Core entities & jargon
- **CPT** — appears in the Android `applicationId` (`com.cpt_oe_react_app`) and directory names; likely "Channel Partner Tool" or similar, unconfirmed.
- **OE** — same applicationId fragment; possibly "Onboarding Executive," unconfirmed.
- Shares TZF/Sales/Finserve jargon documented in those files (TSL, CRO, LFO, LOS, ASM, ASO) — this app is where several of those terms were first spotted across multiple contexts.

## Common API integrations
- `alchemistApi` — the shared gateway hosting `/fmstoll`, `/supplywrapper`, and other backend path prefixes.
- `salesServiceApi`, `omsWrapper`, `ppiWallet`, `los` — see per-vertical files for detail on each.

## Notes
- This app's `.agents/skills/` directory has its own build-and-release automation skills (`update-build-version`, `build-and-share-slack`) — not PRD content, but useful if a PRD needs to reference how this app ships.
- Given how many verticals this one app spans, a PRD that touches BB Pro should be explicit about which feature module(s) it's actually scoping — "BB Pro" alone is not a precise enough scope statement for Phase 4.
