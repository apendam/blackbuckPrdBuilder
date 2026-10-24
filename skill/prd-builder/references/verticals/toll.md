# Toll

> Populated by Pass 1 (2026-08-27) from local clones of `fms_toll` and `toll-gold`. Grounded in code (build files, config, package layout), not repo naming. Re-verify anything cited here past its 90-day staleness window per `../system-map/README.md`.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `fms_toll` | github.com/BLACKBUCK-LABS/fms_toll | Toll/FASTag backend monorepo, 3 Gradle modules: `toll-web` (API, context path `/fmstoll/api/`), `toll-non-web` (async/Kafka consumers), `toll-core` (shared domain logic). |
| `toll-gold` | github.com/BLACKBUCK-LABS/toll-gold | ARP (Auto-Recharge-Plus) FASTag subscription service, including the premium "Gold" plan tier. Satellite service to `fms_toll` — calls its API directly for fleet-owner/FASTag data rather than owning that data itself. |

## Key flows
- FASTag tag lifecycle: issuance, hotlisting/dehotlisting, recon
- ARP (Auto-Recharge-Plus) subscription lifecycle, incl. the premium Gold tier (`toll-gold`)
- Mandate-based recurring payment processing for auto-recharge (UPI/bank mandates via `toll-gold`)
- FASTag top-up processing (Kafka consumers)
- Vendor orchestration for FASTag issuance/recharge/OTP/wallet ops across IDFC, Axis, and LivQuick banks
- Chargeback/dispute handling and reconciliation/invoicing for FASTag transactions
- TZF KYC-status callbacks and toll sales-code lookups — see the `fastag-onboarding-and-activation` cross-repo flow

## Cross-repo touchpoints
See `../system-map/flows/fastag-onboarding-and-activation.md` for the full sequence. Summary:
- **`toll-gold` → `fms_toll`**: direct REST dependency (`app.toll.url`) for fleet-owner validation, FASTag balance/transactions, recharge init.
- **`fms_toll` ↔ `ppi-wallet`**: bidirectional — `fms_toll`'s `TzfPpiClientService` calls `ppi-wallet`; `ppi-wallet`'s `TollClientImpl` calls back into `fms_toll`'s `/fmstoll/api/kyc/...` and `/fmstoll/api/tzf/callback/kyc/status`, plus a shared Kafka event contract (CRO selfie SMS).
- **`fms_toll` ← `tzf-activation-web-sdk`, `blackbuck-pro-app`**: both call `/fmstoll/api/*` (and a separate `/supplywrapper/boss/fastag/*` path family, relationship to `/fmstoll/api` unconfirmed) as the FASTag activation/order-status client.
- **`toll-gold` → `boss_help_desk`**: `app.helpdesk.url` config — ties Toll into the shared helpdesk platform infra.
- **`fms_toll` has native TZF logic built in** (`com.zinka.toll.*.tzf` packages — `TzfKycService`, `TzfUpiAutopayService`, `FastagTzfTagStatus`, etc.). Toll and TZF are not separate initiatives despite the separate repo naming for the TZF-prefixed repos — worth keeping in mind when scoping a PRD to "just Toll."
- **`fms-inbound-payment` → `fms_toll`** (`app.toll.url`): confirmed 2026-08-30 — resolves what was previously a generic "Payments" touchpoint guess in this file. See `payments.md` for the general-purpose (non-FASTag-specific) payment rails this connects to.

## Core entities & jargon
- **FASTag** — the RFID toll tag product this whole vertical exists to issue/manage.
- **ARP** — Auto-Recharge-Plus, `toll-gold`'s subscription product; "Gold" = its premium tier.
- **Hotlisting / dehotlisting** — blocking/unblocking a tag (e.g. for fraud, non-payment).
- **CRO** — appears in both `fms_toll` and `ppi-wallet` (selfie/mobile resolution flow); likely a field-agent role code, exact expansion not yet confirmed — ask the PM.
- Vendor names in play: IDFC, Axis, LivQuick (banks); M2P Fintech (NETC network integrator, technically a TZF-side dependency but funds Toll-adjacent recharges).

## Common API integrations
- `/fmstoll/api/*` (fms_toll, toll-web) — the primary Toll API surface.
- Athena (AWS) — used for toll analytics/reconciliation queries (`athena.jdbc.url` in both `fms_toll` and `toll-gold` configs). **Note:** this JDBC URL currently has AWS credentials hardcoded in plaintext in `application-dev.yml`/`application-stress.yml` in both repos — flagged separately to the PM/security as a live issue, not a PRD concern, but relevant if a PRD touches this integration.
- IDFC / Axis / LivQuick bank vendor APIs (recharge, mandate, OTP)

## Notes
- `fms_toll` is a monorepo with three Gradle modules (`toll-core`/`toll-non-web`/`toll-web`) — a PRD scoped to "Toll" should specify which module(s) it actually touches, since they're separately built/deployed.
- `toll-gold` is tightly coupled enough to `fms_toll` that it may be worth treating as a Toll sub-component rather than an independent product line when scoping.
