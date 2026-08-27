# TZF

> Partially populated — repo ownership known from the PM; flows/entities/APIs still TBD pending repo read access (see `../system-map/README.md` for current access status).
>
> Note: this session already analyzed two of the PM's reference PRDs, both covering the TZF FASTag/PPI-wallet program in depth (BB Pro Tag Issuance, KYC Flow, UPI-on-PPI integration, LFO Portal, and more). That analysis lives in the conversation history that produced this skill, not in this file yet — worth mining for a first draft of this vertical's flows/jargon rather than starting from scratch once repo access lands.

## Owning repos
| Repo | URL | What it is |
|---|---|---|
| `tzf-activation-web-sdk` | github.com/BLACKBUCK-LABS/tzf-activation-web-sdk | Web SDK for TZF activation flows |
| `tzf-ops-portal` | github.com/BLACKBUCK-LABS/tzf-ops-portal | Internal ops-facing portal for TZF |
| `tzf-fastag` | github.com/BLACKBUCK-LABS/tzf-fastag | FASTag issuance / NETC vendor integration |
| `tzf-full-kyc-sdk-web` | github.com/BLACKBUCK-LABS/tzf-full-kyc-sdk-web | Web SDK for full-KYC flows |
| `TZF-portal` | github.com/BLACKBUCK-LABS/TZF-portal | Customer-facing TZF portal |
| `ppi-wallet` | github.com/BLACKBUCK-LABS/ppi-wallet | PPI (Prepaid Payment Instrument) wallet — also listed under Payments, **unconfirmed** which is primary |

## Key flows
- TBD

## Cross-repo touchpoints
- TBD — check `../system-map/README.md` once cross-repo flow files exist. TZF is a likely participant in FASTag activation/issuance flows crossing into Toll and Android/BB Pro, and in wallet/payment flows crossing into Payments, based on earlier PRD research, but no flow file has been written yet.

## Core entities & jargon
- TBD (earlier PRD research surfaced many TZF-specific terms — TZF, CRO, TSL, FO, LFO, PPI, VPA, M2P, NETC, KYV among them — worth re-deriving and confirming against the actual repos rather than assuming they're still current)

## Common API integrations
- TBD

## Notes
- TBD
