# Supply

> Populated by Pass 1 (2026-08-27). No dedicated Supply-only repo among the 11 — evidence comes from feature modules inside two multi-vertical apps.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `bb-supply-fo-android` | github.com/BLACKBUCK-LABS/bb-supply-fo-android | Confirmed, not just name-based (see `android.md`) — has a dedicated `fleet/supply/bookload` module. Also spans Android and GPS. |
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | Its `src/feature/indent` module (indent creation, bids, leads, order create) and brokerage endpoints (`createBrokerageOrder`, `verifyAndAddTruck`) are Supply/Load-Board-adjacent — see `bb-pro.md` and `load-board.md`. The indent/brokerage split between Supply and Load Board isn't fully clear from code alone; ask the PM. |

## Key flows
- Load booking (`bb-supply-fo-android`'s `bookload` module) — fleet-owner side
- Indent creation, bid management, lead handling (`blackbuck-pro-app`'s `indent` module) — agent/sales side
- Brokerage order creation and truck verification (`blackbuck-pro-app`)

## Cross-repo touchpoints
- Overlaps with Load Board (`load-board.md`) — the indent/bid/brokerage flows in `blackbuck-pro-app` sit right at the Supply/Load-Board boundary and haven't been cleanly separated in this pass; treat both files as provisional until a PM clarifies where the line is.
- `bb-supply-fo-android` shares the `/supplywrapper/boss/*` path family with `blackbuck-pro-app` — see `system-map/README.md`'s "Boss" naming note.

## Core entities & jargon
- **Indent** — a supply/load request (per `blackbuck-pro-app`'s `feature/indent` module: indent-create, indent-detail, indent-list).
- **FO** — Fleet Owner.

## Common API integrations
- `omsWrapper` (Order Management System) — referenced by `blackbuck-pro-app`'s order-validation flow; not yet a cloned repo, ask PM if it has its own.
- `/supplywrapper/*` — shared gateway path family, see `system-map/README.md`.

## Notes
- This vertical's boundary with Load Board is genuinely fuzzy in the code as surveyed — worth resolving with the PM before writing a PRD that touches either, so scope doesn't silently straddle both without anyone noticing.
