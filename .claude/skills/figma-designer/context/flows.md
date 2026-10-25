# Cross-app and cross-service flows

Last verified 2026-10-15. These are the journeys that cross an app, a web surface and a backend. Each step cites the context file that holds the detail. **Status tags:** *verified* = read in code in that file; *inferred* = joined from two files without a code link between them; *unknown* = not in the shared repos. Never design an inferred or unknown hop as if it were confirmed; put it on the brief's assumptions list.

## 1. An agent buys / activates a FASTag for a fleet owner (TZF)

**Actors:** BlackBuck agent (BB Pro), fleet owner (customer), BlackBuck backend, tzf-fastag, ppi-wallet, vendor M2P.

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Agent opens drawer "Buy FASTag" (gate: flag `enable_buy_fastag`, role gate in `bb-pro-app.md` 1.4); list, "Activate new", enters the owner's mobile | BB Pro (`bb-pro-app.md` 2.1, flow 3) | verified |
| 2 | Summary (bank, bill, coupon, T&C), add vehicle, vehicle/customer/RC forms driven by status-timeline CTAs | BB Pro | verified; form fields are server-driven, not in repo |
| 3 | OTP consent (6 digits), "VERIFY & PLACE REQUEST" | BB Pro; backend `POST /otp/generate`, `/otp/validate` | verified on backend; app-to-service mapping unknown (`domain-tzf-ppi.md` 0) |
| 4 | Customer pays in own BlackBuck account, then activation | BB Pro flow 3 | the customer-side screen (Boss?) is **unknown** |
| 5 | Submit issuance, async: status ACTIVATION_IN_PROGRESS, client polls `/issuance/tag/status` | tzf-fastag (`domain-tzf-ppi.md` 3) | verified |
| 6 | ACTIVATED, then KYV due in 3 days (5 documents) else the tag is hotlisted | tzf-fastag | verified |
| 7 | KYC upgrade (optional) raises wallet cap | ppi-wallet; web KYC SDK (flow 2) | verified |

**States to design (from the stall table in `domain-tzf-ppi.md` 3):** validation rejection with error code, activation pending (up to ~10 min), activation failed with vendor message (a new request with the same tag id is allowed; there is no explicit retry state), tag active but wallet empty, KYV deadline missed (tag blocked, reason "KYV not completed").
**Web variant:** the same journey exists as a mobile web port (`tzf-activation-web-sdk`, `web-and-ops-surfaces.md` 2.2), launched with `?token&salesCode&userId`. Do not mix its steps into the native BB Pro flow without checking which one the PRD means.

## 2. TZF full KYC (agent-assisted, biometric)

1. From the activation order-status screen, a KYC banner (START_KYC / RESTART_KYC) opens the KYC overlay. *verified*
2. The overlay is `tzf-full-kyc-sdk-web` in an iframe: agent verification (`/`), customer OTP consent (`/otp`), reviewer step (`/tsl-review`). Roles: customer, agent (TSL/CRO), TSL reviewer. *verified* (`web-and-ops-surfaces.md` 2.3)
3. Reviewer reject sends the agent a notification to re-upload; the agent lands back on the agent page. *verified*
4. **Completion hand-back is probably broken (likely bug, not tested at runtime).** The KYC SDK reports completion only through `window.ReactNativeWebView.postMessage`; the activation app listens for iframe `message` events (`CLOSE`, `FAILURE`, `SUCCESS`, `ON_BACK_PRESSED`). So after OTP success the overlay may not close, no status-update call fires and no toast appears. **Do not draw an automatic "KYC complete, returning to order" transition for this hop.** (`web-and-ops-surfaces.md` 3.1)
5. In the native BB Pro app the toll-KYC flow has vendor branches: IDFC (biometric via an RD service app: prerequisites, OTP, Aadhaar, fingerprint, "Validating with Partner Bank"), TZF (web KYC above), LIVQ (SDK). *verified* (`bb-pro-app.md` flow 7)
6. Also verified: `sales_code` vs `salesCode` are used inconsistently in the activation SDK, so a host sending only `salesCode` can reach the leads screen with an empty value (`web-and-ops-surfaces.md` 3.2).

## 3. A fleet owner recharges a FASTag and sets up Gold auto-recharge (Boss)

