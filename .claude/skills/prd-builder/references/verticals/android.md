# Android

> Populated 2026-10-16 from code-derived notes (Boss at commit 559c932), kept in `.claude/skills/figma-designer/context/` (`boss-app.md` has the detail). Static code reading only; nothing was run on a device. Anything marked *unverified* needs the PM to confirm. This file is a lead for you and the PM, never PRD body text.

The Android vertical is the **Boss** app (README: "BlackBuck app, formerly BOSS"; package `com.zinka.fleet`), used by truck fleet owners. Native Kotlin/Java: most screens are legacy XML, newer ones Jetpack Compose with MVI. English, Hindi, Kannada, Telugu and Tamil.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `bb-supply-fo-android` | github.com/BLACKBUCK-LABS/bb-supply-fo-android | "Boss Android App", the fleet-owner-facing app. It also carries the whole Supply (load board) surface, so the Supply link in `supply.md` is confirmed in the code, not just a name guess |

Backends it talks to: `fms_toll` and `toll-gold` (FASTag; Boss reaches Gold through the `supplywrapper` BFF, whose source is not in the shared repos) and `boss_help_desk` (help desk).

## Key flows
- **Launch and login:** splash, language, phone and OTP, device registry, location prompt, home.
- **Home hub:** server-driven bottom tabs, tiles and drawer; service tiles can be blocked by flags that show a block sheet.
- **FASTag:** recharge, buy, auto recharge (Gold), ledger and chargeback.
- **Money:** wallet balance, passbook, add money, dues, cash drop.
- **Supply (load board, the largest area):** find loads, bid, book, orders, payout to bank.
- **GPS and AI dashcam**, **diesel/fuel card**, **KYC** (truck and owner), **help desk** (Freshdesk-backed), **notifications and settings**.

## Cross-repo touchpoints
- FASTag recharge, Gold and chargeback run through Toll (`toll.md`, via `supplywrapper`); help desk runs through `boss_help_desk`.
- FASTag issuance for a customer is started by agents in BB Pro (`bb-pro.md`); whether the fleet owner sees a request raised by an agent in Boss is *unverified*.
- No cross-repo flow file exists yet in `../system-map/`.

## Core entities & jargon
- FO (fleet owner, the only end-user role), Find Loads, SuperLoads (brokerage loads), Orders, BlackBuck Account (wallet), Passbook, Cash Drop, Dues, FASTag Gold (instant top-up subscription).
- Deeplinks use `boss://blackbuck/<TARGET>`; pushes share the same target keys.

## Common API integrations
- Most traffic goes through `supplywrapper` (not in the shared repos), so which service answers a given call is often unknown. FASTag calls also go directly to `/fmstoll/api/...`.

## Notes
- The server decides a lot: tabs, tiles, drawer, banners, block-sheet text, payment and fuel text, dashcam controls. A PRD cannot fix these by design alone; they need backend or config work.
- Known dead spots: the Trucks bottom-nav tab has no screen; the manifest names a `SearchTrucksActivity` class that does not exist.
- No backend notes exist for supply/load board, GPS, diesel or the money wallet.
- The existing screen map, states and flows are in `figma-designer/context/boss-app.md`; use it when a PRD changes an existing Boss screen.
