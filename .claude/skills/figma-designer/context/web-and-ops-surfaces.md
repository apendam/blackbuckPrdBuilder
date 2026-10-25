# BlackBuck web and ops surfaces: designer context

Last verified 2026-10-15

Audience: a Figma design agent that mainly designs the Boss (fleet-owner) and BB Pro (sales/agent) mobile apps, but must understand the web screens those journeys hand off to.
Repos (all under `repos/`): tzf-customer-portal @ bedb936, tzf-activation-web-sdk @ 2d519f4, tzf-full-kyc-sdk-web @ 0d6387b, tzf-ops-portal @ a6f7958, boss-portal @ 4dc4813.
Conventions: paths are `repo/relative/path`. "Verified" = read in code this session. "Unverified" = inferred or server-driven (not in repo). No secrets, keys, tokens or internal hostnames are recorded here.

---

## 1. Map: who uses which surface and how it is launched

| Surface | Users | Form factor | Launch / embedding |
|---|---|---|---|
| tzf-customer-portal | Existing TZF FASTag customers (fleet owners) | Desktop-first website, fixed widths (sidebar 256px, login card 416px). Not responsive. | Standalone site, own OTP/password login. No query-param handoff from apps, no postMessage, no iframe handling (verified by grep). Own params only: `/?tab=home\|faq\|tnq\|grievance`, `/dashboard/truckLedger?truckNumber=&dateRange=`, `/Upipayment?amount=&upiId=`, `/dashboard/Ledger/[ALL\|DEBIT\|CREDIT]?dateRange=`. Unknown whether Boss or BB Pro link to it. |
| tzf-activation-web-sdk | BlackBuck sales agents, CRO, channel partners acting for a fleet owner (FO) | Mobile-width web (100dvh columns, `max-w-xl` centred), web port of BB Pro RN screens | Opened by host (BB Pro webview, link or partner) at `/?token=<session_key>&salesCode=<code>&userId=<id>&version=v2&...`. No login UI. Token (also accepted as `?session_key=`) is moved to sessionStorage and stripped from the URL; sent as an Authorization header on every call. 401/410 shows full-screen "Session Expired - Please re-open the app to continue." No outbound message to the host app and no close-webview bridge; back arrows use history back. |
| tzf-full-kyc-sdk-web ("TZF KYC") | Customer, agent (TSL/CRO), TSL reviewer. Role decided by backend `user_type`. | Mobile-width web (`max-w-md`), built for a React Native webview | Query string only, no login: `/?token=&request_id=&transaction_id=&pan_number=&name=&customer_phone_number=&agent_phone_number=[&latitude=&longitude=]`; `/otp` takes the same plus `document_submitted=true\|false`; `/tsl-review?token=&transaction_id=` (+ rest). The token is a KYC transaction token, not the BB Pro session, and it sits in the URL. Outbound to host only via `window.ReactNativeWebView.postMessage`. Embedded by tzf-activation-web-sdk in an iframe (see section 3). |
| tzf-ops-portal | BlackBuck/TZF ops and tech-support agents (internal) | Desktop only, static site (HTML + JS, no framework) | Direct URL, Google sign-in. No roles: any signed-in user sees every tab and can do every action (verified). |
| boss-portal (`boss_help_desk`) | Boss app users (via the app); no web UI of its own | Java/Spring backend, wrapper over Freshdesk | Called by the Boss app through a gateway; app version header gates features, `Accept-Language` picks locale. Push deep links use the `boss://blackbuck/...` scheme. |

Design implications for mobile designers:
- Only two web surfaces are mobile-shaped and meant to appear inside the apps: activation web SDK and KYC web SDK. They are rendered inside the host's webview chrome, so they draw their own 56px header (back + title) and do not know about the host's status bar or navigation.
- Hosts must grant camera, microphone (selfie video) and geolocation to the webview. Unverified for BB Pro/Boss; code only requests them.
- The customer portal and ops portal are never embedded. Do not design mobile versions of them unless asked.
- Boss help desk content (articles, categories) is rendered natively or in a WebView by the app; the backend ships HTML for articles.

---

## 2. Surfaces in detail

### 2.1 tzf-customer-portal (desktop, existing TZF customers; not embedded in apps)

Purpose: a logged-in customer sees owned trucks and tags, recharges the wallet by UPI QR, reads the ledger and an account summary. Brand "BlackBuck FASTag". Public landing at `/` (hero, 4-step "How to get a BlackBuck FASTag?", FAQs, T&C, Grievance Policy; black theme, red accents). README empty; purpose inferred from code. Gate (`tzf-customer-portal/src/middleware.ts`): unauthenticated `/dashboard/*` goes to `/auth`; authenticated `/` or `/auth` goes to `/dashboard/home`; 7-day httpOnly cookie. `/Upipayment` is not in the matcher (ungated).

