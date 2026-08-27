# System Map

Cross-repo view of Blackbuck's product flows. The vertical files (`../verticals/`) cover what a PM needs inside one vertical; this file exists only for what doesn't fit inside one vertical's boundary — repo ownership across verticals, and flows that cross repo boundaries. It's small on purpose (two tables) and is loaded unconditionally in Phase 5, regardless of which verticals a PRD is scoped to.

Staleness policy: a flow file (`flows/<id>.md`) with a `last_verified` date more than 90 days old should be treated as "likely stale, re-verify before relying on it" rather than as settled fact. See `SKILL.md`'s "Cross-repo flows" section for the full policy and code-pointer format.

## Repo index

Repos the PM has confirmed access to under the `BLACKBUCK-LABS` GitHub org, as of 2026-08-27. Vertical mapping is a best-effort guess from repo naming where not yet confirmed — flagged below rather than asserted, per the "never assume" rule.

| Repo | Vertical(s) | What it is | URL |
|---|---|---|---|
| `fms_toll` | Toll | Toll backend — tag lifecycle, hotlisting, recon (per earlier PRD research) | github.com/BLACKBUCK-LABS/fms_toll |
| `toll-gold` | Toll | "Gold" — likely a premium/priority toll product tier; **unconfirmed**, name-only guess | github.com/BLACKBUCK-LABS/toll-gold |
| `tzf-activation-web-sdk` | TZF | Web SDK for TZF activation flows | github.com/BLACKBUCK-LABS/tzf-activation-web-sdk |
| `tzf-ops-portal` | TZF | Internal ops-facing portal for TZF | github.com/BLACKBUCK-LABS/tzf-ops-portal |
| `tzf-fastag` | TZF | FASTag issuance/vendor (NETC) integration | github.com/BLACKBUCK-LABS/tzf-fastag |
| `tzf-full-kyc-sdk-web` | TZF | Web SDK for full-KYC flows | github.com/BLACKBUCK-LABS/tzf-full-kyc-sdk-web |
| `TZF-portal` | TZF | Customer-facing TZF portal | github.com/BLACKBUCK-LABS/TZF-portal |
| `ppi-wallet` | TZF, Payments | PPI (Prepaid Payment Instrument) wallet — part of the TZF program per earlier PRD research; may also belong under Payments, **unconfirmed** | github.com/BLACKBUCK-LABS/ppi-wallet |
| `boss_help_desk` | *unconfirmed* | "Boss Portal" — support/helpdesk product; doesn't map cleanly to one of the 12 named verticals yet, needs PM confirmation | github.com/BLACKBUCK-LABS/boss_help_desk |
| `bb-supply-fo-android` | Android, Supply | "Boss Android App" — fleet-owner-facing Android app; name suggests it may also belong under Supply, **unconfirmed** | github.com/BLACKBUCK-LABS/bb-supply-fo-android |

Reading access to all 10 is currently blocked pending the `BLACKBUCK-LABS` org adding the Claude GitHub App under Org settings → GitHub Apps → Claude → Repository access — see conversation history. Once granted, run Pass 1 (per-repo extraction) + Pass 2 (cross-repo synthesis) per the population plan to fill in real content and resolve the "unconfirmed" flags above.

## Cross-repo flows

*(Empty — no cross-repo flow files exist yet. Populated by Pass 2 of the population plan once repo access is granted. Each row below will link to a file in `flows/`.)*

| Flow ID | Verticals | Repos | Status | Last verified | Detail |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Adding a flow

New row here + a file in `flows/<id>.md` (see `SKILL.md`'s "Cross-repo flows" section for the exact format). Keep this table to one row per flow, ~10 words max in any free-text column — this file must stay cheap enough to load unconditionally on every PRD.
