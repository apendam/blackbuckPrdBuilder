# Domain: FASTag (toll) and FASTag Gold (gold) for BlackBuck Boss and BB Pro

## 0. Header and reading guide

- Sources: repo `toll` @ 79d2ca0 (module `fms_toll`: toll-core, toll-web, toll-non-web) and repo `gold` @ 5228007 (`toll-gold`, Spring Boot). App-side endpoint check: repos `boss` (Android) and `bb-pro` (React Native).
- Last verified 2026-10-15.
- Paths are repo-relative and prefixed with the repo name, e.g. `gold:src/main/java/.../SubscriptionConstant.java`.
- Raw survey this file is distilled from: `context/_raw/backend-toll-gold.md`. Spot-checked in code: Gold block threshold (10 days), top-up cap default 8, INR 10,000 monthly recharge cap, Axis 20,000 cap, chargeback request limit 3, TZF KYC caps (10,000 / 200,000 defaults), Boss endpoint paths. Everything else is from the survey; items marked "(unverified)" were not re-checked.
- Strings: many user-facing strings are localized through the supply-wrapper translation service (keys in code, English text NOT in these repos). Where this file gives exact copy it is hard-coded English in code. Where it says "key only", copy is unknown: do not invent it, use a placeholder.
- Fees, prices, GST, convenience fee, platform deposit, per-bank tag price are config/DB-driven and are NOT in code. Mock them as clearly illustrative values.
- Who uses what: **Boss** (fleet-owner app) uses nearly all of this. **BB Pro** (sales/field-agent app) only touches FASTag issuance/activation/KYC/replacement flows (sec 2.1), not Gold, recharge or chargebacks.
- Do not design screens for: `portal/*`, `blackbuck-portal/*`, `admin/*`, `adminV2/*`, `techsupport/*`, `test/*`, `cms/*`, `operations/*`, `backfill/*`, `pushToKafka/*`, `/whitelist/*`, `/invoice-reconciliation/*`, `/cp/*` (partner API). These are ops/partner surfaces.

## 1. Glossary

| Term | Meaning |
|---|---|
| FASTag | NPCI electronic toll tag stuck on a vehicle windscreen; balance is debited at toll plazas. |
| FO | Fleet owner, the Boss app user. |
| BOSS wallet | FO's BlackBuck wallet; source of recharges, fees, dues. |
| Vendor / bank | Issuer of the tag: **IDFC** (per-tag balance, INR 99 min auto-recharge), **AXIS** (wallet-based, not per-tag), **LIVQ** (LivQuik, entity wallet), **TZF** (prepaid PPI wallet via TZF + M2P; acronym expansion not stated in code). Enum `Fastag.FasTagVendor {IDFC, AXIS, LIVQ, TZF}` (`toll:toll-core/.../entities/fastag/Fastag.java`). |
| Gold / FASTag Gold | Paid or trial subscription. Tag gets instant "top-ups" (credit lent when balance goes negative) so trucks are not stuck at plazas. Internally "ARP v2". |
| ARP | Auto Recharge Plus. v1 = legacy (code also says ZBPP, "zbpp"); v2 = Gold. `ARP_PLAN_V1 = 1`, `ARP_PLAN_V2 = 2` (`gold:.../subscription/constants/SubscriptionConstant.java`). UI strings, enums and code use ZBPP / ARP / Gold interchangeably. |
| Top-up ("swipe") | One lent credit when a toll swipe leaves the tag negative. Counted as `top_up_used / total_top_up`. Each creates a due the FO must repay. |
| Dues | (a) top-up/swipe dues (money lent) and (b) subscription fee. Together `pending_dues`. |
| Hotlist / blacklist | Tag blocked at plazas (NPCI blacklist). Gold hotlists tags when top-ups are exhausted, plan suspended, mandate revoked etc.; dehotlisted when dues are cleared. |
| Mandate / Autopay | UPI recurring mandate. Gold needs one (RMM = Recurring Mandate Management service). TZF has its own "UPI Autopay" auto-recharge mandate (separate feature). |
| Priority Plus | Separate paid add-on with its own autopay mandate. |
| Trial | FREE-type Gold plan; FO pays only a small refundable mandate-setup fee. |
| Tag-to-pool debit | Subscription fee debited from an IDFC tag balance into a pool (VENDOR_API recovery). |
| KYC / KYV | KYC = FO identity (limits recharge). KYV = vehicle verification (RC / truck images). |
| Chargeback | Dispute for a wrong toll deduction; QDR = 2-day window, NON_QDR = 30-day window. |
| CP | Channel partner ordering tags through partner API (not an app surface). |
| FOS | Field sales agent order ("Order Confirmed" label variant). |
| supply-wrapper | BFF between apps and toll/gold; owns translations and checkout orchestration. NOT in the provided repos. |
| Server-driven UI | Server returns CTA enum, text, colors, bottom-sheet spec; client renders. Heavily used (sec 6). |

## 2. Product areas in user terms

### 2.1 Order / issue a FASTag (Boss, BB Pro)
Buy a tag for a truck/car/bus/LCV from a bank; add vehicle; personal details + KYC (per-vendor form); pay fees from BOSS wallet; schedule appointment (field agent) or ship; tag activated; first recharge. Also replacement (incl. cross-bank), cancellation, removal/closure. BB Pro (agents) calls: barcode search/assign/OTP (sales service), `fmstoll/api/fastag-order/v2/initiate`, `fmstoll/api/tzf/fastag/otp/*`, `fmstoll/api/sales/fastag/request/orders`, `supplywrapper/boss/fastag/*` (order details, replacement, cheque upload, cancel), TZF KYC generate/status (`bb-pro:src/network/endpoints.js`).
Vehicle types: TRUCK, CAR_JEEP_VAN, GOODS_CARRIER_LCV, CAR, BUS, NCV. Source: BB_PRO | BLACKBUCK | CP. Issuance types: REGULAR, EXISTING_IDFC_NON_BB, RETAIL; subtypes REGULAR, RE_ISSUANCE, BUYER_SELLER, CORPORATE, RETAIL.

### 2.2 FASTag home / balance / tags (Boss)
Server-driven landing config, tag list with balance per tag (hotlisted tag shown with negative-balance colour + banner), vendor-wise lists, "Add a new FASTag (any bank)" via BBPS (A/B gated), recent-credited-chargeback sheet, Priority Plus card.

### 2.3 Recharge (Boss)
Manual recharge from BOSS wallet, scheduled auto-recharge (threshold toggle), TZF UPI Autopay mandate, third-party (outside-app) recharge notifications. Limits by KYC (sec 5).

### 2.4 Transactions / passbook (Boss)
Swipe + credit/debit ledger per tag/wallet, filters, statement download, per-transaction chargeback entry.

### 2.5 Chargebacks and refunds (Boss)
Raise chargeback for a swipe or debit adjustment; history; auto-detected chargebacks; double-toll refund claim; replacement old-tag balance refund by cheque; tag-removal refund.

### 2.6 FASTag Gold subscription (Boss)
Plan list, trial/paid, checkout with mandate, activation, status/overdue/suspended banners, pay dues, deactivation request, top-up usage meter.

### 2.7 KYC / KYV
Boss KYC card per vendor (IDFC bank KYC, LivQuik biometric/video, TZF full KYC), OTP flows, vehicle RC/KYV upload, truck claim.

### 2.8 Priority Plus
Paid add-on activation with mandate, re-activation, revoked-mandate banner.

### 2.9 Tag removal
Config, warnings, dues check, cancelled-cheque upload.

## 3. State machines

Format: values | meaning to user | transitions | trigger.

### 3.1 Gold: API-facing plan status (`gold:.../subscription/enums/ZbppPlanStatusResponse.java`)
| Value | Meaning shown | Transition | Trigger |
|---|---|---|---|
| NOT_SUBSCRIBED | No plan | -> ACTIVATION_PENDING / ACTIVATED | mandate initiated / activate |
| ACTIVATION_PENDING | Mandate INITIATED, waiting | -> ACTIVATED / back | mandate event CONFIRMED / REJECTED |
| ACTIVATED | Gold on | -> SUSPENDED / DEACTIVATION_REQUESTED | fee unpaid >10 days / open deactivation request |
| SUSPENDED | Tags hotlisted, fee late | -> ACTIVATED | fee fully paid (`processAfterFullPayment`) |
| DEACTIVATION_REQUESTED | Request open | -> DEACTIVATED | ops approves |
| DEACTIVATED | Off (re-subscribe creates a NEW plan row) | | |

Underlying columns on `AutoRechargePlusSubscriptionPlan`: consentStatus {ACTIVATED, DEACTIVATED, OVERDUE (enum exists, not written)}; activationStatus {ACTIVE, OVERDUE, SUSPENDED, INACTIVE} (TRIAL starts ACTIVE, PAID starts OVERDUE until fee is recovered); activationType {TRIAL, PAID}.

