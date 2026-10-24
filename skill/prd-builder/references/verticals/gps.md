# GPS

> Populated by Pass 1 (2026-08-27), first real evidence for this vertical (previously fully empty). No dedicated GPS backend/repo found among the 11 — GPS shows up only as a feature module inside two multi-vertical apps, so treat this file as thinner than TZF/Toll.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `bb-supply-fo-android` | github.com/BLACKBUCK-LABS/bb-supply-fo-android | Has a dedicated `feature/gps` module (fleet-owner-facing). |
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | Has `feature/gps-orders`, `feature/gps-tickets`, `feature/gps-coupon-codes` modules (agent-facing — GPS device order creation, install/repair ticketing, promo codes). |

No standalone "GPS backend" repo was found or given — both entries above are client apps with a GPS feature slice, not a GPS system of record. Ask the PM whether GPS has its own backend repo not yet in this list.

## Key flows
- GPS device/order creation and status tracking (`blackbuck-pro-app`'s `gps-orders`)
- GPS installation/repair ticketing, incl. "fuel-sensor-repair" tickets (`blackbuck-pro-app`'s `gps-tickets`) — note fuel-sensor hardware appears to be bundled under the GPS ticketing flow rather than tracked separately under Fuel
- GPS coupon code creation/review with vehicle validation (`blackbuck-pro-app`'s `gps-coupon-codes`)
- Fleet-owner-side GPS features in `bb-supply-fo-android`'s `feature/gps` — not yet broken down further

## Cross-repo touchpoints
- Not yet mapped — this pass only confirmed the modules exist, not what backend(s) they call.

## Core entities & jargon
- TBD — not yet mined at this depth.

## Common API integrations
- TBD — not yet mined at this depth.

## Notes
- This is the thinnest of the newly-populated verticals. Before writing a PRD scoped to GPS, plan on a conversational walkthrough with the PM per `SKILL.md`'s guidance for placeholder verticals — the module-existence evidence here isn't enough to draft flows or API contracts from.
