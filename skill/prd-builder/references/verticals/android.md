# Android

> Populated by Pass 1 (2026-08-27). Confirmed via the repo's own README, not just its name.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `bb-supply-fo-android` | github.com/BLACKBUCK-LABS/bb-supply-fo-android | Confirmed via its own README: **"BlackBuck app (formerly known as BOSS)"**. `applicationId com.zinka.boss`, package `com.zinka.fleet`. The fleet-owner-facing native Android app — genuinely a different app from BB Pro (`blackbuck-pro-app`), not the same app under a second name. Multi-module (Kotlin + Jetpack): has dedicated `feature/gps` and `fleet/supply/bookload` modules, so it spans Android + Supply + GPS, not Android alone. |

Note: `blackbuck-pro-app` (BB Pro, see `bb-pro.md`) is also React Native/Android+iOS but is tracked under its own vertical since it's agent-facing rather than fleet-owner-facing, and spans far more verticals than Android alone.

## Key flows
- Fleet-owner login/auth (shared "boss-auth" service — see `system-map/README.md`'s "Boss" naming note)
- Load booking (`fleet/supply/bookload` module — see `supply.md`)
- GPS features (`feature/gps` module — see `gps.md`)
- KYC document capture for trucks/truck-owners (per test fixtures: PAN card, electricity bill, RC, selfie uploads) — same domain as TZF's KYC flows but this app's own client-side implementation, relationship to `tzf-full-kyc-sdk-web`/`ppi-wallet` not yet confirmed

## Cross-repo touchpoints
- Shares the `/supplywrapper/boss/*` API path family with `blackbuck-pro-app` — see `system-map/README.md`'s "Boss" naming note before assuming this means shared ownership.
- No other repo's Pass 1 survey found a direct code reference to `bb-supply-fo-android` by name — its backend integrations use generic gateway path segments, so its cross-repo dependencies are currently inferred from path-naming conventions rather than confirmed direct references.

## Core entities & jargon
- **FO** — Fleet Owner, this app's primary user.
- **BOSS** — the app's former name; still visible in `applicationId` (`com.zinka.boss`) and shared backend path segments. See `system-map/README.md` for the broader "Boss" naming ambiguity across repos.

## Common API integrations
- Not yet enumerated in detail — Pass 1 focused on module/feature breadth over endpoint-level detail for this repo. Revisit if a PRD needs exact request/response shapes.

## Notes
- Git branching/PR conventions are documented in the repo's own README (JIRA-ticket-based branch naming, enforced by CI) — useful context for an engineer implementing a PRD here, not directly PRD content.
