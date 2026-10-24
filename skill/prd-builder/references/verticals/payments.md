# Payments

> Updated 2026-08-30: the PM added `fms-inbound-payment` and `fms-outbound-payment-service`, which resolves this vertical's biggest gap — it previously had no dedicated repo at all. These two are the general-purpose Blackbuck-wide payment rails (multi-tenant, not FASTag-specific); `ppi-wallet` remains the separate FASTag-wallet-specific rail shared with TZF.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `fms-inbound-payment` | github.com/BLACKBUCK-LABS/fms-inbound-payment | Spring app `fmsinboundpayments`, context path `/inbound-payments/api`. Blackbuck-wide **inbound** money collection: cards (Cybersource, MIGS, PayU, Razorpay, Pay10), UPI/Juspay (incl. autopay/mandates), net banking, bank transfer, instant credit, refunds, reconciliation, settlement. Multi-tenant (`InboundTenantDetails`, `RoutingConfiguration`) — routes to a payment gateway per tenant, so it isn't owned by one product alone. |
| `fms-outbound-payment-service` | github.com/BLACKBUCK-LABS/fms-outbound-payment-service | Spring app `fmsoutboundpayments`, context path `/outbound-payments/api`. Blackbuck-wide **outbound** disbursement: IDFC nodal-account fund transfers (IFT/IMPS), statement processing, refunds. Also multi-tenant (`TenantController`). Config is pulled from a central Spring Cloud Config server (`fms-ccs.alb.jinka.in`) not in this repo set. |
| `ppi-wallet` | github.com/BLACKBUCK-LABS/ppi-wallet | Confirmed here **and** under TZF (both, not either/or) — the FASTag-specific wallet rail. See `tzf.md` for the fuller picture. |

These three don't appear to overlap in code — `ppi-wallet` funds FASTag balances specifically (via its own M2P/UPI integration); `fms-inbound-payment`/`fms-outbound-payment-service` are the shared, tenant-routed rails other products (confirmed: `fms_toll`) call for general payment collection and payout. Worth confirming with the PM whether any product uses both paths for different parts of one flow.

## Key flows
**Inbound (`fms-inbound-payment`):**
- Card payments via multiple gateways (Cybersource, MIGS, PayU, Razorpay, Pay10) — routed per-tenant
- UPI payments and autopay/mandates via Juspay (web mandate setup, mandate execution, refunds)
- Net banking, bank transfer, cash drop
- Instant credit, service charges, recharges
- Reconciliation and settlement processing (cron-driven, per `crons` package)

**Outbound (`fms-outbound-payment-service`):**
- IDFC nodal-account fund transfers — two API generations (V1/V2), plus IFT (Immediate Fund Transfer) and IMPS-specific status-check variants
- Refunds (the payout side, distinct from `fms-inbound-payment`'s refund initiation)
- Bank statement retrieval/processing
- Status/health checks against the nodal bank integration (`CCSCheckController` — CCS likely = the Spring Cloud Config service `fms-ccs`, unconfirmed)

## Cross-repo touchpoints
- **`fms-inbound-payment` → `fms_toll`** (`app.toll.url` → `http://fms-toll/fmstoll/api`) — confirmed direct dependency.
- **`fms-inbound-payment` → `fms-outbound-payment-service`** (`app.payments-outbound.url`) — inbound calls outbound directly, likely for refund payouts. No reverse reference found (outbound doesn't call back into inbound in code surveyed).
- **`ppi-wallet` → `tzf-fastag`, `fms_toll`** — see `tzf.md`; this is the separate FASTag-specific rail, not connected to the two repos above in any evidence found so far.
- Toll-gold's config (see `toll.md`) also referenced generic "inbound/outbound payment services" as a secondary touchpoint before these repos were identified by name — that's this pair.

## Core entities & jargon
- **Nodal account** — a bank account structure (here, with IDFC) used to hold and disburse customer funds in a regulated pass-through capacity — standard term for this kind of payment aggregator/marketplace fund flow.
- **IFT** — Immediate Fund Transfer (a transfer type/status-check variant in the outbound service).
- **Tenant** — a routing concept in both inbound and outbound services; which Blackbuck product/business line a given payment belongs to, used to select the right gateway/nodal config. Exact tenant list not yet enumerated.
- **CCS** — appears as `fms-ccs`, a Spring Cloud Config server hostname, and as a controller name (`CCSCheckController`) in the outbound service — likely "Central Config Service" or similar, unconfirmed.

## Common API integrations
- Cybersource, MIGS, PayU, Razorpay, Pay10 — card payment gateways (inbound)
- Juspay — UPI payments and autopay/mandate management (inbound)
- IDFC — nodal-account bank integration for outbound fund transfers
- Kotak, M2P Fintech, Setu — FASTag-specific rails via `ppi-wallet` (see `tzf.md`)

## Notes
- **Security (two separate findings, both worth security/infra attention)**:
  1. `ppi-wallet`'s **production** config has two full AWS access-key + secret-key pairs hardcoded in plaintext (one guarding a KYC-document bucket). See `tzf.md` for detail.
  2. `fms-outbound-payment-service` has **production and UAT keystores/certificates committed directly in source** (`src/main/resources/bb_prod_combined.p12`, `idfc_nodal.jks`, `uat_key_store.p12`) — used for IDFC nodal-account fund-transfer signing, with git history showing active rotation over time ("updated certificate", "Added new certificates"). No keystore passphrase was found hardcoded alongside them in this repo (it's likely pulled from the `fms-ccs` config server, which wasn't in scope for this survey), but committing the keystore files themselves to git is worth a security review regardless — this is bank-transfer signing material for real money movement, not a dev convenience credential.
- `fms-inbound-payment`'s multi-tenant design (routing by tenant to different gateways) suggests it's genuinely shared infrastructure across multiple Blackbuck products, similar in spirit to `boss_help_desk` — a PRD scoped to "Payments" should clarify which tenant/product it's actually touching rather than assuming vertical-wide changes are safe.