- **Login card** (416px, `src/app/auth/components/`): OTP login (default; "+91-" + exactly 10 digits, "GET OTP", then 4-digit OTP, resend timer "Resend in 0:25", "LOGIN"), password login ("Login With Password", eye toggle, "Forgot Password?", "Create Password"), create/reset password (mobile, OTP, new + confirm; 8-16 chars with upper, lower, digit and one of `!@#$&_~`). Errors: "Please enter valid OTP", "Please create password first", "Entered password is wrong", "Password is not matched", "User doesn't exist." A failed OTP send shows only a red border.
- **Shell**: header (logo, help number, profile menu with "Account", "logout") and a one-item sidebar "Owned Trucks".
- **Owned Trucks**: "Owned Trucks (N)", "FASTag Balance Rs. X" with refresh icon, navy "RECHARGE", search "Search by truck number"; table TRUCK, LAST SWIPE, STATUS (API-coloured pill), UPI ID (copy), "Generate QR", kebab (Request Tag Closure / Replacement, which only opens a "call to contact" modal). States: 5 skeleton rows, "Load more"; no designed empty or error state.
- **Recharge modal**: Rs input; max Rs 1,00,000 per UPI recharge; full-KYC wallet cap Rs 2,00,000; MIN KYC above utilised limit gives "To recharge more than Rs 10,000 kindly complete your full KYC..."; suspended wallet disables input. Tooltip: keep Rs300 balance.
- **`/Upipayment`**: UPI-only "Choose a payment Option", 250px QR with logo, UPI ID copy, "Pricing Details" card (fee hard-coded Rs 0.00), red "Payment Done" button goes to the ledger. No payment polling or confirmation: the user self-reports.
- **Ledger**: date range picker, tabs ALL / DEBIT / CREDIT, columns TRANSACTION, DATE, TYPE, AMOUNT, OPENING BALANCE, CLOSING BALANCE; note that chargebacks go through the help number. **Account**: read-only personal, account (KYC "FULL KYC"/"MIN KYC", utilised limit) and contact cards; no edit or upgrade CTA.
- Copy flag: three different support numbers across screens.

### 2.2 tzf-activation-web-sdk (mobile web, agent-assisted FASTag sales)

Purpose: web port of BB Pro RN flows for Buy FASTag (leads and order), KYC list, and KYV (vehicle installation photos). Nearly every file is a port of a BB Pro RN file, so BB Pro mobile screens are the visual spec. Web routes exist only for server-driven form, order summary and order status; other server navigation targets are silently ignored (verified in notes; a server action pointing at a native-only screen does nothing on web).

Routes (`tzf-activation-web-sdk/app/`): `/` menu; `/buy-fastag` leads; `/forms/[formId]`; `/ft-activation-summary`; `/ft-activation-order-status`; `/toll-kyc`; `/ft-installation`, `/ft-installation/search`, `/ft-installation/ticket-details`; `/__scanner_verify` (dev harness). In-tree full-screen overlays (not routes): `FT_ACTIVATION_SEARCH_TRUCK`, `FT_ACTIVATION_SCANNER`, `TZF_FULL_KYC`. README lists only 4 routes; code is the source of truth.

1. **Menu `/`**: header back + "Blackbuck FASTag"; row "FASTag Partner Bank" with a placeholder red square and "Blackbuck" (comment says real logo to come); "Select one to continue"; three cards with chevron: "Buy FASTag", "Know Your Customer (KYC)", "Know Your Vehicle (KYV)". Page bg #F6F6F6. The full query string is forwarded to each child route.
2. **Leads `/buy-fastag`**: header "FASTag Activation"; search pill (refetches when the query is a 10-digit mobile); rows: vendor logo, truck number (or "Order created"), status chip (text colour from API), "fo_number - fo_name - date", chevron; infinite scroll. States: spinner, "Something went wrong" + blue Retry, empty "No leads found". Blue pill FAB "+ Activate New" opens form `ft_activation_add_fo_number_form`. Row tap opens Order Status.
3. **Server-driven form `/forms/[formId]`**: sticky header with server title, Formik form from backend JSON. Loading "Loading form..."; full-screen errors: "No Connection", "Something went wrong", "Session Expired" with "Try Again"/"Go Back". Alerts via bottom sheet (icon by SUCCESS/ERROR/WARNING/INFO, title, message, 1-2 buttons); toasts top-centre.
   - In-scope form ids: `ft_activation_add_fo_number_form`, `ft_activation_add_vehicle_detail`, `ft_activation_assign_fastag_form` (barcode plus RC/chassis docs), `ft_activation_add_customer_detail_form`. **Field labels, validations and step order are defined by the backend (bb-transformer), not in this repo: unverified.** For exact fields use BB Pro screens or the backend form JSON.
   - Component vocabulary: text/email/password, text_with_action, text_with_verify, date, select, checkbox, rating, textarea, collapsible sub-form, fastag_class_card, user_info_card, single/multi choice questionnaire, partner_banks, grid_view, single/dual image upload, divider, button. Unsupported components render an amber "Unsupported component: X" (city_picker, state_picker, pin_code, channel_partner_sourced, loan_application_detail_proposed_trucks).
   - Behaviours: required/min/max/pattern validations with server error text (defaults "<label> is required", "Must be at least N characters"); conditional visibility; submit button blue #007AFF, disabled grey #DADADA until valid and dirty, spinner while submitting. Verify-field: "Verify" then "Verifying..." then a check with success text; editing resets it. Image upload: "UPLOAD"/"Re-Upload", jpg/jpeg/png/gif, max 5 MB, optional crop, toasts for bad format/size. FASTag class card colours: class 4 violet, 5 orange, 6 yellow, 7 green, 12 pink, 15 sky blue, 16 grey.
   - Server actions after submit: SHOW_ALERT, SHOW_TOAST, NAVIGATE_TO, NAVIGATE_TO_PUSH, NAVIGATE_BACK, RESET_NAVIGATION, REFRESH, MAKE_API_CALL; SHOW_BOTTOM_SHEET degrades to a toast.
