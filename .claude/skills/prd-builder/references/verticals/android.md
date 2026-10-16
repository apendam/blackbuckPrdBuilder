# Android

> Populated 2026-10-16 from the code-derived notes in `.claude/skills/figma-designer/context/` (Boss at commit 559c932). Static code reading only; nothing was run on a device. Detail: `boss-app.md` there. Anything marked *unverified* needs the PM to confirm.

The Android vertical is the **Boss** app (README: "BlackBuck app, formerly BOSS"; package `com.zinka.fleet`), used by truck fleet owners. Native Kotlin/Java: most screens are legacy XML, newer ones Jetpack Compose with MVI. English, Hindi, Kannada, Telugu and Tamil.

## Key flows
- **Launch and login:** splash, language, phone and OTP, device registry, location prompt, home.
- **Home hub:** server-driven bottom tabs, tiles and drawer; service tiles can be blocked by flags that show a block sheet.
- **FASTag:** recharge, buy, auto recharge (Gold), ledger and chargeback.
- **Money:** wallet balance, passbook, add money, dues, cash drop.
- **Supply (load board, the largest area):** find loads, bid, book, orders, payout to bank.
- **GPS and AI dashcam**, **diesel/fuel card**, **KYC** (truck and owner), **help desk** (Freshdesk-backed), **notifications and settings**.

## Owning repos
- `bb-supply-fo-android` (Boss). Backends: `fms_toll` and `toll-gold` (FASTag; Boss reaches Gold through the `supplywrapper` BFF, whose source is not in the shared repos), `boss_help_desk` (help desk). BB Pro is separate (`bb-pro.md`).

## Core entities & jargon
- FO (fleet owner, the only end-user role), Find Loads, SuperLoads (brokerage loads), Orders, BlackBuck Account (wallet), Passbook, Cash Drop, Dues, FASTag Gold (instant top-up subscription).
- Deeplinks use `boss://blackbuck/<TARGET>`; pushes share the same target keys.

## Common API integrations
- Most traffic goes through `supplywrapper` (not in the shared repos), so which service answers a given call is often unknown. FASTag calls also go directly to `/fmstoll/api/...`.

## Notes
- Server decides a lot: tabs, tiles, drawer, banners, block-sheet text, payment and fuel text, dashcam controls. A PRD cannot fix these by design alone; they need backend or config work.
- Known dead spots: the Trucks bottom-nav tab has no screen; the manifest names a `SearchTrucksActivity` class that does not exist.
- The existing screen map, states and flows are in `figma-designer/context/boss-app.md`; use it when a PRD changes an existing Boss screen.
- No backend notes exist for supply/load board, GPS, diesel or the money wallet.
