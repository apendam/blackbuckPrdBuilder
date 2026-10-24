# Sales

> Populated by Pass 1 (2026-08-27), first real evidence for this vertical (previously fully empty). Evidence mainly from `blackbuck-pro-app`'s `sales` feature module; `boss_help_desk` also touches Sales as one of its cross-segment ops workflows.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `blackbuck-pro-app` | github.com/BLACKBUCK-LABS/blackbuck-pro-app | Largest `src/feature/sales` module in the app: ASM/ASO reports and views, channel-partner management, meetings, market data, GTS portal, TSL check-in/check-out, toll-ASO on/off-duty, inventory transfer, TSL/ASO reports. Calls a dedicated `salesServiceApi` backend not yet cloned. |

`boss_help_desk` (shared platform infra, see `../system-map/README.md`) also has a `apimodel/sales` package — the helpdesk is used by ops teams handling Sales-segment workflows among others, per the PM.

## Key flows
- ASM (Area Sales Manager) / ASO (Area Sales Officer) team lists, attendance, reports
- Channel-partner management
- Field meetings — scheduling, completed-meetings map view, tab counts
- Toll-ASO on/off-duty and TSL check-in/check-out (overlaps with Toll/TZF field-agent tracking — see `toll.md`/`tzf.md`)
- Lead finding (`findLeadsList`)
- Inventory transfer, GTS portal, coupon-code/campaign management

## Cross-repo touchpoints
- `blackbuck-pro-app` → `salesServiceApi` (not yet a cloned repo — ask the PM if it has its own)
- `boss_help_desk` used by ops teams for Sales-segment support workflows (per PM, not yet traced in code)

## Core entities & jargon
- **ASM** — Area Sales Manager.
- **ASO** — Area Sales Officer.
- **TSL** — appears here too (toll-ASO on/off-duty, TSL check-in/out) — same term as in `tzf.md`, exact expansion still unconfirmed; may be a role that spans both Sales and TZF/Toll field operations.
- **GTS** — appears as "GTS portal" in the sales feature set; expansion not yet confirmed.

## Common API integrations
- `salesServiceApi` — the primary Sales backend; not yet cloned/surveyed.

## Notes
- The TSL role/term showing up in both Sales and TZF/Toll contexts (`toll-tsl-checkin`, `tzf.md`'s `tsl_repo`) suggests it may be one cross-vertical field-agent role rather than three separate concepts — worth confirming with the PM rather than documenting it three different ways across vertical files.