4. **Search truck overlay**: input "Enter Vehicle/Chassis Number", result list, validate failure as alert sheet.
5. **Barcode scanner overlay**: chromeless camera. Copy: "Add FASTag", "Scan the Barcode of FASTag here", "Please align the Barcode with central box", "Please scan again", "You have already scanned this FASTag", link "Enter FASTag Barcode Manually" (sheet, masked input `123456-123-1234567`, 6-3-7 digits), flashlight toggle, scan count, discard dialog "Do you want to discard FASTags?" [Go Back / Discard], permission error "Unable to access camera. Please allow camera permission."
6. **Order summary** "FastTag Order Details" (params fleet_owner_id, plan_id, number_of_vehicles, fleet_owner_number, sales_code, mobile_number, vendor, icon_url): partner bank row, bill rows (key, optional coloured subtext, amount) and "Total Payable"; "Coupon Code" field (auto-uppercase, "APPLY", green/red border with server message); sticky footer: checkbox "I agree to Terms & Conditions" (opens PDF in new tab), "ADD VEHICLE TO CONFIRM" (disabled until ticked, "Processing..." state), inline red error on failure.
7. **Order status**: header back / "Order Status" / blue "Refresh" / kebab "Cancel Order" (only if `order_cancellation_allowed`; reason sheet, Confirm disabled until a reason is picked). Sections shown only when server flags allow: progress tracker timeline (FILLED/HOLLOW/CROSS markers, colour, info, time, optional CTA), KYC banner (server colour, icon, title, subtitle, CTA START_KYC / RESTART_KYC / REFRESH), Personal, Vehicle, FASTag, Payment details. Timeline CTAs: `UPLOAD_RC`, `UPLOAD_INVOICE_DOCUMENTS`, `ASSIGN_FASTAG`, `ADD_PERSONAL_DETAILS`, `CHANGE_VEHICLE_DETAILS`, `REFRESH`, and `REQUEST_OTP` which is **not implemented on web** (toast "OTP verification is not yet available on web."). Vendors known: TZF, IDFC, LIVQ, AXIS; screen is vendor-generic.
8. **KYC list `/toll-kyc`**: tabs PENDING / COMPLETED with counts; cards with name, key/value rows, coloured status chip, vendor, rejection reason, contact, CTA. TZF rows with "Start" open the full-KYC overlay.
9. **Full-KYC overlay**: spinner while the request is generated; "Something went wrong. Please try again." + Retry; otherwise an iframe (allow geolocation, camera, microphone) on the KYC SDK `/tsl-review?...`. Browser geolocation is requested first and omitted if denied. Details in section 3.
10. **KYV `/ft-installation`**: "FT Installation", search "Search truck number"; ticket cards (FASTag id/class, FO name/phone, truck, status, footers, tags). Ticket types TRUCK_NUMBER_VERIFICATION, FASTAG_VERIFICATION, AXLE_VERIFICATION; ticket statuses NOT_UPLOADED, VERIFYING, REJECTED, NOT_SENT_TO_BANK; photo statuses PENDING, VERIFIED, REJECTED. Ticket detail: call icon (tel: link to FO), three photo slots ("Vehicle photo with number plate:", "FASTag stuck on windshield:", "Side view with all axles visible"), states "Photo added"/"Not uploaded", per-slot error, "View instructions" sheet, preview modal, upload source sheet "Camera"/"Gallery"; submit toast "Photo submitted for verification" then back; leaving with unsaved photos asks to discard; extra Processing and Not-sent-to-bank views.

Flows: (A) Buy FASTag: host link, menu, leads, "+ Activate New" or lead, FO number form, (backend-defined chain, unverified) summary, confirm, vehicle form, order status, timeline CTAs (personal details, RC/invoice or assign FASTag by scan, bank processing, KYC banner, KYC iframe, refresh). (B) KYC: menu, toll-kyc list, Start, iframe, list/order refresh. (C) KYV: menu, list or search, ticket, three photos, submit; rejected slots show errors and can be re-uploaded.

Look and feel: BB Pro tokens (section 6), 56px header with subtle shadow, 16px gutters, 8-12px radius cards, pill FAB, bottom sheets for alerts and pickers, 40px blue ring spinner.

### 2.3 tzf-full-kyc-sdk-web (mobile web, biometric Full KYC)

Purpose: TZF Full KYC journey for a FASTag customer. Roles: CUSTOMER (header "Complete Full KYC"), AGENT (header "Agent Verification"), and a TSL reviewer flow ("Document Verification"). Routes: `/` documents, `/otp` customer consent, `/tsl-review`, `/api/health`.

**`/` documents page**: sticky header (back, title, refresh icon, kebab "Continue with Min KYC" for customers). Banners: red "Your KYC was rejected" or grey "Submit documents for <name>". Sections with status pills (Approved/Rejected/Verifying/Uploaded) and read-only once verified:
1. ID Proof: "Upload image for your <PAN>", slot "PAN card front".
2. Address Proof: select "Select Address Proof" (options from server), slots "<doc> Front/Back".
3. Customer's Live Selfie: locked with "Live selfie can be uploaded once your uploaded document is verified" until ID/address verified, then slot "Customer's photo" (photo plus 3-second video).
4. Agent's Live Selfie: slot "Agent's photo" (front camera).
5. Agent's Signature: slot "Agent's signature", signature pad (empty gives toast "Please sign before continuing"; saved as transparent PNG).
6. Additional Details selects: "Are you politically exposed person" (Yes/No, default No), "Choose your profession" (Salaried / Self Employed / Student / Other, default Self Employed), "Select income range" (e.g. "0 - 1 Lakh", "1 Lakh - 5 Lakhs", "5 Lakhs - 10 Lakhs", ..., default 0-1 Lakh). Server values override defaults.

