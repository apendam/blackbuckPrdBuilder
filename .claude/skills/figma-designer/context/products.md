# Products and how they fit together

Last verified 2026-10-15. Derived from the app and backend context files in this folder; where a link between two products is inferred rather than read in code, it says so. Read this first, then load the file for the app or service you need.

## 1. The two apps in one table

| | **Boss** (`boss-app.md`) | **BB Pro** (`bb-pro-app.md`) |
|---|---|---|
| Who uses it | Truck **fleet owners** (customers). One role, fleet owner. | BlackBuck **employees and partners**: field sales (ASO/CRO, TSL, ASM, ZSH/RSH/NH), channel partners (CP, KAM), toll/supply/demand teams, field sales loans and collections, brokerage, GPS installers, credit |
| Stack | Native Android (Kotlin/Java). Legacy XML + newer Jetpack Compose (MVI) | React Native / Expo, React Navigation. v1 plus a small v2 for the new CP sales force |
| Package / name | `com.zinka.fleet`; README calls it "BlackBuck app (formerly BOSS)" | `bb-pro` (BlackBuck Pro) |
| Languages | English, Hindi, Kannada, Telugu, Tamil (leave ~30% text-expansion room) | English only (iOS behaviour unverified) |
| Navigation | Bottom tabs (server-driven set), hamburger drawer (server-driven), Activities with their own fragment stacks, string deeplink router (`boss://blackbuck/<TARGET>`) | Per-persona bottom tabs, role-gated side drawer, stack navigator, push-payload deeplinks (no URL linking) |
| Roles shape the UI? | No. Server flags, blocks and whitelists shape it | Yes, heavily: many `user_type` values pick first route, tabs and drawer items (see `bb-pro-app.md` 1.2) |
| Server-driven UI | Tabs, home tiles, drawer, banners, block sheets, payment/fuel/dashcam text | Dynamic forms and 11 action types (`dynamic-screen`), tab counts/labels, loan/timeline steps |
| Main jobs | FASTag, GPS and AI dashcam, diesel/fuel card, money (wallet, passbook, dues), load board (find, bid, book, order, payout), KYC, help desk, calls | Sell and activate FASTags for customers, FASTag/biometric inventory, installation evidence, toll KYC, incentives and sale history, loans, collections, brokerage indents and orders, GPS install jobs, CP onboarding, meetings |
| Look and tokens | See `design-system.md` (they differ) | See `design-system.md` |

**Never assume parity.** Same brand, different apps: different tokens, components, navigation and permission models. Use the equivalence table in `design-system.md`.

## 2. Where the apps touch each other (shared domains)

Both apps work on **FASTag**, and loosely on **GPS** and **KYC**, from opposite sides of the same customer.

| Domain | Boss (fleet owner) | BB Pro (BlackBuck agent / partner) | Link status |
|---|---|---|---|
| FASTag purchase and activation | Buy: landing, plans, checkout, payment, vehicle and personal details, order status, appointment | "Buy FASTag" (drawer): agent activates a tag for a customer, customer pays from their own BlackBuck account, OTP consent | Same product, two actors. Whether Boss shows a request raised by an agent is **unverified** |
| FASTag replacement / bank change | Not found as a flow in Boss notes | Replace FASTag / change bank (agent) | BB Pro only |
| FASTag recharge, balance, ledger, chargeback | Yes (recharge, auto-recharge Gold, ledger, chargeback) | No | Boss only |
| FASTag inventory | No | Yes: add/scan tags, mark lost; biometric devices | BB Pro only |
| FASTag installation | Order status + appointment | "FT Installation": photo evidence by agent | Handoff inferred |
| Toll KYC | Truck and owner KYC (instant/DigiLocker/documents); toll KYC for FASTag limits | Toll KYC (IDFC biometric; TZF web KYC; LIVQ SDK) | Same concept, different tooling |
| GPS | Buy, renewal, tracking, repair tickets, installation appointment, AI dashcam | GPS tickets, orders, coupons; install job flow for installers | Handoff inferred |
| Support | Help desk: categories, articles, tickets (Freshdesk via `boss-portal`) | "Raise a ticket" opens a GTS portal | Different systems |

## 3. Backend and web map

The apps are thin over a BlackBuck backend. What we have source for:

| Source | What it is | Used by | Context file |
|---|---|---|---|
| `fms_toll` (toll) | FASTag orders, recharge, balance, transactions, chargebacks, KYC cards, vendor differences (IDFC, AXIS, LIVQ, TZF), TZF UPI autopay | Boss (direct `/fmstoll/api/...` and via a BFF) | `domain-toll-gold.md` |
| `toll-gold` (gold) | FASTag Gold / ARP v2 (subscription, instant top-ups, suspension, dues) | Boss, via the `supplywrapper` BFF | `domain-toll-gold.md` |
| `tzf-fastag` | TZF FASTag issuance, tag status and toggle, KYV, mandates, SMS | Called by the BlackBuck backend, not by the apps directly | `domain-tzf-ppi.md` |
| `ppi-wallet` | Prepaid wallet, KYC levels (MIN/MAX), UPI, BBPS, mandates, Paper KYC | Called by the BlackBuck backend, not by the apps directly | `domain-tzf-ppi.md` |
| `boss_help_desk` | Freshdesk wrapper for Boss help desk | Boss | `web-and-ops-surfaces.md` |
| `tzf-activation-web-sdk`, `tzf-full-kyc-sdk-web` | Mobile web: agent-assisted FASTag activation; biometric full KYC | Host webview / link; KYC SDK embedded in activation SDK | `web-and-ops-surfaces.md` |
| `tzf-customer-portal`, `tzf-ops-portal` | Desktop customer site; internal ops portal | Customers; ops staff (not embedded in apps) | `web-and-ops-surfaces.md` |

## 4. What we do NOT have backend context for

A PRD that touches these has **no backend states or rules in this folder**, so the agent must ask or mark assumptions:
- **Supply / load board** (Find Loads, bids, bookings, orders, bank payouts), the largest area of Boss.
- **GPS and AI dashcam backend**, **diesel/fuel card**, **money/wallet/passbook** (the Boss "BlackBuck Account" wallet), **loans, collections, brokerage, incentives, meetings** (BB Pro).
- **`supplywrapper`**: the BFF Boss uses for much of its API traffic. Its source is not in the shared repos, so which service (toll or gold) answers a given Gold call is unknown.
- **`com.blackbuck:common-sdk`** (Boss shared UI library): not in the checkout, so some Boss tokens/components are unverified.
- Screen-to-endpoint mappings for TZF/PPI (the apps do not call those services directly).

## 5. Vocabulary quick reference

FO = fleet owner. ASO/CRO = field-sales executive (labelled "CRO" in some UI, "KAM" for CP_ASO). TSL = team sales lead; ASM = area sales manager. CP = channel partner. FASTag = NETC electronic toll tag. Vendors/issuers: IDFC, AXIS, LIVQ, TZF (TZF issues via enabler M2P). Gold / ARP v2 = FASTag subscription with instant top-ups (legacy: ZBPP/ARP). KYV = know-your-vehicle (documents/photos); KYC = identity. More terms in each domain file's glossary.
