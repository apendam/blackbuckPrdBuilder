# Load Board

> Populated by Pass 1 (2026-08-27), first real evidence for this vertical (previously fully empty). Boundary with Supply is unclear from code alone — see the note in `supply.md`.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | `src/feature/indent` (indent-create, bids-list, bids-detail, leads-list, outbound-list) and brokerage endpoints (`createBrokerageOrder`, `verifyAndAddTruck`, `getFoDetail`) — this is the load-matching/marketplace side of the app. |

## Key flows
- Indent creation and management (a load/freight request)
- Bid list/detail, reject-bid
- Lead list/detail (prospective loads or fleet owners)
- Brokerage order creation and truck verification/assignment
- Outbound list (loads awaiting dispatch, likely)

## Cross-repo touchpoints
- Overlaps with Supply (`supply.md`) — not cleanly separated in the code as surveyed. Treat as provisional.
- `validateBeforeCreateOrder` calls an `omsWrapper` backend not yet in the cloned repo set.

## Core entities & jargon
- **Indent** — a load/freight request (see `supply.md`, same term used there).
- **Brokerage** — third-party/marketplace load matching, distinct from Blackbuck's own fleet-owner supply.
- **FO** — Fleet Owner.

## Common API integrations
- `omsWrapper` (Order Management System) — not yet a cloned repo.
- `brokerage/*` endpoints on the shared `alchemistApi` gateway.

## Notes
- Like Supply, this vertical's real boundary needs a PM conversation before a PRD is scoped against it — the client-app feature naming doesn't cleanly map to a single backend system of record.