Image slot: empty tap gives sheet "Add image" with Camera / Gallery (limited by server `capture_modes`; single mode opens directly); thumbnail with delete (hidden when read-only), spinner while uploading, red border with server error or fallback "<doc> is rejected. Please upload again."; tap thumbnail for preview. Documents get a crop dialog. Bad format toast: "This image format isn't supported. Please retake the photo." Gallery on native webview uses an inbound bridge (`handleImageFromNative`, 120s timeout).

Selfie camera: dark full-screen sheet (#1A2B3C header, #2C3E50 body), first "Selfie Tips" (Don'ts: Not centred, Blurred, No eyewear; Do's: "Click the photo in proper light", "Your face should be clearly visible"), then face detection prompts "Please ensure face is within the highlighted area", "Your face is visible, starting live capture in" (countdown), "Please blink twice" during the 3-second recording. No MediaRecorder gives "Video recording is not supported on your browser." Customer selfie uses the rear camera by default, agent uses the front; opening the customer camera triggers an SMS to the customer.

Sticky footer (only when server sends `submit_btn`): helper "KYC Verification will begin after OTP verification"; blue full-width button, text from server; `cta_action` REQUEST_OTP (agent) or SUBMIT_DOC (customer, then goes to `/otp`); disabled until server `submit_allowed`.

Sheets: **"Exit Full KYC?"** (red alert icon, "You wont be able to recharge more than 10K per month on your FASTags", "Yes" outlined goes to `/otp` with `document_submitted=false`, "No" filled). **OTP sheet** (agent step): "Enter Customer's OTP", "OTP Sent to <phone> for verification", 6 single-digit boxes (48x48, auto-advance), inline red error, "Haven't received the OTP?" + "Resend" (disabled "Resend in 30s"), "SUBMIT" enabled at 6 digits; success sends `SUCCESS` to host. Page states: spinner, "Something went wrong." + server message + "Retry".

**`/otp` consent**: header "Full KYC FASTag Activation Process"; green banner "Your documents have been uploaded successfully" when `document_submitted=true`; card "OTP Consent" with numbered list ("OTP will be sent to <customer phone>", "Collect and Input OTP to proceed", consent wording covering KYC documents and BlackBuck FASTag TnC); footer "SEND OTP TO <phone>" then the same OTP sheet, then `SUCCESS`. Errors: 2s toast on send failure, inline red text on wrong OTP.

**`/tsl-review` reviewer**: list of sections with status pills (Pending/Approved/Rejected, first rejection reason shown); tap opens a full-screen document review dialog stepping through tasks with prev/next: image or video on white (so transparent signatures show), panel "Match the details with the image" (server key/value, e.g. name, PAN), "Reject" (red outline) / "Approve" (green outline, filled when chosen). Reject opens sheet "Select a reason for rejection" (radio list from server, Cancel/Confirm). Sticky "NEXT" disabled until every task is decided; with any rejection an "Are you sure?" sheet appears (red alert icon, "A notification will be sent to the agent (CRO) to re-upload the rejected documents", "YES, PROCEED" / "GO BACK"). Toasts: "Failed to submit review", "Failed to load review tasks". If all approved, the page navigates to `/` (agent verification); if server flag `call_document_details` is true it redirects into `/` instead of showing review.

Status vocabulary: document PENDING | UPLOADED | VERIFYING | APPROVED | REJECTED (poll also VERIFIED, ACKNOWLEDGED); colours approved #0BBB7A, rejected #CD3333, verifying #F5A623, uploaded #1554F6. KYC status values used: FO_ACKNOWLEDGED (customer done, read-only), TSL_ACKNOWLEDGED (agent done), REJECTED.

Flows: customer: documents, selfie, additional details, submit, `/otp`, send OTP, enter 6 digits, `SUCCESS`. Min KYC exit: kebab, confirm, `/otp` without documents. Agent: selfie and signature, REQUEST_OTP, customer reads OTP to agent, submit (with lat/long), `SUCCESS`. Reviewer: review, NEXT, confirm if rejections, submit, `ON_BACK_PRESSED` (agent notified) or move to agent verification.

---

## 3. Cross-surface handoffs

```
Host (BB Pro webview / link / partner)
   |  /?token&salesCode&userId&version=v2        (token stripped from URL, kept in sessionStorage)
   v
tzf-activation-web-sdk  --Order Status KYC banner (START_KYC/RESTART_KYC)-->  TZF_FULL_KYC overlay
   |                                                                            |  <iframe> /tsl-review?token&request_id&transaction_id&pan_number&name&customer_phone_number&agent_phone_number[&lat&lng]
   |  <-- expects window 'message': ON_BACK_PRESSED | CLOSE | SUCCESS | FAILURE --+
   v                                                                            v
status-update API, toast, order refresh                       tzf-full-kyc-sdk-web ("/tsl-review" -> "/" agent verification, "/otp" consent)
```

**3.1 Activation web SDK embeds the KYC SDK in an iframe, but the completion events probably never arrive (likely bug, not tested at runtime).** Verified by reading code in both repos:
- The KYC SDK sends to its host only through `window.ReactNativeWebView?.postMessage(JSON)`. Call sites: `tzf-full-kyc-sdk-web/src/app/HomePage.tsx` (2), `src/app/otp/RequestOtpPage.tsx`, `src/app/tsl-review/TslReviewPage.tsx`, plus the gallery bridge in `src/lib/nativeImageBridge.ts`. A grep for `window.parent` / `parent.postMessage` finds nothing.
- The activation app listens with `window.addEventListener('message', ...)` in `tzf-activation-web-sdk/forms/screens/tzfFullKyc/useTZFKYCController.ts` (lines ~97-137), checks `event.origin` against the KYC URL, and handles `ON_BACK_PRESSED` (go back), `CLOSE` (onClose), `SUCCESS` (call status-update API, then success toast "KYC document uploaded successfully." and close), `FAILURE` (toast "KYC process failed. Please try again.").
- Inside an iframe `window.ReactNativeWebView` is normally undefined (unverified: it is a native-injected object, so likely not present in child frames), and the optional chaining makes the KYC SDK silently do nothing. Expected visible symptoms: after OTP success the overlay does not close, the KYC status-update call is not made, no success toast, order status is not refreshed until the user backs out or taps Refresh. Header back and the reviewer "ON_BACK_PRESSED" also do not close the overlay.
- Independent of the above, the activation host expects `CLOSE` and `FAILURE`, which the KYC SDK never emits (constants `DIALOG_CLOSE` and `NAVIGATE_TO_AGENT_VERIFICATION` exist in `tzf-full-kyc-sdk-web/src/lib/events.ts` but are never sent). So the failure toast path is dead.
- Design caution: do not draw a "KYC complete, returning to order" auto-transition for this hop as if it works. Confirm on a real device or browser first. If it is fixed later, the missing signal needs the KYC SDK to also call `window.parent.postMessage` with the same message shapes.

**3.2 Sales-code query param is inconsistent in tzf-activation-web-sdk (verified in code):**
- `app/buy-fastag/page.tsx` reads `sales_code`; `app/ft-activation-summary/page.tsx` reads `sales_code`.
- `app/ft-activation-order-status/page.tsx` reads `salesCode`. The home page doc comment (`app/page.tsx`) and `FtActivationScreen.tsx` comment describe the deep link as `salesCode`.
- The menu forwards the current query string unchanged to children (`FastagMenuScreen.tsx`). Consequence (by reading, not runtime-tested): a host that launches with `?salesCode=ABC` reaches the leads screen with an empty sales code, because `/buy-fastag` looks for `sales_code`. Deep-link producers (BB Pro, partners) must send whichever key the target route reads. Flag for PRD: pick one name. Internal API bodies use `sales_code` throughout.

**3.3 Other handoffs worth knowing**
- Host to activation SDK: session token in URL query (moved to sessionStorage and stripped); on 401/410 a full-screen "Session Expired" asks the user to re-open from the app. No programmatic way back to the host.
- Activation SDK to KYC SDK: PAN, name and phone numbers travel in the iframe URL query (design/privacy note). The KYC token is a separate transaction token.
- KYC SDK to native webview host (BB Pro): `ON_BACK_PRESSED` and `SUCCESS` via `ReactNativeWebView`; inbound gallery picker via `handleImageFromNative` (web posts `OPEN_GALLERY_TO_PICK_IMAGE`, native replies with a file uri; web asks `REQUEST_BASE64_IMAGE` for file:// or content:// uris). Native hosts must support these to enable "Gallery".
- KYC reviewer reject sends a notification to the agent (CRO) to re-upload; the agent lands in the same `/` page in AGENT role.
- Customer portal and ops portal have no handoff to the apps. Ops portal "FO Selfie Link" generates a link that is handed to the fleet owner out of band (see 4).
- Boss app and boss-portal: push notifications deep link into app screens (section 5). Articles may fire a native deeplink through a JS bridge.

---

## 4. Ops portal (tzf-ops-portal): 16-screen inventory and operations

Purpose: internal TZF FASTag ops/tech-support portal. Static HTML/JS, no backend of its own: every action is a fetch to TZF tag service, wallet service or auth service. Sign-in with Google (BlackBuck accounts) exchanged for a bearer token stored in sessionStorage (lost on tab close). **No roles or permissions**: any signed-in user can use every tab (verified; docs call it an accepted risk). Default landing: Truck Status. Environments: stress, preprod, prod via build-time config.

**Shell and patterns** (`tzf-ops-portal/index.html`, `app.js`, `styles.css`): login = centred white card "TZF Ops Portal", white "Sign in with Google" button (label "Signing in..."), inline red error. App = dark navy fixed sidebar with the 16 links and "Logout"; light grey content with h1, grey description and white form cards. Repeated pattern: **lookup card, reveal result card(s), action button, result box** (loading blue, success green, error red; plain multi-line text). Buttons disable and relabel in flight ("Checking...", "Uploading...", "Force closing..."). Switching tabs clears all inputs, selects, checkboxes, files and result boxes. Write actions chain write, best-effort refresh-status, re-read status; a refresh failure appears as a note on a success. Status pill: red (contains HOTLIST/BLACKLIST), green (ACTIVE), grey (other). Rule pill: green "Enforced" or amber "Recorded - not enforced". Toast top-right, green, 3s. Two modals only (Add whitelist, De-whitelist confirm).

| # | Nav label | Inputs | What it does | Result display |
|---|---|---|---|---|
| 1 | Truck Status | Truck Number | Reads TZF tag/status for the truck, NETC tag list, and wallet balance. "Reconcile State" reads real state from the issuer processor (M2P) and stores it in TZF, then refreshes and re-checks. | Card "TZF Status" (truck, tag ID, tag status, wallet ID, balance, wallet phone) with Reconcile button; card "NETC Status" table (tag ID, reg no, TID, class, status, issue date, bank, commercial, national permit, close date). Panels fail independently. Reconcile text: outcome, M2P state, or "nothing was changed" / "updated X -> Y". |
| 2 | Tag Control Tower | Truck Number; Status to Apply (HOTLISTED, BLACKLIST); Reason (Fastag not pasted, VRN Not Updated) | Lists all control rules on the tag; apply or lift an ISSUER rule; remove a USER (owner) toggle via DEHOTLIST. | Status strip (Truck / Tag ID / Status pill); rules table (Source, Status, Reason, Effective, Last updated, Remove; disabled for other teams' rules or no active tag). Notes: duplicate ISSUER warning; "low-balance and KYV holds are not shown here". Tag Control card hidden when no active tag. Toast "Issuer rule applied/removed." |
| 3 | KYV | Tag ID | Shows verification and lets ops upload missing documents for the agent. | Readonly Overall Status, Verification Time, Submission Deadline, Verification Expiry, Notified. Document rows: TRUCK_FRONT_IMAGE, TRUCK_SIDE_IMAGE, FASTAG_IMAGE, RC_FRONT, RC_BACK, CHASSIS_INVOICE, CHASSIS_INSURANCE with status, thumbnail and Upload. Images only, max 10 MB; upload codes 000 ok, 101 invalid file, 102 too large, 201 read error, 500 server; HTTP 400 bad tag, 409 already submitted. |
| 4 | Tag Status Refresh | Tag ID | Forces TZF to pull the latest status. | Result box. |
| 5 | Tag Closure | Tag ID, checkbox "Force close" | Closes the tag (force close uses a different transaction type, bypassing issuer-side checks per docs). | Result box. Errors: not found, cannot close while HOTLISTED/BLACKLIST, negative wallet balance, wallet lookup failure. **No confirmation modal, even for force close** (verified; flagged as a gap in the ticket docs). |
| 6 | Inventory Upload | Email, inventory file | Bulk tag inventory update. | Result text (JSON). |
| 7 | EOD Upload | Swipe data file; Dispute data file | Two end-of-day uploads. | Result text per card. |
| 8 | Fastag Details Update | Tag ID, then editable Registration Number, Vehicle Class (VC4-VC16, VC20), Vehicle Description, Commercial (Yes/No), National Permit (Yes/No), Permit Expiry | Corrects vehicle details on an issued tag. | Readonly Tag ID, TID, Wallet ID, Issuance Status, Fastag Status, Issue Date, Chassis, Engine. Body status FAILED treated as error even on HTTP 200. |
| 9 | SMS Whitelist | 10-digit phone | Checks and toggles SMS whitelist. | Readonly status; button flips "Enable Whitelist" / "Disable Whitelist". |
| 10 | Toll Plaza Upload | .xlsx/.xls | Uploads toll plaza master data. | "Toll plaza data uploaded successfully." or error. |
| 11 | Tag Issuance | Phone (lookup wallet, shows name, fills Wallet ID), Registration Number (auto-fills State Code), State Code, Chassis, Engine, Tag ID, Mapper Class (e.g. VC13), Vehicle Descriptor, Commercial, National Permit, Permit Expiry, Product ID (Truck / Car), Kit No | Manually issues a tag to a wallet. | Result box. Required fields enforced: "Please fill in all required fields." |
| 12 | Tag Replacement | Same form | Same call flagged as replacement. | Result box. |
| 13 | FO Selfie Link | 10-digit phone | Generates a selfie-capture link for a fleet owner. | Link in result box. |
| 14 | Wallet Debit | Phone (lookup shows name and balance), Amount, Transaction ID (auto 10-char, readonly), Reason (only "Wallet Closure") | Debits wallet, currently only for closure. | "Debit successful! Closing Balance / Transaction ID" or reason. No confirmation modal. |
| 15 | LFO Whitelist | "+ Add Whitelist" modal: phone (10 digits), OTP (6 digits) | OTP-bypass whitelist (phone to fixed OTP). Table (#, Phone, OTP, Action), 50 per page, Prev/Next, "Page x of y (n total)". | Toast "Successfully whitelisted <phone>."; de-whitelist confirm "Are you sure you want to de-whitelist <phone>?" No / Yes; empty "No whitelisted users found." |
| 16 | PEP Status Check | PAN (uppercased, spaces stripped) | Re-checks PEP blacklist status by PAN. Read-only; cannot place or lift blacklists. | Strip: PAN + pill (NOT_BLACKLISTED green, BLACKLIST* red, other grey, empty "Not recorded"). Failure can arrive as HTTP 200 with error text. |

Tag states seen in code and docs: ACTIVE, HOTLISTED, BLACKLIST (docs also BLACKLISTED), CLOSED. The control-rules read exposes seven statuses per a code comment, not enumerated in the repo (unverified); any other string is shown in sentence case. Separate status concepts appear on screens: TZF tag status, NETC tag status, Issuance Status, Fastag Status, KYV overall status, wallet balance, SMS whitelist flag, PEP blacklist status. Inferred lifecycle (not verified): issued/ACTIVE, then HOTLISTED/BLACKLIST via rules, low balance or KYV expiry, back to ACTIVE when lifted, then CLOSED; replacement closes the old tag and issues a new one.

Operations effects: Issue and Replace map a tag to wallet plus vehicle; Refresh and Reconcile resync TZF with the issuer; issuer HOTLIST/BLACKLIST (NETC directive, e.g. tag not affixed or VRN not updated) stops the tag working at toll plazas and ADD/REMOVE controls it; Close is blocked while HOTLISTED/BLACKLIST or wallet negative.

---

## 5. Help desk (boss-portal, `boss_help_desk`)

Java/Spring backend, thin wrapper over Freshdesk for the Boss app. Freshdesk is the system of record for tickets, conversations, solution articles and CSAT; this service reshapes, caches, localises (en, hi, ta, te, ka) and sends push. It is not live chat: "chat" is a ticket thread. README is a single line; facts below are from code (`boss-portal/src/main/java/com/zinka/bosshelpdesk`).

What the Boss user gets: Help Centre categories (logo, ordered), each leading to an article list or a quick-action screen (CALL_US, TICKET_CREATION, CALL_LOGS); HTML articles in a WebView with thumbs feedback and a trailing "My issue is not listed here" row (default action CALL); raise ticket from an article; ticket history with Open / Closed tabs; chat-like ticket thread with attachments (IMAGE, PDF, OTHERS) and reply; re-open; CSAT; call numbers; payment-issue form.

**5.1 Ticket status mapping (verified in `mapper/TicketMapper.java`, `utils/Constants.java`)**
- Six Freshdesk states: OPEN 2, PENDING 3, RESOLVED 4, CLOSED 5, WAITING_ON_CUSTOMER 6, WAITING_ON_THIRD_PARTY 7.
- The app sees only **OPEN** (open, pending, waiting on customer, waiting on third party) or **CLOSED** (resolved, closed).
- `pendingWith = "USER"` only when Freshdesk is WAITING_ON_CUSTOMER: show an "Action required from you" cue.
- `reopenTicket = true` only when Freshdesk status is RESOLVED (not CLOSED) and reopen count is under the limit of **5**; otherwise null. A re-open past the limit returns 400 "Max limit for reopening ticket is reached". Re-open sets OPEN; optional user feedback text is appended as a note.
- `expectedResolutionDate` = due date for open tickets, last update for closed. `waitingResponseDescription` = "Thanks for contacting us. Our team is working on it." (Hindi variant exists; other locales fall back to English).
- `feedbackSubmitted`: null for open tickets and for L2 "GPS Not Working" tickets (no CSAT); for closed tickets whether a CSAT rating exists; in the list it is nulled once 48 hours have passed since the last update without feedback (hide the rating prompt).
- `canSendMessages` true for open tickets. Open GPS repair tickets (from the sales service) appear in the Open list but replies are blocked ("Comments are disabled on open GPS repair tickets").
- User reply adds a note and tags the ticket "Customer Responded". Whether WAITING_ON_CUSTOMER flips back to OPEN after a reply is Freshdesk automation, not in this repo: unverified.
- User-visible diagram: OPEN (Open tab; "Action required" when pendingWith=USER) -> agent resolves -> CLOSED (Closed tab; rating prompt if feedback not submitted within 48h; "Re-open" if reopenTicket) -> user re-opens -> OPEN (max 5).
- Ticket source shown to the app: CHAT, PHONE, PROACTIVE, GTS_PORTAL or RENEWAL_BOSS (older app versions show PROACTIVE as CHAT). Page empty copy: "No tickets found" / "No freight tickets found". Agent messages show as "BlackBuck Support", user as "You".

**5.2 Categories and taxonomy**
- Categories are Freshdesk Solution Categories (name, logo, position, business filter, issue-not-listed action, contact number in a JSON description), per language. **Names are not in the repo; they live in Freshdesk.** Categories with a category-specific support number: fastag, gps, fuel, kyc, diesel and their "issues" variants, superloads; brokerage loads show only a brokerage number.
- Synthetic categories injected by app version: id 1 "I want to report a fraud" (older versions only; CALL_US + TICKET_CREATION) and id 2 "Load Payment Support" (CALL_US + CALL_LOGS, "new" badge flag; newer subtitle "Upload POD, raise a ticket and our team will help you!"; CALL_LOGS deeplink goes to the report-payment-issue profile picker). FREIGHT-business categories are hidden below a minimum app version.
- Certain GPS articles become deeplinks into a GPS repair survey (relay not working; fuel sensor not working with sub-types such as fuel level incorrect, theft alert incorrect, fuelling alert incorrect, mileage incorrect, fuel level constant).
- Ticket classification (Freshdesk custom fields): Services SL1-SL4; Freight self-serve FL1-FL2 + order id; Marketplace L1-L2; Services GTS L1-L3; Freight L1-L3; Finserve L1-L3. App-facing "category" = L1; subject comes from a DB mapping of category + article (fallback L2).
- Support numbers: "Call your relationship officer" (primary, a masked CRO number; may be absent) and "Call BlackBuck support" (secondary). No CRO or FO number resolved means no primary and the secondary is category-specific or the default (optionally rotated to an AI support line at a configured ratio).

**5.3 Payment-issue form** (Load Payment Support): question "Tell us more about your payment issue"; attachment label "Upload LR / POD / Bilty Photo"; description hint "Give details of load, issue and pending amount"; error "LR/POD/Bilty Photo Required" / "Upload any one of your document to raise a ticket"; min/max attachment and text limits are config (not read). Success: "Your ticket has been raised successfully" / "Our customer care will reach out to you shortly!" with a ticket number.

**5.4 CSAT**: 7-point rating from the app mapped non-monotonically to Freshdesk values (verified in `constants/freshdesk/enums/TicketRating.java`; do not assume numeric order). Surfaces: bottom-sheet popup (max 3 impressions per day), push action buttons thumbs-down/up, ticket screen. Popup only for the user's latest resolved ticket within 48h; duplicate gives 422 "Feedback already submitted".

**5.5 Push notification copy** (via the notification service, triggered by Freshdesk webhooks through a queue):
| Event | Title | Body | Opens |
|---|---|---|---|
| created | New Ticket Created | We are working on the issue raised. Please check ticket <id> for further details | Ticket history |
| agent_replied | Update on ticket no <id> | Our customer care team has responded to your ticket <id>. Please check the ticket for further details | Ticket thread |
| pending_with_customer | Action Required on Ticket no <id> | Please provide the information requested by our customer support agent to resolve the query | Ticket thread; re-sent via delay queue |
| sla_breached | Delay Expected in Resolution of Ticket <id> | We are taking longer than expected to resolve the issue. Our team is working on it and will update you when the issue is resolved. | Ticket thread; deferred in non-business hours |
| resolved | Boss App Query Resolved | Your query with ticket ID <id> has been resolved. Please click here to provide your feedback. | Ticket history, Closed tab |
| CSAT on resolve | How was your support experience? | Provide feedback on your recent interaction with our support team | CSAT screen with thumbs buttons (`CSAT_FEEDBACK?selected=negative\|positive`) |
Skipped CSAT: tickets with L3 "225-KYC Documents Uploaded" and L2 "GPS Not Working". Business-hours window is config (values not read).

---

## 6. Design tokens of the web surfaces (brief)

| Surface | Stack | Primary and key colours | Type / shape |
|---|---|---|---|
| tzf-customer-portal | Next 15, Tailwind 4, Ant Design 5 is the main UI kit (shadcn only accordion/tabs) | Red #D52544 CTA (53px tall), navy #0D2C40 (Recharge, headings, toast), link #0086CC, error #CD3333, success #0BBB7A, app bg #FBFBFB, border #EDEDED, grey strip #F6F6F6, active sidebar #F0F7FF; landing is black with red glow gradients | Geist Sans; title 24 bold, table 14; radius 2-4px; shadcn variables unmodified (not brand) |
| tzf-activation-web-sdk | Next 16, Tailwind 4, shadcn base-nova, inline BB Pro tokens (`common/theme/colors.ts`, `fonts.ts`) | Blue #1554F6 (CSS `--primary`) and #007AFF for submit/retry; navy text #0D2C40; secondary #5D727F / #909EA7; borders #E5E5E5; page #F6F6F6; success #0BBB7A; error #C10000 / #E53935; badge bg #FFF7E9 | 30/700 XXXL, 18/500 header, 16, 14, 12 in 400/500/700; radius 0.625rem, cards 8-12px; 56px header; 16px gutters |
| tzf-full-kyc-sdk-web | Next 15, Tailwind 4, shadcn new-york, face-api, signature pad | Tailwind blue-600 (not BB Pro blue), page gray-100, green-100/800 success banner, red-100/800 rejection banner; camera screens #1A2B3C / #2C3E50 | Geist; rounded-lg, white cards 16px padding; sticky header and footer; OTP boxes 48x48; 2-column upload grid |
| tzf-ops-portal | Plain HTML/CSS/JS | Sidebar #1A1A2E, page #F5F7FA, text #333, primary #4F8CFF, danger #E84545, secondary #6C757D; success tint #EAFBE7/#276B1D, error tint #FDEAEA/#8B1A1A, info #E8F0FE, warning #FFF8E6/#7A5A10 | System sans; monospace for tag IDs; desktop only |

No white-labelling or per-partner theming on any surface; bank/partner identity comes from server data (`icon_url`, `vendor`). Three different primary blues/reds are in play, so when mocking web screens that sit inside BB Pro, use BB Pro tokens (the activation SDK does); the KYC SDK is the visible mismatch.

---

## 7. Known gaps

- Activation form fields: labels, validations and step order of the four server-driven forms are backend JSON (bb-transformer), not in repos. Needs backend form definitions or BB Pro screenshots.
- KYC-in-iframe completion events (section 3.1) and the `salesCode`/`sales_code` mismatch (3.2): code-verified, not runtime-tested.
- `REQUEST_OTP` timeline CTA is not available on web; native-only server actions silently do nothing.
- Whether BB Pro or Boss actually embeds the activation SDK in a webview (vs external browser) or links to the customer portal is not stated in code. Webview permission grants (camera, microphone, geolocation) unverified.
- Customer portal: no empty or error states, no payment confirmation, three inconsistent support numbers, not responsive, `/Upipayment` not middleware-gated.
- Activation menu partner mark is a placeholder; real branding unknown.
- Ops portal: no RBAC, no confirmation on force close or wallet debit, tag state machine and seven control-rule statuses live in the backend (a tzf-fastag repo exists and could confirm); docs under `thoughts/` have drifted from code (treat code as truth).
- Help desk: real category and article names live in Freshdesk; config values (limits, numbers, business hours) and hi/ta/te/ka translations not read; who calls the agent-dashboard endpoints (ticket search, ticket-fields, user-response) is inferred from naming.
- KYC SDK: address-proof options, income ranges, rejection reasons and button text are server-driven; role (customer vs agent) assignment is a backend/host decision.