### 3.2 Gold details response `ArpDetailsDto`
- `status`: "Active" (an ACTIVATED consent row exists) / "Inactive" (+ `deactivation_date`).
- `derived_status`: "OVERDUE" (fee unpaid <10 days since charge fromDate; `fee_clear_date` = epoch ms deadline = fromDate + 10 days) / "SUSPENDED" (>=10 days) / else consent status.
- Suspend detail: NOT_SUSPENDED | SUSPENSION_ALERT (copy: "Pay Rs.<due> before dd MMM", rupee symbol in code) | SUSPENDED (copy: "Due to delay in subscription fee payment.").
- If app asks arp_version=2 but FO's active plan is v1 -> only status "Inactive".

### 3.3 Subscription fee charge `recoveryStatus`
REQUESTED -> RAISED (RMM recovery id attached) -> COMPLETED (recovery amount reaches 0). Partial payment lowers `recoveryAmount`. Source: VENDOR_API (tag-to-pool), RECOVERY (RMM), ARP_RECOVERY_BACKUP. User-invisible except via `pending_subscription_fee`.

### 3.4 Mandate `TollMandate.Status` (Gold)
INITIATED -> CONFIRMED | REJECTED; CONFIRMED -> REVOKED | EXPIRED | PAUSED | SOFT_PAUSED | DELETED. Trigger: Kafka e-mandate status events. Duplicate guard: a second CONFIRMED mandate for a Gold-eligible FO is auto-REJECTED, remark "Duplicate Mandate", wallet hold released.
App-visible mandate status (`toll_mandate_details_v1.mandate_status`): ACTIVE (a CONFIRMED mandate with amount >= plan mandateMaxAmount) | PENDING (INITIATED) | FAILED (REJECTED) | INACTIVE (revoked/deleted/expired/paused/soft-paused or amount too small) | null (none). For `ArpPaymentOrderStatus`: CONFIRMED->ACTIVE, INITIATED->PENDING, other->INACTIVE.

### 3.5 Gold payment order `ARPPaymentOrders.Status` + refund
INITIATED -> COMPLETED (payment success event, or wallet hold released with mandate confirmed) | FAILED (payment failure or mandate rejected). Mandate-setup fee refund: REFUND_INITIATED -> REFUND_SUCCESS | REFUND_FAILED; wallet statement labels "Fastag Gold Subscription Fee Refund" / "ARP Subscription Fee Refund".
`/zbpp/order/status`: for source ARP_DUES, `status` = order-derived (COMPLETED->ACTIVE, FAILED->INACTIVE, else PENDING); for other sources `status` = mandate-derived. `mandate_status` returned separately. Apps poll this after returning from UPI app.

### 3.6 Top-up dues
PENDING -> CLEARED when FO recharges tag (FREE_UP event); partial clear reduces `pendingDue`; each fully cleared txn decrements `top_up_used` by 1.

### 3.7 Deactivation request
REQUESTED -> DEACTIVATED | REJECTED. **Created in toll** (`POST /zbpp/deactivateRequest`, `POST /v2/zbpp/deactivate` ops); gold only reads it. A plan with open request is skipped by next-cycle charge generation.

### 3.8 FASTag order `FastagRequest.FastagStatus` (`toll:.../entities/fastag/FastagRequest.java`)
| Value | User-facing label | Notes |
|---|---|---|
| CREATED | "Order Confirmation Pending" | paid/placed but vehicle or details missing |
| CONFIRMED | "Schedule Appointment" (FOS: "Order Confirmed"); with appointment key "Appointment Scheduled" / "Agent Assigned" | |
| ON_HOLD | "Order On Hold" | |
| REQUESTED, APPROVED | "FASTag Activation Inprogress" | sent to bank / bank approved |
| ACTIVATED, FIRST_RECHARGE_DONE | "FASTag Activated" | |
| DELIVERED | "Item Delivered" | |
| REJECTED, REMOVED, TERMINATED | "Order Cancelled" | REJECTED carries `rejection_reason` text |
Happy path: CREATED -> CONFIRMED -> REQUESTED -> APPROVED -> ACTIVATED -> FIRST_RECHARGE_DONE. Groups (`toll:.../BusinessUtils.java`): ongoing tab = {CREATED, ON_HOLD, CONFIRMED, APPROVED, REQUESTED}; completed tab = {DELIVERED, ACTIVATED, FIRST_RECHARGE_DONE, REJECTED, REMOVED, TERMINATED}; cancellation allowed only from {CONFIRMED, CREATED, REQUESTED}. Other enum values (TRUCK_*, ADDRESS_*, CLAIM_*, REMOVAL_*, FASTAG_*) are legacy, do not design for them. Other label keys: "Payment Done", "Order Created", "Order Approved", "Payment Pending", "Consent Pending". Timeline colour: completed GREEN, default RED.

### 3.9 Supporting verification enums
- `TruckVerificationStatus` {PENDING, VERIFIED, REJECTED}; RC status strings APPROVED / PENDING / REJECTED / INVALID / NOT_SUBMITTED.
- `KYVStatus` {IN_PROGRESS, COMPLETED, REJECTED}; tag KYV document status NOT_UPLOADED, VERIFIED, PENDING, SR_WIP, VERIFYING, REJECTED, EXPIRED (+more). Grace period constant 91 days.
- IDFC v5 issuance journey (ops cron driven): INITIATED -> UPLOAD_PENDING -> (UPLOAD_FAILED) -> PENDING_VERIFICATION -> VERIFIED -> ELIGIBILITY_CHECK_PASSED | ELIGIBILITY_CHECK_FAILED | CLASS_TYPE_MISMATCH -> VEHICLE_DETAILS_IN_PROGRESS -> VEHICLE_DETAILS_SUBMITTED -> ISSUANCE_PENDING -> ISSUANCE_IN_PROGRESS -> ISSUANCE_COMPLETED | ISSUANCE_FAILED; failures IDFC_REJECTED, REJECTED, MANUAL_QUEUE.

### 3.10 Recharge order status (per vendor order table)
INITIATED -> PAYMENT_IN_PROGRESS -> PAYMENT_SUCCESSFUL | PAYMENT_FAILED -> RECHARGE_INITIATED -> RECHARGE_SUCCESSFUL | RECHARGE_FAILED | TRANSACTION_ABORTED (KYC / RMM validation failure, vendor outage). Terminal: RECHARGE_FAILED, RECHARGE_SUCCESSFUL, TRANSACTION_ABORTED, PAYMENT_FAILED. Illegal transitions throw INVALID_STATE_TRANSITION (400). **TZF adds** MANDATE_INITIATED, MANDATE_PRESENTATION_SUCCESSFUL, MANDATE_PRESENTATION_FAILED. Client-level wallet recharge status: IN_PROCESS | SUCCESS | FAIL | INITIATED (+`failure_reason`, `auto_recharge_status`). Hold status: INITIATED, BOSS_ACCOUNT_ON_HOLD(_FAILED), BOSS_ACCOUNT_DEBIT_SUCCESSFUL/FAILED, BOSS_ACCOUNT_REFUND_SUCCESSFUL/FAILED. Payment mode: BOSS_ACCOUNT | LENDING_ACCOUNT | REWARDS_REDEMPTION (LIVQ/TZF). Recharge sources include APP, auto-recharge variants (cron, txn push, threshold, toggle, kafka), ARP recovery, negative-balance recovery, WALLET_INTENT, ACTIVATION_RECHARGE, REPLACEMENT_RECHARGE.