1. Recharge: FASTag card, amount (KYC limit exceeded: block sheet, then KYC), checkout (wallet plus online), payment, status. If the wallet is short: add money. If dues exist: "Dues & Recoveries". *verified* (`boss-app.md` F6)
2. Auto Recharge toggle, success dialog, Gold activation (server-driven terms, "Accept via OTP", wallet top-up). On failure the owner lands on a status screen, reached via push. *verified*
3. Backend states and exact copy for the plan, subscription, mandate, dues and hotlist come from `domain-toll-gold.md`: 10-day suspension window, top-up cap of 8, recharge caps (₹10,000; Axis ₹20,000). **Vendors differ (IDFC, AXIS, LIVQ, TZF); never assume parity** (`domain-toll-gold.md` 5.2).
4. **Which service answers Gold calls is unknown.** Boss reaches Gold through the `supplywrapper` BFF, and its source is not available.
5. Fees and GST are config-driven, so a fee breakdown on screen must be a server field, not a designed constant. The TZF and PPI code has no GST logic at all.
6. Ledger, transaction, "Request Chargeback" (limit 3), proof upload: states in `domain-toll-gold.md` 3.13 and 4.7.

## 4. Why a tag stops working (any app that shows tag status)

Tag standing follows a fixed priority: **BLACKLIST > HOTLISTED > E_NOTICE > LOW_BALANCE > CLOSED > ACTIVE** (`domain-tzf-ppi.md` 4.3). A tag can be blocked by the owner's toggle (OFF = hotlist; ON = dehotlist, with SUCCESS / FAILURE / BLOCKED outcomes and literal messages in `domain-tzf-ppi.md` 5.1), by missed KYV, by low balance, or by an e-notice. Vehicle class VC4 (car/jeep) is KYV-exempt and never LOW_BALANCE. Any screen that shows a tag must show the reason for a non-active state, not just a red badge.

## 5. Support

- **Boss:** Help, category or articles, article, Good/Bad, negative feedback opens a server action (call, raise ticket 15-500 chars with attachments, or deeplink), ticket chat, resolved: rating within 48h and "Re-Open Ticket" (maximum 5). The backend `boss_help_desk` collapses six Freshdesk states into OPEN/CLOSED; categories and article HTML live in Freshdesk, not in the repo. Pushes: created, agent replied, action required, delay, resolved. *verified* (`boss-app.md` F12, `web-and-ops-surfaces.md` 5)
- **BB Pro:** drawer "Raise a ticket" opens the GTS portal (a different system). *verified route; portal screens not in repo*
- **TZF customers on web:** `tzf-customer-portal` has its own grievance tab; unrelated to the above.

## 6. GPS purchase to installation

- Boss: GPS tile, plans, vehicles, checkout, payment, confirmation, **installation appointment**; repair tickets can be rescheduled or cancelled (`boss-app.md` F8).
- BB Pro: GPS tickets, **install job** (Accept or Reject with reason, then a guided flow: IMEI, connectivity, power, location, relay, photos, "Device Activated Successfully") (`bb-pro-app.md` flow 13).
- *Inferred:* the Boss appointment becomes a BB Pro ticket. There is no GPS backend in the shared repos, so confirm ticket states and what the owner sees with the PRD author.

## 7. Notifications and deeplinks

- **Boss:** one router (`DeepLinkUtils`, ~120 targets); push and links share TARGET/DATA keys. When several targets compete, priority applies (`boss-app.md` 1.6): spam caller-ID block, platform block, add-money redirect, Orders, Find Loads, SuperLoads, generic router. Block flags (`FMS_BLOCK_*`) turn a tile or deeplink into a block sheet.
- **BB Pro:** push payload `deeplink {screen, screen_data, action, action_data}`. Every notification-reachable screen must render from its params alone (no back stack). *verified* (`bb-pro-app.md` 1.1)
- **TZF:** SMS only (swipe, recharge, chargeback, closure, KYC, OTP, balance). No push or WhatsApp in the TZF/PPI repos (`domain-tzf-ppi.md` 8).

## 8. How to use this file

For any PRD that crosses surfaces, list in the design brief: (a) which hops are *verified*, (b) which are *inferred* or *unknown*, and (c) which screens on the far side of each hop you are **not** designing. Ask the PRD author about the unknown hops before drawing them.