### 3.11 TZF UPI Autopay mandate `TzfAutopayRechargeMandate.MandateStatus`
INITIATED -> CONFIRMED | REJECTED | FAILED; CONFIRMED -> REVOKED | PAUSED | EXPIRED. Badge: CONFIRMED "Enabled" (green text #0AAA6F on #E7F8F2); REVOKED/REJECTED/FAILED "Revoked" (red #C10000 on #F9E6E6); else "Pending" (amber #DC8C09 on #FFF7E9). One INITIATED/CONFIRMED mandate per FO. A/B whitelisted only (`TZF_UPI_AUTO_RECHARGE_MANDATE`).

### 3.12 KYC card status
Boss KYC (`BossKycStatus`): PENDING, PENDING_LIMIT_EXHAUSTED, IN_PROGRESS_IDFC, IN_PROGRESS, APPROVED, REJECTED, FO nudge variants, TZF variants PENDING_TZF / IN_PROGRESS_TZF / REJECTED_TZF / APPROVED_TZF, plus "BLACKLISTED". TZF raw `TzfKycStatus`: INITIATED, INPROGRESS, REJECTED, COMPLETED, AGENT_SELFIE_REJECTED, AGENT_SELFIE_PENDING, FO_ACKNOWLEDGED_WAITING. Card copy in sec 4.5.

### 3.13 Chargeback `ChargebackStatus` (customer-facing)
REQUESTED -> APPROVED -> PAID; REQUESTED -> REJECTED; REQUESTED -> VENDOR_RAISED -> VENDOR_ACCEPTED -> PAID. Blocked side states: KYV_NOT_VERIFIED, KYV_IMAGES_NOT_UPLOADED, KYV_REJECTED (extra-deduction / debit-adjustment disputes need RC/KYV verified). Vendor labels: "NPCI Approved", "NPCI Rejected", "LIVQ Approved", "Raised with NPCI", "Rejected by LQ". Type {SWIPE_TRANSACTION, DEBIT_ADJUSTMENT_TRANSACTION}; category QDR (2-day window) / NON_QDR (30-day); source AUTODETECTED / USERRAISED; doc upload {INITIATED, PENDING, FAILED, UPLOADED}.

### 3.14 Other
- Refund claim: REFUND_CLAIM_INITIATED -> REFUND_CLAIM_APPROVED | REFUND_CLAIM_REJECTED (type DOUBLE_TOLL_PAYMENT).
- Tag removal: TRUCK_REMOVAL_PENDING -> FASTAG_REMOVAL_PENDING -> FASTAG_REMOVED; ticket PENDING / CREATED_WITHOUT_IMAGE / CREATED.
- Priority Plus status {PENDING, ACTIVE, INACTIVE, FAILED, CANCELLED}; payment {INITIATED, COMPLETED, FAILED, REFUND_INITIATED, REFUNDED}.
- Purchase order {INITIATED, COMPLETED, FAILED}.
- Tag status strings: IDFC "Active", "Blacklisted", "Exempted", "Replaced/Closed", "Low Balance"; TZF NPCI: NETC_NOTEXCEPTION, NETC_HOTLIST, NETC_EXCEPTION, NETC_LOWBALANCE, NETC_INVALID_CARRIAGE, NETC_BLACKLIST, NETC_CLOSED_OR_REPLACED, E_NOTICE, NETC_ANNUAL_PASS, UNKNOWN. Physical tag {Unassigned, Assigned, Lost, Damaged, Deactivated}. LIVQ/TZF entity {ACTIVATED, CLOSED, ACTIVATION_FAILED, STATUS_FAILED, STATUS_UPDATED}.

## 4. What each state looks like to the user

### 4.1 Gold plan list and activation
- Plan list: plans sorted by list price descending, only plans whitelisted for the FO (no whitelist row = FO not eligible, show no Gold entry). Plan card fields: title, `billing_amount` (list), `discount_amount`, `actual_amount`, `subscription_amount`, billing period in days, `top_ups` (= maximumTopUp), trial period + unit (MONTH|DAY), type FREE|PAID, `mandate_plan`, `mandate_fees`, `arp_payment_cta`.
- Banner text on plan list (only when top plan is FREE and FO never had v2): "Get 1st Month Free" | "First N Months Free" | "First N Days Free".
- Rate label after activation: "for every N days" when billing cycle % 28 == 0, else "/Month". 31-day plans are swapped to 28-day equivalents for new/consistent users (config flag).
- `show_priority_plus_icon` when FO has a Priority Plus record.
- Discount: `is_discount_applied` true when paid amount == 199 and differs from list; discount text localized (en/hi/ka/kn/ta/te), copy starts "Discount applied! Your subscription fee is now ..." (rest in properties).
- `show_footer` is false for Gold.

### 4.2 Status banners/cards by state
| State | What to show | Data |
|---|---|---|
| Not subscribed, eligible | Activation banner(s) from `bannerIds` (content lives in a banner service; ids vary by plan price 199/399/499, 28-day vs other cycle, Priority Plus FO or not) | `GET /banners/v2/fastag/info` |
| Activation pending | Pending state, poll order status | mandate PENDING |
| Active (trial) | Plan name, trial end date "dd MMM yyyy", top-up meter `used/total`, subscription amount 0 | |
| Active (paid) | Plan, next billing, top-up meter, pending top-up amount, pending subscription fee | |
| OVERDUE (fee unpaid <10 days) | Countdown to `fee_clear_date`; copy "Pay Rs.<due> before dd MMM" | |
| SUSPENDED | "Due to delay in subscription fee payment." Tags hotlisted; CTA pay dues (ARP_GOLD_DUE_CLEAR_WITH_MANDATE) | |
| Top-ups exhausted | Tags hotlisted until dues cleared; push "{0} / {1} top-ups utilised" | |
| Deactivation requested | Auto-recharge toggle cannot be disabled ("Autoschedule cannot be disabled while deactivation is in progress.") | |
| Deactivated | Inactive + `deactivation_date`; re-subscribe = new plan (no second trial) | |
- Gold deactivate confirm dialog (home config): title "%s will be hotlisted!" (%s = truck no), message "Are you sure you want to deactivate?", buttons "Yes" (FASTAG_DEACTIVATE_CONFIRM) / "Cancel" (FASTAG_DEACTIVATE_CANCEL).
- Deactivation contact (`GET v2/arp/deactivation-contact`): returns phone number; config key `ARP_DEACTIVATION_TEAM_CONTACT` with a default constant.
- Tag with Gold-hotlist/negative balance: balance color + banner "Tag blacklisted, recharge now to stay protected" (bg #14D91E48).
- Refund of mandate-setup fee: `is_refund_allowed` true only when FO has exactly one charge row with amount > 0.
- Double-toll-refund banners for ACTIVATED Gold FOs in A/B whitelist `DOUBLE_TOLL_PAYMENT`.
- Chargeback for Gold users: "Get full refund with Auto-Recharge Plus." shown in chargeback copy.

### 4.3 Gold checkout bill lines
`bill_type` values: ARP_SUBSCRIPTION, ARP_TOPUP_DUE, ARP_MANDATE_FEE, ARP_SUBSCRIPTION_DUE and ARP_GOLD_* equivalents (SUBSCRIPTION, TOPUP_DUE, SUBSCRIPTION_DUE, MANDATE_FEE). Each line: `original_amount` (struck-through), `amount`, `is_refundable`, recovery details, `transaction_id`, `truck_number`. `total_payable` rounded up to whole rupees. `mandate_details`: `max_authorized_amount` = max(plan mandate max, total), `tenure` days. No GST math in checkout response. GST number + state are collected via `invoice_billing_info{gst_number, state_from_gateway}` on create-order and pay-dues.
- Trial first-time: one line, refundable mandate fee (`is_refundable` true).
- Paid first-time: plan discounted price, not refundable, struck-through original if different.
- Mandate-only: total = config minimum (default INR 10), refundable.
- Dues clearing: one subscription-due line + one line per pending top-up transaction (each with a recharge `transaction_id`).

### 4.4 Order states in Boss "My orders"
Row: truck no, vendor + vendor text, `status` label, `status_type`/`status_color`, order date, amount paid, channel type (e.g. FOS), `order_cta` text, `cta_action`, `rejection_reason`, replacement flag. Paging: `has_more_elements`. Tabs: on_going / completed. Details screen: timeline + payment breakup labels: FASTag Cost, Service Fee, First Recharge Amount, Total Paid, Total Payable, Service Fees, Whitelisting Fees, Service Fee (replacement), Recharge Amount (low balance), Existing FASTag Dues, Platform Deposit, Priority Plus Fee, Security Deposit. Platform deposit refund becomes available after 60 days (config `fastag.platform-deposit.refund.days`).

### 4.5 Confirmation-pending blockers (CTA + info) at CREATED/CONFIRMED
| ctaAction | CTA text | Info text |
|---|---|---|
| CHANGE_VEHICLE_DETAILS | "ADD VEHICLE TO CONFIRM ORDER"; "UPDATE TRUCK NUMBER AND RC IMAGES"; "CHANGE VEHICLE DETAILS" | "Please add vehicle number to confirm the order."; for blacklisted: "Please contact your bank to whitelist your vehicle or change vehicle details" |
| ADD_PERSONAL_DETAILS | "ADD PERSONAL DETAILS TO CONFIRM ORDER" | "Personal details are not added. Add now for verification." |
| PAY_SERVICE_FEE (cars only) | "PAY INR 500 SERVICING FEE" | "Your vehicle is of type Car. Pay INR 500 to get the FASTag." |
| IDFC_NON_BB_BALANCE_DUE | "Pay INR x TO CLEAR DUE" | existing non-BlackBuck IDFC tag with negative balance |
| UPLOAD_KYC_DOCUMENTS | "UPLOAD KYC DOCUMENTS TO CLAIM" | "Claim vehicle by uploading the Owner's Documents" |
| UPLOAD_CLAIM_KYC_DOCUMENTS | (key only) | claim INITIATED with docs missing (newer app versions) |
| UPLOAD_RC / UPLOAD_INVOICE_DOCUMENTS | key only | truck verification REJECTED; invoice if chassis-number activation |
| START_BOSS_KYC | "START BLACKBUCK KYC" / "RE-UPLOAD KYC Documents" | only old app versions (<540) or retail flow off |
| CHECK_TRUCK_WHITELISTING_STATUS | key only | blacklist ticket flow |
| ASSIGN_FASTAG, REQUEST_OTP, SHOW_KYV_UPLOAD_SCREEN, FT_BAL_REFUND_DIALOG, DEEPLINK | key only | |
Info-only (no CTA): "Order will be confirmed post vehicle verification"; "Order will be confirmed after the truck claim process is completed"; "Your KYC documents verification is inprogress"; "Vehicle Number & RC Images are invalid / not matching"; whitelist ticket created / truck blacklisted by <bank>. Response also carries `carServicingFee`, `fastagWhitelistFee`, `bankName`. Sticky banner on home for FO's CREATED/CONFIRMED requests (empty if only a sales/FOS issuance).
Personal details required per vendor: LIVQ if LivQuik details missing; AXIS if details or address missing; IDFC only if retail not onboarded and subtype null/BUYER_SELLER; TZF if TZF details/PAN missing.

### 4.6 KYC cards (`BossKycStatus`, copy as header / subheader / CTA / colour)
| State | Copy | CTA | Colour |
|---|---|---|---|
| PENDING | "Complete KYC" / "KYC is needed to increase recharge limit" | START KYC | yellow |
| PENDING_LIMIT_EXHAUSTED | "Recharge not allowed as the limit is utilized" | | red |
| IN_PROGRESS_IDFC | "KYC in-progress" / "KYC verification is in progress at bank end" | | yellow |
| IN_PROGRESS | "Blackbuck KYC in-progress" / "Document verification is under progress" | | |
| APPROVED | "KYC Completed" / "Recharge limit upgraded now!" | | green |
| REJECTED | "KYC Rejected" / "Re-initiate the KYC process" | RESTART KYC | red |
| PENDING_TZF | "Full KYC Pending" (amber) | "Start KYC" (blue #1554F6) | |
| IN_PROGRESS_TZF | "KYC in progress" / "Documents submitted to BlackBuck for verification" (also "KYC Verification in progress") | Refresh | clock icon |
| REJECTED_TZF | "KYC Verification Failed" / "...Contact your nearest representative for help." (also "KYC Rejected / Please re-initiate the KYC process") | "Re-start KYC" | red |
| APPROVED_TZF | "KYC Completed" ("KYC Verified" green check) | | green |
| BLACKLISTED (TZF) | "KYC Invalid" / "The user is Blacklisted!" | | yellow |
Generic CTA texts: NEXT, START KYC, RESTART KYC, "OKAY, GOT IT", Refresh. `KycDetails` also has `recharge_limit_data{used,total,available}`, `alert{text,bg_color,text_color}`, `is_personal_details_required` (true when REJECTED_TZF). KYC approved shows unlimited.

### 4.7 Chargeback UI
- Disable reasons (exact): "{0} days chargeback request period expired"; "You have reached the limit of chargeback requests for this transaction"; "Chargeback request already raised on the duplicate transaction"; "Last request got rejected"; "No eligible transaction found"; "Request will be raised on the 2nd transaction"; "Extra Deduction/Debit Adjustment Requests are accepted after RC is verified"; "We have corrected your selected chargeback type. Please select the correct chargeback type from next time". Duplicate => error code CHARGEBACK_REQUEST_ALREADY_EXISTS. Invalid reason => 400 "Invalid chargeback reason".
- Processing copy: "Chargeback request will be processed by {0}"; "The chargeback refund will be processed with in 3 hrs from the request raised."; QDR: "Chargeback refund will be processed within 3hrs"; default "Refund processing time will be updated shortly"; paid: "Refund has been credited to your FASTag"; credited sheet title "Chargeback credited within {n} day(s)/hrs/mins!"; reason option "Charged more than normal"; colours error #C13031, info #0DBE7E.
- Per-transaction fields: chargeback id/status/reason/source, `chargeback_request_limit` (3), expired flag, rejection reason, disable reason. History default window 60 days. Server `nav_action` may route to KYV upload (`SHOW_KYV_UPLOAD_SCREEN`), `SHOW_BS_ACTION_DATA`, `CONFIRM`.
- Home shows a "chargeback credited" sheet from `recent_credited_chargeback`; viewing is acknowledged via `view/ack`.

### 4.8 Tag removal
Warning list (exact): "This is a permanent action."; "Available positive balance will be refunded post approval."; "Remove the physical tag from truck to avoid unwanted deductions." Cheque preview titles "Canceled Cheque" / "Preview the Canceled Cheque". Blocking dues: "Please pay %.2f for <due type> to remove tag". Config: `is_enabled`, vendor, `threshold_amount`, last-tag warnings (tag/FO/wallet level), `security_deposit_amount`.

### 4.9 Refunds
Double-toll claim submit: 201 "Please wait up to 24 hours while we verify your details". Push on approval: "Refund of Rs.<amount> is approved and deposited to the boss wallet"; rejection "Refund claim is rejected due to reason <rejection_reason>".

### 4.10 Transaction list
Item: txn number/type/date (epoch ms), amount, credit/debit, opening/closing balance, plaza name, lane direction, truck no, tag id, vendor, `txn_category` (e.g. CREDIT_TOLL_RECHARGE_TAG_ACCOUNT, CREDIT_UPI_TRANSACTION, CREDIT_CHARGEBACK_ACCEPTANCE, CREDIT_TAG_ISSUANCE, CREDIT_CASH_BACK, CREDIT_FASTAG_GOLD_SUBSCRIPTION_FEE_REFUND, CREDIT_EMANDATE(_RECURRING), CREDIT_FIRST_TIME_RECHARGE, REFUND, DEBIT_FASTAG_ISSUER_DEBIT_TRANSACTION, DEBIT_ADJUSTMENT, DEBIT_TAG_ISSUE_IGST; full list `toll:.../util/enums/FastagTransactionCategory.java`), chargeback block, RRN. History is 0-based paged (default size 10).

## 5. Business rules that change UI

### 5.1 Gold
- **Top-up limit**: plan `maxTopUps` = plan minimumTopUp, upgraded to maximumTopUp if the FO's tag transaction count >= plan minimumSwipes at activation. Global cap config `arp.topUp.max.limit` default 8 (`gold:.../ArpTopUpService.java`; code comment "8/8 swipes"). UI: `top_up_used / total_top_up`.
- **When a top-up is consumed**: a swipe leaves balance negative AND plan ACTIVATED v2 AND top-ups not exhausted AND not suspended AND truck/wallet toggle not off. The tag is hotlisted right after the swipe until dues are cleared; clearing dues frees the top-up and dehotlists if used < max.
- **Hotlist triggers**: top-ups exhausted; Gold suspended; deactivated with negative balance; FO whitelisted but not subscribed with negative balance; truck/wallet toggle off with negative balance; mandate revoked on PAID plan with unpaid fee.
- **Suspension window**: 10 days after charge fromDate (`ARP_BLOCK_THRESHOLD_IN_MILLIS` in `gold:.../SubscriptionConstant.java`, verified). Day 0-9 OVERDUE banner with deadline; daily 00:00 IST cron suspends. Paying late extends billing end (grace up to 18 days, 20 for 31-day plans).
- **Trial**: FREE plan => end = start + trial period (MONTH or DAY). Trial only on the FO's first-ever v2 subscription; re-subscription is forced PAID. Trial user pays only the refundable mandate fee.
- **Eligibility**: FO must have a whitelist config row for the plan. Activation errors (400, show message): "Fleetowner is not whitelisted for ARP V2"; "Already opted for Fastag Gold."; "Clear negative balance of tags and re-try" (when count of low-balance tags >= plan maximumTopUp); "Invalid trail period unit" (sic); 500 "Error while subscribing for Auto Recharge Plus."; "Arp Plan already active"; "Plan needs to be mandate plan"; "No recoveries are pending"; "No recoveries or topups pending"; "Invalid CTA"; "ARP Plan can be changed for TRIAL ZBPP only."; "Please update Boss App to enable ARP".
- **Activation side effects**: existing negative tag balances become pending top-up dues; tags hotlisted if top-ups >= max, else dehotlisted.
- **Mandate**: only one confirmed mandate per FO; max authorized = max(plan mandateMaxAmount, payable); tenure = plan mandateTenure days; checkout CTA is ARP_GOLD_SUBSCRIPTION_CHECKOUT when FO lacks a CONFIRMED mandate >= plan max, else ARP_GOLD_ACTIVATE.
- **Billing**: next-cycle charge created 01:00 daily after billing end; Gold fee recovered from tag balance (LIVQ wallet first, then IDFC; only if FO has an active tag) or RMM recovery. Cycle length from plan (28 common).
- **Pricing**: amount = discountedPrice else actualPrice; an A/B config can override for the default plan. Totals ceil'd to whole rupees. Mandate fee refundable to wallet after order completes.
- **Auto-recharge toggle with Gold on**: cannot be disabled ("ZBPP is enabled. Auto recharge can't be disabled" as legacy copy); with deactivation in progress, blocked with copy above. Gold FOs: toggling does not trigger an immediate recharge.
- v1 vs v2: v1 uses wallet/RMM recovery and halves recharge limit (`maxTopUps/2`) on mandate revoke; v2 hotlists instead. `active_arp_version` ("1"/"2"/null) in home config is v2-aware only when App-Version >= `arpV2AppVersion`.

### 5.2 Vendor differences (do NOT assume parity)
| | IDFC | AXIS | LIVQ | TZF |
|---|---|---|---|---|
| Balance holder | per tag | wallet | entity wallet | PPI wallet |
| Auto-recharge min balance | INR 99 (activation recharge 99) | INR 550 ("Wallet minimum balance cannot be less than INR550") | INR 200 ("...INR200") | INR 200 |
| Cap | monthly INR 10,000 without full KYC | wallet upper limit INR 20,000 | monthly INR 10,000 until KYC | min-KYC wallet max INR 10,000; full KYC INR 2,00,000 |
| Auto-recharge extras | | wallet frozen / closure messages | wallet blocked push | UPI Autopay mandate + presentation states |
| KYC | bank KYC / retail OTP, v5 journey | OTP | biometric/video KYC | full KYC SDK, agent selfie |
| Gold | tag-to-pool debit, hotlist, recharge | only `AXIS_WALLET` entity type; no Axis flow code read | wallet-based | not referenced in gold |
Tag price, security deposit, replacement price, activation recharge, personal-details/OTP requirement come per vendor from `FastagVendor` table (values not in code).

### 5.3 Recharge and KYC limits
- Non-full-KYC recharge cap INR 10,000 per month (`toll:.../ApplicationConstants.java` `MONTHLY_RECHARGE_LIMIT`, verified). Error copy: "Your Rs 10,000 FASTag recharge limit is exhausted! Please complete your truck KYC to increase your recharge limit".
- TZF check `GET /tzf/fastag/wallets/allowed-recharge-amount?walletId&amount` -> `{is_recharge_allowed, message, kyc_type, kyc_status, current_balance}`. Messages: "Max recharge allowed on your wallet is Rs 10K. You are exceeding the limit by INR x. Please complete Full KYC to proceed."; "Max Balance of your wallet cannot exceed 2 Lakhs. You are exceeding the limit by INR x. Please retry with proper amount."; "Your MIN KYC is not active. Please complete or renew your KYC."; "Your MAX KYC is not active..."; "Wallet details not found."; "Recharge allowed. Within your KYC limit." (limits are config properties with these defaults.)
- Recharge blocked messages: "Recharge not allowed. Update truck number." (blacklisted truck or chassis-number activation; block lasts 60 days); "Fastag is blacklisted. Create a ticket to whitelist the tag."; "Recharge is blocked"; "Recharge already exists with this transaction id"; "Insufficient Balance. Please recharge your wallet."; "Please try after 5 minutes" / "Transaction still in progress. Please try after 5 minutes"; "Fastag Recharge is not available temporarily, Please check again later"; "Your FASTag wallet is currently frozen. Please contact support." (AXIS). IDFC response code 737 = blacklisted/invalid tag.
- Auto-recharge errors: "Auto-recharge is currently managed by your union. You cannot update the toggle." (union FO).
- **Convenience fee** on recharge: config-driven (enabled/disabled for all, portal list, default fee, applicability limit, slabs). Value unknown; `GET /convenience-fee/get`.
- Balance cached 10 minutes (`fastag.balance.cache.ttl.minutes`); `refresh` param bypasses. If vendor balance API is down an `alert_info` banner (IDFC outage) is returned.

### 5.4 Issuance / replacement dues (paid from BOSS wallet)
SERVICE_FEE: cars only, default INR 500 (`app.toll.service-fee`). WHITELISTING_FEE: blacklisted-truck activation, default INR 500 (`fastag.whitelist.fee`). LOW_BALANCE_FEE: replacement; due = replacementBalanceAmount - old tag balance (`{amount, minimum_balance_amount, balance}`). IDFC_NON_BB_BALANCE_DUE: existing non-BB IDFC tag negative balance. PLATFORM_DEPOSIT refundable after 60 days. `GetDueResponse.amount` null = nothing due. Pay-dues is idempotent; wallet error surfaces as 400 (e.g. insufficient balance). Purchase validation: vehicles count within min/max allowed (values not in code), plan and campaign must exist, FO whitelisted to campaign, coupon check (`GET /v1/coupons/validate`).

### 5.5 Version gating
Header `App-Version` (int) gates features. Old app => HTTP 412 `MANDATORY_UPDATE_REQUIRED`: "Update the app now for better FASTag purchase experience." (LIVQ), "Update the app now for better experience." (Priority Plus), "Update the app now." (auto-recharge), "Please update Boss App to enable ARP", "Update the app" (Axis). Design a full-screen force-update state. Thresholds: `idfcRetailFlowAppVersion` 540, `arpV2AppVersion`, `livqAppVersion`, `axisArpFeatureAppVersion`, `kycEntryPointAppVersion` (values except 540 unknown).

### 5.6 Chargeback rules
QDR 2-day, NON_QDR 30-day request window; max 3 requests per transaction; extra-deduction and debit-adjustment disputes need verified RC/KYV; auto-detected cases are refunded by system. Refund timing copy: 3 hours (QDR/standard), approved push says "INR{2} will be refunded in 48 hours". Both exist in code, do not reconcile.

### 5.7 Notification cadence
Gold reminder cron 12:00 IST (toll): trial users every 5 days, non-trial every 10 days (config values from gold). Gold subscription-fee mandate presentation 1 day before the 10-day block deadline (`arp.mandate.subscription-fee-presentation-days`).

## 6. Server-driven UI catalogue

### 6.1 Issuance pre-validate bottom sheet
`POST /v{3,4,5}/fastag/request/issuance/pre-validate` (and replacement pre-validate) returns a sheet spec instead of an error. Source: `toll:.../apimodel/response/bottomsheet/PreValidateResponse.java`, `.../util/enums/BottomSheetResponse.java`.
Spec fields: `show_bottom_sheet`, `header`, `title`, `title_list[]`, `description`, `primary_btn{text, cta, cta_amount}`, `secondary_btn`, `cross_btn`, `is_cancel_order_option_shown`, `status_icon` (SUCCESS / FAIL / IN_PROGRESS / INFO), `sub_text`, `class_details{title, description, class, vehicle no, reason}`, dashboard variants, blacklist ticket `ticket_no/ticket_status/ticket_closure_date`, `restrict_assignment`, `cancel_reason_id`, `is_livq_otp_required`, `is_replacement_otp_required`. Text is mostly translation-key driven (English unknown).

| Sheet | Primary CTA | Secondary CTA | Icon |
|---|---|---|---|
| VEHICLE_ALREADY_REGISTERED | CLAIM_VEHICLE | CHANGE_VEHICLE_DETAILS | FAIL |
| VEHICLE_BLACKLISTED | CHANGE_VEHICLE_DETAILS | - | FAIL |
| VEHICLE_UNDER_DISPUTE | CALL_SUPPORT | CHANGE_VEHICLE_DETAILS | FAIL |
| FASTAG_CLASS_MISMATCH | CHANGE_BARCODE | - | FAIL |
| IDFC_V5_TAG_CLASS_MISMATCH | CHANGE_BARCODE | - | FAIL (copy: "Your tag class is not matching with the IDFC recommended tag class. Please scan a FASTag with the recommended tag class.") |
| FASTAG_CLASS_MISMATCH_PARIVAHAN | CHANGE_VEHICLE_DETAILS | ORDER_STATUS | FAIL |
| SERVICE_FEE_APPLICABLE | PAY_SERVICE_FEE ("NEXT") or ORDER_STATUS ("DONE") | CHANGE_VEHICLE_DETAILS | FAIL (copy: "Servicing Fee Applicable" / "Servicing fee of Rs.500 applicable for Car/Jeep/Van.") |
| VEHICLE_BLACKLISTED_NON_PARTNER_BANK | CANCEL_ORDER | CHANGE_VEHICLE_DETAILS | FAIL |
| TAG_ALREADY_EXISTS_WITH_BB / _WITH_IDFC | CHANGE_VEHICLE_DETAILS | CANCEL_ORDER | FAIL |
| VEHICLE_NOT_VERIFIED | CHANGE_VEHICLE_DETAILS | CANCEL_ORDER | FAIL |
| VEHICLE_BLACKLISTED_DURING_FASTAG_ASSIGN | PAY_WHITELIST_FEE | CHANGE_VEHICLE_DETAILS | FAIL |
| WHITELIST_SUCCESSFUL | SCHEDULE_APPOINTMENT | - | SUCCESS |
| WHITELIST_TICKET_CREATED | DISMISS | - | IN_PROGRESS |
| BLACKLISTED | - | - | INFO |
| REPLACEMENT_CLASS_MISMATCH | CHANGE_BARCODE | ORDER_STATUS | FAIL |
| REPLACEMENT_LOW_BALANCE | PAY_LOW_BALANCE_FEE | - | INFO (also "Fastag Recharge" header; "Please recharge your <entity> at least by INR x to replace this FASTag", CTA SHOW_RECHARGE_BOTTOM_SHEET "Recharge") |
| BLACKLISTED_BY_PARTNER_BANK / REPLACEMENT_BLACKLISTED_BY_NON_PARTNER_BANK | PAYMENT_SCREEN | - | INFO |
| DUES_PENDING | - | CHANGE_VEHICLE_DETAILS | INFO |
| NON_BB_START_BOSS_KYC | START_BOSS_KYC | CHANGE_VEHICLE_DETAILS | INFO |
| NON_BB_CLEAR_BALANCE_DUES | IDFC_NON_BB_BALANCE_DUE (with due amount) | CHANGE_VEHICLE_DETAILS | INFO |
| ONE_VEHICLE_ONE_FASTAG | CHANGE_VEHICLE_DETAILS | - | FAIL (copy: "Vehicle has N active Fastag(s). <vendors>") |
| COUPON_NOT_APPLICABLE_* | CHANGE_VEHICLE_DETAILS or "Okay" | CANCEL_ORDER | FAIL (copy starts: "This truck is not eligible for discounts. Change vehicle number and re..." / "This truck has no active coupon codes. Please check the vehicle number" / "Class 4 vehicles are not eligible for discounts. Change vehicle number and ...", tails truncated in source) |
| CHASSIS_ALREADY_HAS_ACTIVE_FASTAG_REQUEST, CHASSIS_TRUCK_NUMBER_EXISTS | CHANGE_VEHICLE_DETAILS | - | FAIL |
Other CTA ids: ORDER_STATUS, REPLACEMENT_PRE_VALIDATION_PENDING, ADD_TAG_TO_INVENTORY / CHANGE_BAR_CODE (agent inventory), LOW_BALANCE, FASTAG_BLACKLISTED, CALL_SUPPORT, CANCEL_ORDER, PAY_WHITELIST_FEE, PAY_LOW_BALANCE_FEE, PAYMENT_SCREEN.

### 6.2 Gold: what the server decides
- `arp_payment_cta` on each plan (ARP_GOLD_SUBSCRIPTION_CHECKOUT vs ARP_GOLD_ACTIVATE). CTA enum `ArpPaymentCTA`: ARP_SUBSCRIPTION_CHECKOUT, ARP_ACTIVATE, ARP_DUE_CLEAR_WITH_MANDATE, ARP_MANDATE_CHECKOUT, ARP_GOLD_SUBSCRIPTION_CHECKOUT, ARP_GOLD_DUE_CLEAR_WITH_MANDATE, ARP_GOLD_ACTIVATE, ARP_GOLD_MANDATE_CHECKOUT. The client sends it back to `/zbpp/checkout`.
- Plan-list `banner_text`, `show_priority_plus_icon`, `show_footer`, `discount_text`, home `bannerIds`.
- Language via `Accept-Language`.

### 6.3 FASTag home config (`GET fastag/config/v2`, header App-Version)
`vendor[]` (banks FO can buy), `all_vendors{BANK_CODE -> {icon, display}}` (priority vendors first), `menu_item_list[]` {icon, text, sub_text, action}: "Buy a BlackBuck FASTag" / "Tags designed for trucks" (BUY_BLACKBUCK_FASTAG); "Add a new FASTag" / "Any bank | Any vehicle" (ADD_OTHER_VENDOR_FASTAG, only if A/B BBPS_FEATURE_ENABLED); "View Orders" (VIEW_FT_ORDERS); TZF adds "UPI Autopay" / "Auto-Recharge Mandate" (LAUNCH_UPI_AUTORECHARGE_FLOW). Also `show_buy_fastag`, `show_track_order`, `is_reward_applicable`, `recent_credited_chargeback`, `priority_plus`, `active_arp_version`, `deactivate_confirmation_dialog_data`.
Priority Plus block: ACTIVE -> status only; INACTIVE and not Gold -> "mandate revoked" banner (bg/icon/text/CTA from TollAppConfig keys `PRIORITYPLUS_MANDATE_REVOKED_*`); INACTIVE and Gold -> empty label.

### 6.4 Personal-details form (server-built schema per vendor)
`GET /fastagrequest/personal-details/config/v3`: sections gender, user_consent{text}, contact_number, aadhar_details{name, number, mobile, dob, gender}, pan_details{is_valid, retry_allowed, warning, name, pan_number, contact_number, dob, status, gender, father_name}, address_details, other_details_section. Each field `InputDetails{existing_input, error_text, is_editable}` => render prefilled/locked fields with inline errors. Consent copy: "I attest that the details I have entered are accurate and that I am not a politically exposed person, nor associated with anyone who is."
PAN errors: PAN_INVALID "PAN number is invalid or could not be verified"; NAME_CONTAINS_DIGITS "Name on PAN contains digits. Please re-enter."; APPLICANT_UNDERAGE "Applicant is below the minimum permitted age"; PAN_SERVICE_UNAVAILABLE "PAN verification service is temporarily unavailable. Please retry."; PAN_ALREADY_EXISTS "PAN is already registered against another wallet"; also PHONE_ALREADY_EXISTS, PAN_AND_PHONE_ALREADY_EXISTS, INVALID_PAN_DETAILS, PAN_NOT_SERVICEABLE (copy key only).
OTP errors: OTP_EXPIRED (410) "OTP expired. Generate a new one."; OTP_INVALID (401) "Invalid OTP."; OTP_RETRY_LIMIT_REACHED (429) "Maximum OTP retry limit reached."; OTP_SEND_FAILED (502) "OTP could not be sent. Please retry."; WALLET_CREATION_FAILED (500) "Wallet could not be created after OTP verification."; OTP_VERIFICATION_FAILED (400), OTP_ALREADY_VERIFIED (422).

### 6.5 Other server-driven pieces
Transaction-detail page config (`txn-detail-config`, `ft_txn_config`), TZF UPI autopay intro/setup config, KYC landing/biometric config, auto-recharge toggle confirmation dialog (`ar-toggle-confirmation-dialog`), home bottom sheet by priority (`v1/bottomsheet/homescreen`), cheque-upload CTA, recharge pre-validation, tag-removal config, order-card CTA. All served via supplywrapper or toll; shapes beyond this file are unknown.

## 7. Notifications / push / SMS

Push via MessageService; most strings hard-coded English; template `fms_generic_gcm_v1`. Gold repo only sends mandate pushes (type GENERIC_MESSAGE, target FASTAG_HOME).

| Trigger | Title | Body | Repo |
|---|---|---|---|
| Gold mandate CONFIRMED (once per status) | "ARP Mandate created" | "ARP Autopay setup successful" | gold |
| Gold mandate REJECTED (not sent if FO already Gold-eligible) | "ARP Mandate failed" | "ARP Autopay setup failed" | gold |
| Top-ups used | "{0} / {1} top-ups utilised" | "Clear the dues to free up the auto recharge plus top-ups." | toll |
| Gold renewed | "Auto recharge plus subscription renewed" | "...extended till {0}." | toll |
| Gold deactivated | "Auto recharge plus deactivated" | "Your trucks are no more blacklist protected" | toll |
| Gold newly available for truck (type 1) | "FASTag Gold available for truck {0}" | "Now, {0} can be covered under FASTag Gold. Activate now." | toll |
| Axis wallet auto-recharged | "Axis wallet recharged through Auto recharge plus" | "Axis wallet has been recharged by Rs.{0} to avoid blacklisting of your trucks." | toll |
| Axis protection | "Auto Recharge Plus will protect your Axis trucks" | (rest not captured) | toll |
| Tag blacklisted | (title not captured) | "Fastag of truck <<truck_no>> has been blacklisted due to negative balance. Recharge now to whitelist the tag." | toll |
| LivQuik wallet negative/low | "LivQuik Wallet Blocked!" | "All your LivQuik fastags are blocked as the wallet balance is negative Rs. %s. Load wallet to activate tags" / "...blocked due to low balance Rs. %s. Load wallet to activate tags" | toll |
| Third-party recharge outside app | "Rs.{0} charge collected" | "Rs.{0} collected for recharging fastag of {1} outside of Blackbuck APP" | toll |
| FASTag delivered (legacy copy) | "FASTag delivered for <<truck_no>>" | "Recharge Fastag now. Get 2.5% cash back on usage at toll plaza" | toll |
| Order on hold | "Fastag Request is On Hold" | "Blackbuck representative is trying to call to deliver the tag to {0}" | toll |
| Truck claim | "Truck claim initiated." / "Truck claim approved." | | toll |
| LivQuik KYC approved | "Your LivQuik KYC is now approved" | "Recharge limit upgraded. Monthly recharge of >10K is allowed now." | toll |
| TZF KYC rejected | "Your KYC has been rejected for Blackbuck FASTag" | "Please reach out to the nearest representative to retry KYC" | toll |
| Priority Plus success / fail | "Your auto-pay set-up was successful" / "Your auto-pay set-up failed" | "Enjoy the benefits of being priority+ customer" / "Priority+ service is not enabled" | toll |
| Chargeback requested | | "Your chargeback request for transaction {0} for {1} has been successfully raised." | toll |
| Chargeback approved | | "...has been approved. INR{2} will be refunded in 48 hours." | toll |
| Chargeback rejected | | "...has been rejected. Please see chargeback history for more details." | toll |
| Chargeback paid | | "...approved. INR{2} has been refunded to your FASTag." | toll |
| Chargeback vendor raised | | "...raised with {2}." (accepted/rejected variants exist, copy not captured) | toll |
| KYV nudges | | "Please upload the truck images properly to avoid hotlisting." / "Please re-upload the truck images properly to avoid hotlisting." | toll |
| Auto-detected wrong deduction | | "We have identified wrong FASTag deduction of INR{0} for {1} and refunded the money to your FASTag. Please see chargeback history for more details." | toll |
| Chargeback type corrected | "Chargeback type has been corrected" | (body not captured); also "Chargeback amount corrected" / "Chargeback of Rs.%s approved on %s" | toll |
| Credit line | | "Rs.{0} credited to {1} at {2}" | toll |
| Refund claim | "Refund of Rs.<amount> is approved and deposited to the boss wallet" / "Refund claim is rejected due to reason <rejection_reason>" | | toll |
SMS templates by name only: `CP_CUSTOMER_ONBOARDING`, `CRO_SELFIE_LINK` (copy unknown). Daily 12:00 IST Gold subscription reminders to trial (every 5 days) and non-trial (every 10 days) users; copy not captured.

## 8. API surface (only what a designer needs)

Bases: toll `/fmstoll/api/`, gold `/toll-gold/api/`, BFF `/supplywrapper/boss/...` (not in repos). JSON snake_case. Auth/ownership checks return 403 or 400 ENTITY_ID_NOT_FOUND when the FO does not own the entity.

### 8.1 Which service do the apps call for Gold? (resolved, see sec 10)
Boss calls Gold via the **supplywrapper BFF** (`boss:core/legacy/.../NetworkConstants.kt`): `/supplywrapper/boss/toll/arp/plans`, `/toll/v2/arp/plan`, `/toll/arp/activate`, `/toll/arp/payment-details`, `/toll/v2/arp/pay-bulk-dues`, `/toll/dues/status`, `/toll/v1/arp/swipe/breakup`, `/toll/v2/arpStatus`, `/supplywrapper/boss/fastag/arp/checkout`, `/supplywrapper/boss/fastag/arp-confirmation`, `/supplywrapper/boss/fastag/ar-toggle-confirmation-dialog`. Boss also calls toll directly: `/fmstoll/api/zbpp/deactivateRequest`, `/zbpp/updateDeactivateRequest` (cancel), `/zbpp/activate` (re-activation), `/v1/arp/reactivate/config`, `/fastag/config/v2`, plus legacy v1 consent `/payments/api/lending/consent/initiate|validate`. Boss never references `/toll-gold/`. BB Pro has no Gold endpoints.

### 8.2 Gold (gold repo, `gold/subscription` + checkout), shape reference
| Method + path | Purpose / key fields |
|---|---|
| GET `/gold/subscription/details?phone_no|fleet_owner_id&populate_additional_fields&arp_version` | `ArpDetailsDto`: status, consent_status, derived_status, subscription_details{start/end date, type, amount}, top_up_used/total_top_up, pending_top_up_amount, pending_subscription_fee, pending_dues, total_swipe_amount, billing_* and total_* swipe counts/sums (only with populate_additional_fields and v2), toll_mandate_details, toll_mandate_details_v1.mandate_status, is_discount_applied, actual_amount, discounted_amount, discount_text, monthly_swipe_count, fee_clear_date, deactivation_date, is_refund_allowed. 400 "phone and fleetOwnerId can not empty". |
| GET `/gold/subscription/plans?fo_id=` | `{plans[], banner_text, subscription_exists, show_priority_plus_icon}` |
| GET `/gold/subscription/plan?fo_id=` | current plan (+ subscription_type, end date "dd MMM yyyy"); empty object if none |
| POST `/gold/subscription/activate` (header App-Version) `{fleet_owner_id, is_consented, plan_id, amount_paid}` | `{fo_id, consent_status, activation_type, plan_id, plan_name, subscription_amount, actual_amount, subscription_amount_rate, subscription_end_date_str, top_ups, trial_period(+unit), auto_recharge_details, tag_to_pool_disabled}`. Per-FO 5 s lock (concurrent => 409). |
| GET `/gold/subscription/payment-details?fleet_owner_id=` | `{bill_details:{swipe_details, subscription_fee, arp_version}}`; any failure = bare 500 |
| GET `/subscription/fetch/arp-version?fo_id=` | int 1 or 2 |
| POST `/zbpp/checkout` `{fleet_owner_id, plan_id, arp_cta_action}` | bill_details[], total_payable, mandate_details, billing_start_date, plan_amount, plan_id, show_footer |
| POST `/zbpp/create/order` `{fleet_owner_id, plan_id, amount, refundable_amount, arp_cta_action, payment_order_id (client-generated), recovery_ids[], arp_version, subscription_plan_id, invoice_billing_info}` | `{arp_payment_order_id}` |
| GET `/zbpp/order/status?arp_payment_order_id=` | `{payment_type DUES|SUBSCRIPTION_CHARGES|GOLD_SUBSCRIPTION_CHARGES, status ACTIVE|PENDING|INACTIVE, mandate_status, transaction_id, transaction_amount, transaction_date, arp_version, fleet_owner_id}`; 400 "Arp payment order is not present" |
| POST `/v2/arp/swipe/global-due-clearance` `{fleet_owner_id, invoice_billing_info}` | `{data:{transaction_list:[ids]}}` clears all pending top-up dues by recharging each tag from wallet; 400 "Exception while recharging the fastag." (wrapped as 500 "Something went wrong") |
| GET `/banners/v2/fastag/info?foId=` | `{bannerIds:[int]}` |

### 8.3 Gold-related toll endpoints
GET `v2/arp/plans|plan|payment-details|details|config|replacement/payment-details`; `v2/arp/config` -> `{arp_version, show_buy_fastag, show_track_order, arp_top_ups, arp_billing_amount}`; `v2/arp/gold_info` (call-centre view, not app); `v2/arp/deactivation-contact` -> `{deactivation_phone_number}`; POST `/zbpp/deactivateRequest` (+ list, status, update; errors "Deactivation request already found.", "No active subscription plan found.", "Currently in the same state."); `/v2/zbpp/deactivate` and `/zbpp/arp/discount` are ops.

### 8.4 FASTag orders and issuance (toll)
Latest app versions: v5 `GET v5/fastag/request/orders?fleet_owner_id&page&offset&status=on_going|completed`, `GET v5/fastag/request/details?fastag_request_id&timeline_required&appointment_details_required`, `POST v5/.../issuance/pre-validate`, `GET v5/.../config` (v6 adds chassis_issuance, kyc_verification_status); v3: sticky-banner, get-dues, pay-dues, replacement (pre-validate, whitelist, confirmation), assign/fastag, assign/vehicle, personal-details, list, active-trucks, search-truck. v4: replacement/is-cross-bank. Purchase: `/fastag-order/{initiate|v2/initiate|existing/initiate|purchase|purchase/existingOrder/payment/collect}`, `GET /fastag-order/status|purchase-confirmation|priority_plus_fee`, `POST /fastag-order/bb-pro/pending` (BB Pro payment alerts; CTA "Okay" -> ORDER_DETAIL), `GET v1/fastag/digital/payment-details` (`security_deposit_amount`, `security_deposit_waived_amount`, `total_payable`, `number_of_vehicles`, `activation_recharge`, `fastag_cost`, `vendor`, `platform_deposit`, `priority_plus_*`, `service_fee`), plans `v1/fastag/digital/allPlan|plansV2|getKeyFeatures|quarterly-fees`. Cancel reasons `GET /fastagreason/{id}?source=APP|BB_PRO`.

### 8.5 Recharge, balance, transactions (toll)
- Recharge: `POST v2/fastag/recharge-order` (LIVQ/AXIS/TZF), `GET v2|v3/fastag/recharge-order/pre-validation|status`, `POST v2/fastag/recharge-order/initialize`, `POST v3/fastag/recharge-order/initiate` (wallet-intent, all 4 vendors; "Wallet intent recharge not supported for <vendor>"), `GET v3/.../mandate-details` (REGISTER_AND_PAYMENT or PAYMENT), `fastag/rechargeorder/prevalidation`, legacy `POST v1/fastag/recharge/{fo}/{truck}`.
- Auto-recharge: `PUT autoscheduled/v2|v3/update` (toggle + min balance), `POST v2/update/minbal`, `POST v2/info`. Entity types FASTAG_ID (IDFC), WALLET_NUMBER (AXIS), ENTITY_ID (LIVQ), TZF_ENTITY_ID.
- TZF UPI autopay (Boss): `/tzf/upi/autopay/{intro/config, setup/config, order/initiate, mandate/status, update/toggle}`.
- Balance: `POST v3/fastag/request/balance?fo_id&refresh` body barcodes -> `FastagBalanceV2Response{fastag_balance, balance_color, arp_v2_alert_info, alert_info}`; foreign barcodes silently dropped; 500 "Could not fetch balances".
- Transactions: `POST v2/fastag/transaction/ledger/transaction-history?page&size` body `{vendor, fo_id, filters}`; `.../download`; `GET v2/.../closing-balance`; `v1/fastag/transaction/last-swipe|alert-info|transaction-count`. Boss also uses `/supplywrapper/passbook/ledger/transaction_history`.
- BBPS (any-bank tags, A/B gated): `bbps/config|fastag|recharge/config|vendor/config|vendor/prevalidate|ledger/config|remove/vehicle|bulk_balance`.

### 8.6 KYC / OTP
Per vendor: IDFC `v1/idfc/retail/fastag/otp/*`, `v1/idfc/fastag/kyc/status`; LivQuik `/livquik/fastag/otp/generate`, `/livquik/fastag/kyc/status`, `/kyc/biometric/*`, `/kyc/video/link`; AXIS `v1/axis/fastag/otp/*`; TZF `/tzf/fastag/otp/*`, `/tzf/fastag/kyc/status`. `PUT .../kyc/update` marks a nudge seen. TZF tag control: `/tzf/fastag/tag/control-rule`, `/tag/refresh-status`, `GET /tzf/fastag/tag/status`; wallet recharge allowance (sec 5.3).

### 8.7 Chargeback, refund, removal, Priority Plus
- Chargeback: `POST v4/fastag/chargeback` (list body; `{data:[...], nav_action}`), `GET v2/fastag/chargeback/list|detail/{id}|plaza-details|reason|history|paid-chargebacks/list|debit-adjustment-config|get-monthly-txn-details`, `POST v2/.../view/ack`, `GET v3/.../reason`.
- Refund: `POST /refund`, `GET /refund/list/app`, `GET /refund/config`, replacement cheque refund `GET /refund/replacement/details`, `POST /refund/replacement/submit`.
- Removal: `GET fastag/remove/config|warning/text|image/preview|truck/due`, `POST fastag/remove/request`.
- Priority Plus: `POST priority-plus/re-activate/checkout`, `GET priority-plus/payment-details?fleet_owner_id&is_auto_pay_enabled`, `POST priority-plus/create/order`, `GET priority-plus/status`, `GET priority-plus/exists`. Boss also via `/supplywrapper/boss/fastag/priority-plus/checkout` and `/v1/priority-plus/purchase/status`.

## 9. Error envelopes and messages

Three coexisting shapes; design a generic error component keyed on message text, not on shape.
1. Toll modern: `{"error":{"error_code","error_message"}}` (`toll:.../common/GlobalExceptionHandler.java`). `error_code` = enum constant name for CP-contract codes, display name for legacy. Mapping: BAD_REQUEST 400; NOT_FOUND family 404; CONFLICT 409 (also concurrent-request lock); 402 INSUFFICIENT_BALANCE; 403 CP_NOT_ALLOWED / CUSTOMER_BLACKLISTED / CHASSIS_ISSUANCE_DISABLED; 410 OTP_EXPIRED; 412 precondition; 413 upload too large; 422 default CustomException and vendor/pre-validation failures; 5xx upstream.
2. Gold: `{"error":{"errorCode","errorMessage"}}` (camelCase) via `GoldGlobalExceptionHandler`: BAD_REQUEST / INVALID_STATE_TRANSITION 400, NOT_FOUND 404, CONFLICT 409, INTERNAL_SERVER_ERROR 500, other codes 422; validation errors 400.
3. Legacy `ResponseModel{data, error_response{message, code}}` (recharge, ARP, force-update 412).
4. Some endpoints return a bare 500 (gold payment-details, Priority Plus). Show a generic retry state.
Message highlights (exact English): "Insufficient Balance. Please recharge your wallet."; "Transaction count limit exhausted"; "Transaction limit exhausted"; "Truck no. %s cannot be covered under FASTag Gold. We shall update once activated"; pre-validate (400): "Fastag Request not found", "Active FasTag Request already present", "Chassis Issuance is not allowed", "Permission Denied to Request Fastag", "Replacement request already found.", "No fastag found with valid status", "Address is mandatory for placing request. Please Add.", "Selected address does not exist.", "Pincode is missing in the selected address. Please add Pincode.", "Invalid vehicle number: <no>", "Invalid barcode", "Balance is null for the given fastag"; purchase: "Plan does not exist", "Campaign does not exist", "Fleet owner is not whitelisted to provided campaign", "Payment order id should not be null"; removal: "No active fastag request found.", "FASTag request not found.", "Fastag request is in removed state.", "Replacement request raised. Cannot remove the fastag.", "Error while creating the ticket."; TZF mandate: "An active or pending mandate already exists for foId: ..." (backend id in message, do not show), "User is not whitelisted for TZF UPI Auto Recharge Mandate". Ops-only discount errors ("Invalid discount amount." etc.) are not app copy. CP-contract codes (ORDER_NOT_FOUND, VEHICLE_TYPE_MISMATCH, ONE_VEHICLE_ONE_FASTAG, TRUCK_HOTLISTED/BLACKLISTED/UNDER_DISPUTE, DUES_PENDING_ON_TRUCK, TRUCK_EXIST_UNDER_DIFFERENT_FO, BARCODE_*, CUSTOMER_NOT_ONBOARDED "Customer is not onboarded. Please onboard on the BB Boss app.", PLAN_NOT_ELIGIBLE) are partner-facing.
Force update: HTTP 412 `{error_response:{message, code: MANDATORY_UPDATE_REQUIRED}}`.

## 10. Open questions and resolved items

1. **Which service do the apps call for Gold? Resolved at the app side, partly open downstream.** Toll and gold both implement Gold plans/details/checkout, but neither Boss nor BB Pro references `/toll-gold/` or `/gold/subscription/*`. Boss reaches Gold through supplywrapper (`/supplywrapper/boss/toll/...arp...`, `/supplywrapper/boss/fastag/arp/checkout`) and a few direct `/fmstoll/api/zbpp/*` + `/fmstoll/api/v1/arp/reactivate/config` calls. BB Pro has no Gold calls. UNKNOWN: whether supplywrapper forwards to toll or gold per route (supplywrapper source not provided). Practical guidance: design from the gold-repo response shapes (the live Gold logic) and treat toll's `v2/arp/*` as an equivalent copy; confirm with backend before claiming exact field names for the Boss screens. Boss's own DTOs (`boss` repo feature modules) were not diffed against these shapes.
2. Fees, GST, convenience fee, platform deposit, tag price per bank, min/max vehicles per order, app-version thresholds (except 540): config/DB-driven, not in code. Mock as illustrative.
3. Where `is_refund_allowed` refund is executed, and who raises Gold deactivation requests from the app side (toll endpoint exists; ops path unclear).
4. English copy for most bottom sheets, personal-details labels and the KYC/Gold banners lives in supply-wrapper translations; not available.
5. Chargeback refund-time copy conflicts (3 hours vs 48 hours); confirm with product.
6. TZF acronym expansion is not stated in code.
7. Not read: replacement service bodies, BBPS flow internals, coupon logic, union FO flows, FOS/appointment flows, CP flow gate, order timeline body, Axis flows in gold (mostly commented out), IDFC/AXIS/LIVQ client internals.
8. Toll `README.md` and `toll:thoughts/` PRD docs are partly aspirational; code was preferred when they conflict.
