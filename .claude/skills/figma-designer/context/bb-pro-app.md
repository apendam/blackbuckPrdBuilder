# BlackBuck Pro (bb-pro) - App context for PRD-to-screen design

- Source: `repos/bb-pro` at commit `f7cc17d` (React Native / Expo, React Navigation). All paths are repo-relative.
- Last verified 2026-10-15 (static code reading; nothing was run). Items marked **[unverified]** were not confirmed in code.
- Language: English only (`src/common/i18n/en.js`, `Strings.<key>`). Platform: Android-first (Play Store links, ToastAndroid, PermissionsAndroid); iOS behaviour unverified.

## 1. App at a glance

### 1.1 Boot and first route
- Boot: `index.js` -> `App.js` (providers) -> `AppNavigator` (`src/feature/navigators/AppNavigator.js`). Always starts at `SPLASH`.
- `SPLASH` (`src/feature/splash/SplashScreen.js`): logo only while loading. Not signed in -> two stacked bordered cards:
  1. Caption "For corporate business employees" + button "BlackBuck Account" (Google sign-in).
  2. Caption "For Sales and GPS executives & Partners" + button "Phone Number" -> `SIGN_IN_WITH_OTP`.
  Failure toast "Login failed please try again."
- Hard update (installed versionCode < server `min_version`): bottom card "AN UPDATE IS AVAILABLE !", 3 bullets (Fixed some bugs / Improve loading experience / Improved overall stability), button "Update from Playstore". Navigation blocked.
- Phone login: `SIGN_IN_WITH_OTP` ("Enter your mobile number", 10-digit field, "Next", T&C footer text) -> `OTP_NEW_SCREEN` ("Enter OTP", "We have sent OTP to <n>", 6 boxes, SMS autofill, "Resend in N sec" -> "RESEND", "Verify" only if server `manual_otp_allowed`). Header right = "Call us" button. Legacy `OTP_SCREEN` still registered.
- After login, `getAuthenticatedFirstRoute` (`src/common/utils/getAuthenticatedFirstRoute.js`) picks the first route via `navigation.replace`.
- No URL `linking` config. Deep links = push payload `deeplink {screen, screen_data, action, action_data}`, handled in `src/feature/navigators/HomeNavigator.js#handleNotification`; cold start uses AsyncStorage handoff and `setPendingRoute` (`NavigationUtils.ts`). Every notification-reachable screen must render from params alone (`fromNotification: true`, no back stack).

### 1.2 Personas and first route
Role flags come from `user_type` substrings in `src/common/utils/createUserInfo.ts`: seniority `is_cro` (ASO; "CRO" in UI), `is_tsl`, `is_asm`, `is_zsh/rsh/nh`, `is_fs_ce/is_fs_brm`; team `is_supply`, `is_toll`, `is_fs` (field sales: loans/collections), `is_cp` (CHANNEL_PARTNER), `is_gps`, `is_credit`, `is_cp_new` (user_type contains `CP_`), `is_demand` (none of the others). `sales_user` = cro || tsl || asm. CP_ASO is labelled **KAM** in CP contexts (`Strings.kam`).

| Persona (user_type) | First route | Home surface |
|---|---|---|
| CHANNEL_PARTNER (or empty) | `is_profile_incomplete` -> `SELECT_CP_TYPE`; else `kyc_submitted \|\| kyc_re_initiated` -> `CP_USER_PROFILE`; else hierarchy `RTL` -> `SELECT_KYC_DOCUMENT_TYPE`, else `CHANNEL_PARTNER_FLOW` (KYC home) | `CPHome` (tabs Reports / Tickets / Orders) |
| Demand ASO/TSL/ASM, CP_ASO/TSL/ASM | onboarded + home location mandatory: has `home_location` -> `PROFILE_DRAWER`, else `INCOMPLETE_PROFILE_SCREEN`; not onboarded -> `HOME` | demand: bottom tabs; CP_*: v2 app |
| SUPPLY_* | same gate; not onboarded -> `PROFILE_DRAWER` | bottom tabs |
| FS_ASO/TSL/BRM/ASM, CREDIT_TSL | onboarded + location mandatory + no home -> `INCOMPLETE_PROFILE_SCREEN`, else `PROFILE_DRAWER` | bottom tabs (Loans/Collections) |
| CREDIT_ZSH, TOLL_ASM, TOLL_ZSH/RSH/NH | `PROFILE_DRAWER` | bottom tabs |
| TOLL_TSL | location mandatory + no `work_locations` -> `INCOMPLETE_PROFILE_SCREEN`, else `PROFILE_DRAWER` (code leaves route null when not mandatory) | bottom tabs |
| TOLL_ASO | `selfie_url && home_location` -> `PROFILE_DRAWER`, else `PROFILE_PICTURE_SCREEN` | bottom tabs |
| BROKERAGE_TI/STI/DBM/POD/BD/CM, GPS, OE/CPT/GBI/other | `HOME` (+ duty status fetch) | bottom tabs inside stack with header |

- Home rendering (`ProfileDrawer`, AppNavigator.js): `CHANNEL_PARTNER` -> `CPHome`; `is_cp_new` -> `AppNavigatorV2`; collections-only FS CE/BRM (modules == [COLLECTIONS]) -> `CollectionsNavigator`; else `HomeTab`. Sales users get the side drawer and no app header; non-sales users (brokerage, GPS, CPT) get a header (BlackBuck logo left; right = duty switch for brokerage, "Call us" for GPS).
- Mimic (impersonation): when `is_mimicing`, every screen header uses the `mimic_header` colour; drawer shows "Stop mimic" + email. Include this header state for admin-assisted flows.

### 1.3 Bottom tabs by persona (non-v2; `src/feature/navigators/hooks/useCheckAgainstRole.ts`)
| Tab label (route) | Shown to |
|---|---|
| "Indents" / "Leads & Indents" when flag `enable_super_leads` (`INDENT_LIST`) | BROKERAGE_TI/STI/DBM/CM (not POD) |
| "Orders" (`ORDER_LIST`) | all brokerage users |
| "Performance" (`POD_PERFORMANCE_DASHBOARD`) | BROKERAGE_TI/STI |
| "Calls" (`CALL_LOG_LIST`, native Android call-log screen) | brokerage users |
| "Meetings" (`ASO_MEETINGS_SCREEN`: Market meetings for supply/toll, else legacy list) | CRO, not credit / FS-CE / ZSH-RSH-NH |
| "Meetings" (`TSL_MEETINGS_SCREEN`, TslView) | TSL non-credit |
| "Meetings" (`ASM_MEETINGS_SCREEN` demand / `SUPPLY_ASM_MEETINGS_SCREEN`) | ASM |
| "Loans" (`LOANS`) | `modules` contains LOANS (module-gated, not role) |
| "Collections" (`COLLECTIONS`; TSL gets team surface) | `modules` contains COLLECTIONS |
| "Reports" (`REPORTS_NAVIGATOR` "Reports 2.0" when `enableReports2_0` = (supply/toll/demand/FS_TSL) && sales_user; else legacy `ASO/TSL/ASM_REPORTS_SCREEN`; `ZSH/RSH/NH_REPORTS_SCREEN`) | sales users; hidden for FS non-TSL |
| "Tickets" (`GPS_TICKET_LIST`), "Inventory" (`GPS_INVENTORY_LIST`) | GPS users |
| "Reports" (`CP_REPORTS_SCREEN`) | FL-level GPS users |
| "Account" (`MY_ACCOUNT`) | brokerage, GPS, ZSH/RSH/NH non-credit |
- No tab applies and no LOANS module -> `HomeNavigatorFallbackScreen`: warning icon, "Unknown identity" (`unknown_identity`), "You are not authorized to use the app" (`you_are_not_authorized_to_use_the_app`), button "Logout".
- Active tab colour: `blue_primary` for sales users, `blackbuckRed` otherwise.
- **v2 (CP_ASO/TSL/ASM) has only two tabs**: "Meetings" and "Reports", plus the drawer.
- First login of the day for toll/supply CRO auto-opens `CRO_INCENTIVES` once per calendar day (HomeNavigator.js `handleFirstLogin`).

### 1.4 Side drawer (sales users; `CustomDrawerContent`, AppNavigator.js)
Order and gates (labels via `Strings.*`):
1. Profile card (avatar, name, "Sales code: <code>") -> `PROFILE_DETAILS_SCREEN` (`CP_USER_PROFILE` for CHANNEL_PARTNER). ODP block if `is_odp_enabled`.
2. "My Inventory" (accordion): "FASTags" -> `FT_INVENTORY_NAVIGATOR` ((supply/toll/cp_new/cp or any sales_user) and not fs, not demand); "Biometric devices" -> `BM_INVENTORY_NAVIGATOR` ((supply/toll) and sales_user, not fs/demand); "GPS" -> `GPS_INVENTORY_LIST` (CHANNEL_PARTNER only).
3. "Buy FASTag" (`buy_fastag`) -> `FT_ACTIVATION_NAVIGATOR`; same gate as FASTags AND flag `enable_buy_fastag`. Note: the screen header inside is titled "FT Activation" but the drawer label is "Buy FASTag" (verified in AppNavigator.js).
4. "FT Installation" -> `FT_INSTALLATION_NAVIGATOR`; same gate as FASTags.
5. "Universal search" -> `SEARCH_MARKET_LEADS`: (cp_new and cro/asm/tsl) or is_fs_brm or hierarchy CP/RTL or (fs and tsl) or (credit and tsl).
6. "KYC" -> `TOLL_KYC_NAVIGATOR`: ((cro||tsl) and (supply||toll)) or cp_new or cp.
7. "Today's plan" (TSL only; v2 uses `TodaysPlanSideDrawer`; sub-label = plan or "Day not started").
8. "Calls" (brokerage). "Start mimic"/"Stop mimic" (`is_mimic_allowed`/`is_mimicing`). "Attendance" (cro and fs) -> `CRO_REPORT`.
9. "Credit line" (everyone) -> `SEARCH_CREDIT_LINE_LEADS`.
10. "Gurukul" (LMS deep link; hidden for GPS, brokerage, CHANNEL_PARTNER).
11. "Raise a ticket" -> `GTS_PORTAL` (supply/toll/demand/cp_new/fs/cp).
12. "Coupon code" (accordion): "FASTag" -> `COUPON_CODE_NAVIGATOR` (supply/toll/cp_new/cp); "GPS" -> `GPS_COUPON_CODE_NAVIGATOR` ((cro/tsl/asm) and supply).
13. "Logout". Footer: app version + code-push version.
- Labels render through `TextWithNewLabel`, which can show a yellow "NEW" tag, but no drawer item passes `shouldDisplayNewTag`, so no NEW tag shows today (the features survey said "NEW label" for Universal search; the shell survey and code say none).

### 1.5 Feature flags and server profile flags
- Server `user_details.feature_flag` (via `src/common/hooks/useFeatureFlags.ts`, not Firebase): `enable_super_leads` (tab label + super-leads UI), `enable_buy_fastag` (drawer "Buy FASTag"), `enable_collections_fake_meeting` (collections "View all photos"), `toll_bonus_ui_enabled` (default ON unless explicitly false; incentive bonus UI), `aws_s3_base_url` (photo upload base).
- Firebase Remote Config: `bbpro_allow_rooted_device` (rooted device: toast "Rooted devices are not allowed" then exit, no designed screen).
- Profile flags: `modules[]` (LOANS, COLLECTIONS), `is_workline_onboarded_user`, `is_home_location_mandatory`, `is_toll_location_mandatory`, `home_location`, `work_locations`, `selfie_url`, `is_odp_enabled`, `plan`, `sales_code`, `min_version`.
- Server data that changes visible UI without a flag: duty status, tab counts and names, tag chips and colours, metric labels, question lists, `is_*_verification_required`, `enable_mark_presence`, geofence colour, hierarchy labels.
- Blocking overlays: "Security Check Failed" modal (`AppIntegrityBlocker`, "Please install the latest app from the Google Play Store." / "Install from Play Store", no dismiss); error boundary ("Something has gone wrong" + reload); `NoInternetWrapper` [layout unverified].

## 2. Screen map by feature

Conventions: route = key in `Constants.NavigatorKey` (`src/common/constants/index.ts`). "LSAW" = `LSApiWrapper` (loading page loader / error with reload / content). Paths are under `src/feature/` unless noted. Statuses and labels are real strings; "server" = driven by API data.

### 2.1 FT activation / TZF KYC ("Buy FASTag" for a fleet-owner customer)
Nested stack `navigators/FTActivationNavigator.tsx` (`FT_ACTIVATION_NAVIGATOR`, initial `FT_ACTIVATION_SCREEN`). Vendors in `ft-activation/constants.ts`: AXIS, TZF ("BlackBuck"), IDFC, LIVQUIK.

| Screen | Route | How reached | Purpose / key sections | States | Actions -> destination |
|---|---|---|---|---|---|
| FT Activation list | `FT_ACTIVATION_SCREEN` | Drawer "Buy FASTag" | Custom header "FT Activation"; search "Search" (10 digits auto-fires; 6-9 start = phone else truck no); cards: vendor logo, truck no or "Order Created", coloured status chip, "FO number - FO name - date" | loading, error, empty "No leads are available", pagination loader, pull-to-refresh; refetch on focus | Card -> `FT_ACTIVATION_ORDER_STATUS`; FAB "Activate new" -> `SERVER_DRIVEN_FORM` `ft_activation_add_fo_number_form` |
| Order status | `FT_ACTIVATION_ORDER_STATUS` | List card, or after forms | "Order Status", "Order ID: <id>", server-driven vertical timeline (FILLED / HOLLOW / CROSS dots, per-step CTA), bottom primary CTA from last step, optional Full-KYC banner (START_KYC / RESTART_KYC / REFRESH), sections only if `*_visible`: "Customer Details", "Vehicle Details" ("Change" if editable), "FASTag Details", "Order Details"; header "Refresh", kebab "Cancel Order" only if `order_cancellation_allowed` | LSAW, snackbars | Cancel -> sheet "Select a reason for cancellation" (Cancel / CONFIRM) -> list; Change -> server forms `ft_activation_add_customer_detail_form` / `ft_activation_add_vehicle_detail`; KYC -> `TZF_FULL_KYC`; back resets to list |
| OTP consent | `TZF_OTP_CONSENT_DIALOG` | Timeline CTA REQUEST_OTP | 3 numbered blocks "OTP Consent", "Payment", "Refund Details"; optional red note "Only min KYC is possible for this user"; button "Send OTP to <phone>" -> bottom sheet 6-digit OTP, 30 s resend, "VERIFY & PLACE REQUEST" | button spinner, sheet error text, verify disabled until 6 digits | Verify OK -> snackbar, back to status |
| Cheque details (old wallet refund) | `FT_ACTIVATION_CHEQUE_DETAILS` | Timeline CTA FT_BAL_REFUND_DIALOG | Bank card, vehicle card, "Payment Breakup" with "Total Refundable", cancelled-cheque upload tile "Tap here to upload" + sample viewer, buttons "SUBMIT" / "Cancel" | upload spinner, submit disabled until image, error sheet "Please upload a cancelled cheque to proceed." | Submit -> `FT_ACTIVATION_ORDER_STATUS` |
| Order summary | `FT_ACTIVATION_SUMMARY` ("FASTag Order Details") | Server form/earlier flow [caller unverified] | "FASTag Partner Bank", bill details + "Total Payable", coupon field "Enter Coupon Code" + APPLY (green/red message), T&C checkbox, sticky "ADD VEHICLE TO CONFIRM ORDER" | LSAW, coupon valid/invalid | Submit -> pops 2, pushes `FT_ACTIVATION_SEARCH_TRUCK` |
| Add vehicle | `FT_ACTIVATION_SEARCH_TRUCK` ("Add vehicle") | Summary | "Enter Vehicle/Chassis Number" (max 17, caps), list of the FO's trucks, add-new option | "Searching trucks...", empty "No vehicles found", validation FAIL sheet (e.g. "The truck number you entered already exists in the system.") | Select -> vehicle-detail form; owned by someone else -> `FT_ACTIVATION_CLAIM_TRUCK` |
| Claim truck | `FT_ACTIVATION_CLAIM_TRUCK` | Search truck | Clock illustration, "Claim this truck", note about Owner's Documents in Boss App, "OK, GOT IT" | full-page spinner | pop |
| Partner bank | `FT_ACTIVATION_PARTNER_CONFIG` ("Partner Bank") | Replacement summary | Radio cards (icon, name, optional "NEW"), selected card expands with bullets; "Continue" only if `enable_replacement` | LSAW | -> `FT_ACTIVATION_REPLACEMENT_SUMMARY` |
| Replacement summary | `FT_ACTIVATION_REPLACEMENT_SUMMARY` ("Replacement for <truck no>") | Market lead > truck (`TruckDetailsSurface`) | Partner bank row, optional "Priority Plus saving" banner, bill, server-labelled button deck | LSAW, verify sheet with error message | ASSIGN_FASTAG -> form `ft_activation_assign_fastag_form` |
| FASTag scanner | `FT_ACTIVATION_SCANNER` | Assign form | Shared barcode scanner, returns code | camera | back with result |
| Full KYC web | `TZF_FULL_KYC` (`tzf-full-kyc/*`) | Status banner; Toll KYC list (vendor TZF) | Full-screen WebView; Android back disabled; WebView messages ON_BACK_PRESSED / CLOSE / SUCCESS / FAILURE / gallery bridge | spinner; error "Something went wrong. Please try again." + Retry; snackbars "KYC document uploaded successfully." / "KYC process failed. Please try again." | success -> back + status refetch |

Timeline CTA types on Order Status: UPLOAD_RC, UPLOAD_INVOICE_DOCUMENTS (assign form variants), REQUEST_OTP, FT_BAL_REFUND_DIALOG, CHANGE_VEHICLE_DETAILS, ASSIGN_FASTAG, ADD_PERSONAL_DETAILS; per-step CTA can be REFRESH. Form field lists are backend config and not in the repo.

### 2.2 FASTag inventory (`ft-inventory`, `v2/sales/cp-ft-inventory`)
Drawer > My Inventory > "FASTags". Role landing: ASM -> `ASM_FT_INVENTORY`, TSL -> `TSL_FT_INVENTORY`, else `CRO_FT_INVENTORY`. CP-new users get `CPFtInventoryNavigator` (`CP_ASM_/CP_TSL_/CP_CRO_FT_INVENTORY`, header "FT Inventory"). Team pages drill to a person's CRO page.

| Screen | Route | Key sections | States | Actions |
|---|---|---|---|---|
| ASM team | `ASM_FT_INVENTORY` | Search "Search CRO/TSL by name"; summary card ("View Inventory Summary" -> sheet "FASTag Summary"); team rows with counts | loader, empty | row -> TSL/CRO page with `{iamId, name, userType, canAddFastTag}` |
| TSL team | `TSL_FT_INVENTORY` | Summary card + self card ("KAM" label) + team cards | page loader | card -> `CRO_FT_INVENTORY` |
| Person inventory | `CRO_FT_INVENTORY` | Header = name + role when viewing another person; tabs "UNUSED (n)" / "HOTLISTED (n)" / "LOST (n)"; class filter chips ("All" + server counts); FASTag cards (Lost/Hotlisted show "Reason: ..."); kebab only on own cards; FAB "Add FASTag" (scan icon) only if `canAddFastTag` | LSAW; empty "No FASTag in this group"; success snackbar from params | kebab -> sheet "Select Option" -> "Mark as lost" -> dialog "Are you sure this FASTag is lost?" No/Yes; FAB -> `ADD_FASTAG` |
| Scan | `ADD_FASTAG` | Full-screen camera with mask, "Add FASTag" + close X, hint "Scan the Barcode of FASTag here", flashlight, scanned-count chip, last-barcode toast, "Enter FASTag Barcode Manually" -> sheet "Enter FASTag Barcode Number" / "Add FASTag", footer "Proceed" | 5 s idle banner "Please align the Barcode with central box"; bad code "Please scan again"; duplicate dialog "You have already scanned this FASTag"; close with scans -> "Do you want to discard FASTags?" Go Back / Discard | Proceed -> `SCANNED_FASTAG` |
| Scanned list | `SCANNED_FASTAG` | "Ready to add FASTags (n)" with per-card delete; red "Invalid FASTags (n)"; "Discard Scan" / "CONFIRM" | loading/error, "No data found!" | CONFIRM -> back to inventory with success snackbar |

### 2.3 Biometric device inventory (`bt-inventory`)
Drawer > My Inventory > "Biometric devices" (supply/toll sales users). `BM_INVENTORY_NAVIGATOR`: `CRO_BM_INVENTORY`, `TSL_BM_INVENTORY`, `ASM_BM_INVENTORY`, `ADD_VERIFY_BIOMETRIC`, `TOLL_KYC_BB_STATUS_SCREEN`. Mirrors 2.2: team page -> person page with tabs "Active" / "Lost", empty "No Biometric device added", kebab "Mark as lost" ("Are you sure this Biometric device is lost?" No/Yes), add-device button.
- `ADD_VERIFY_BIOMETRIC` modes: add device, verify last used (stale usage triggers dialog "Verify your Biometric Device" [Verify] on Meetings home). Sheet "Select a biometric device" (Idemia / Mantra), loader "Please wait, this might take a few minutes". Failure status screens (`BBStatusScreen`): "Idemia App Not Installed" / "Mantra App Not Installed" + "Please install the app and try again" [Cancel | Install App]; "Biometric Device is not connected" + "Please connect the device and try again" [Cancel | Retry].

### 2.4 FASTag installation verification (`ft-installation`)
Drawer "FT Installation". `FT_INSTALLATION_NAVIGATOR` (and `FastagKyvNavigator`). Landing: ASM `ASM_FT_INSTALLATION`, TSL `TSL_FT_INSTALLATION` (self + "Team" + "Former Employees", "KAM" badge), CRO `CRO_FT_INSTALLATION`.

| Screen | Route | Key sections | States | Actions |
|---|---|---|---|---|
| CRO list | `CRO_FT_INSTALLATION` | Header "FT Installation"; fake search bar "Search truck number"; ticket cards (FASTag id + class badge, "FO name - truck number", tags, status + date); status NOT_UPLOADED / VERIFYING / REJECTED / NOT_SENT_TO_BANK (banner "Images not sent to bank. Please click here to upload") | empty "No FASTag pending for installation" | search -> `SEARCH_CRO_FT`; card -> ticket details |
| Search | `SEARCH_CRO_FT` | search with "Search By" options | empty "Search trucks!" / "Search FT by truck number." | -> details |
| Ticket details | `FT_INSTALLATION_TICKET_DETAILS_SCREEN` | Header FO name + "Truck Number: <no>" + green call button; "Required Photos": "Vehicle Photo with number plate: <truck no>", "FT stuck on Windshield with ID: <fastag id>", "Axle view"; per-slot add sheet (camera/gallery), "View Instructions" with "Sample Image", "Maximum size: 5 MB", chips "Photo Added" / "Not Uploaded" / PENDING / VERIFIED / REJECTED; sticky "SUBMIT" (hidden when VERIFYING) | camera-permission dialog; size error "Image size exceeds 5MB / Please try again" | back with photos -> "Do you want to discard uploaded photos?" Go Back / Discard; submit -> snackbar "Photos submitted for verification", `popTo` list |
| Upload helpers | `FT_INSTALLATION_CAMERA_IMAGE_UPLOAD`, `..._GALLERY_IMAGE_UPLOAD` | capture / pick | | |

### 2.5 Toll / FASTag biometric KYC (`sales/toll-kyc`, `navigators/TollKYCNavigator.tsx`)
Reached from drawer "KYC", lead `LEAD_KYC_DETAILS` ("FASTag Biometric KYC"), push notification.

| Screen | Route | Key sections | States | Actions |
|---|---|---|---|---|
| KYC list | `TOLL_KYC_LIST` ("KYC") | Server tabs "<tab> (count)" default PENDING; cards: customer name, server status chip, metadata, "Rejection Reason >" (sheet "Rejection Reasons"), contact block, server CTA text | error "Something has gone wrong"; empty "No data found!"; pagination spinner | CTA by vendor: TZF -> `TZF_FULL_KYC`; IDFC -> `TOLL_KYC_PREQUSITES_SCREEN`; LIVQ -> `ADD_VERIFY_BIOMETRIC` then `TOLL_KYC_LIVQ_SDK_BIOMETRIC_SCREEN` |
| Prerequisites | `TOLL_KYC_PREQUSITES_SCREEN` | Loader "Please wait, this might take a few minutes"; sheet "Select a biometric device" (Idemia / Mantra) | failure -> status screens (see 2.3) | -> OTP or Aadhaar per OTP config |
| OTP | `TOLL_KYC_OTP_SCREEN` ("OTP Verification") | Auto-sends OTP; "Enter OTP", "OTP has been sent to <n>", 6 boxes, "Resend in N sec", "Verify" | toast "Failed to Send OTP. Please resend again after 5 sec"; inline verify error | success -> Aadhaar |
| Aadhaar consent | `TOLL_KYC_AADHAAR_SCREEN` ("Applicant EKYC Biometric") | "Enter Aadhaar no" + "Confirm Aadhaar no" (12 digits, masked), checkboxes "I hereby provide my consent for T&C" (-> `TOLL_KYC_T_AND_C_CONSENT` WebView) and "I declare I have explained the KYC Process", "Initiate Aadhaar KYC" | disabled until valid | -> `TOLL_KYC_MORPHO_SCREEN` |
| Biometric capture | `TOLL_KYC_MORPHO_SCREEN` | Loader texts "Redirecting to Idemia L1 RD" / "Redirecting to Mantra RD" / "Validating with Partner Bank" | | -> `TOLL_KYC_MORPHO_STATUS_SCREEN` (success / IN_PROGRESS / failure with retry) or `TOLL_KYC_DEVICE_CONNECTION_STATUS_SCREEN` |
| LivQuik | `TOLL_KYC_LIVQ_SDK_BIOMETRIC_SCREEN`, `TOLL_KYC_LIVQ_KYC_STATUS_SCREEN` | "Redirecting to LivQuik SDK", "Validating with Partner Bank" | error "Technical Error: ID not found. Try again after sometime" | |

### 2.6 Incentives, earnings, sale history (`sales/reports/*`)
Entry: "Reports" tab (`REPORTS_NAVIGATOR`, `navigators/ReportsNavigator.tsx`; role dashboards `CRO_REPORT_DASHBOARD`, `TSL_REPORT_DASHBOARD`, `ASM_REPORT_DASHBOARD`, `DEMAND_CRO_REPORT`, ZSH/RSH/NH). Dashboard = profile card + server-driven metric card grid. Card ids -> destination: `MTD_INCENTIVE` -> `CRO_INCENTIVES`; `SALES_HISTORY` -> `SALES_HISTORY_NAVIGATOR`; `PERFORMANCE`/`MY_ATTENDANCE`/`UNIVERSAL_COVERAGE` -> `CRO_REPORT`; TSL adds `TEAM_INCENTIVE` -> `TEAM_INCENTIVES`, `ISSUANCE` -> `TOLL_ISSUANCES_REPORT`; earnings card -> `MY_EARNINGS`; optional "Exception requests" card when `exception_request_enabled`.

| Screen | Route | Key sections | States | Actions |
|---|---|---|---|---|
| Incentives | `CRO_INCENTIVES` ("Incentives", month picker top-right) | Summary banner; one card per scheme: name, outlined "View Details"/"Hide Details", nudge "Earn Rs <amt> by completing <n> more SPs", progress bar, key/value rows ("Incentives Earned" with rupee icon), expandable slab, "Doorbreakers" timeline, "Team". **Toll bonus** (flag `toll_bonus_ui_enabled`): earnings row shows total with struck-through base and (i) icon -> sheet "Calculation Breakdown" (50% snap; "Quality Payouts" "<count> x <rate> = <payout>", "Non-Quality Payouts", "New Slab Payout"); green congratulations banner under metadata | LSAW; empty "No Active Schemes" | month change refetches |
| My Earnings | `MY_EARNINGS` | Grade card, "Sale Points" progress + server banner, "Earnings break down" + sheet "Your Earnings Slab", "Earnings Calculator" | empty = server `message` or "No data found!" | |
| Sale History | `SALES_HISTORY` / `TSL_SALES_HISTORY` / `ASM_SALES_HISTORY`, `SEARCH_SALES_HISTORY` | Header "Sale History"; tabs "PENDING (n)" / "COMPLETED (n)"; server filter chips + sheets (Quality / Non-Quality enums); cards: product image, FO name, Quality/Non-Quality pill, key/values, status + points + date, optional "Upload Documents >" | empty "Nothing to show here!" | card -> detail sheet; upload -> `SALE_HISTORY_DOCUMENT_UPLOAD_CATEGORY` |
| Doc categories | `SALE_HISTORY_DOCUMENT_UPLOAD_CATEGORY` | "Please upload documents for <vehicle>"; panels "Truck KYC" > "Upload RC for Truck" (status chip, rejection remark), "Truck Owner KYC" | refetch on focus | -> RC upload / owner KYC |
| RC upload | `SALE_HISTORY_DOCUMENT_UPLOAD_SCREEN` ("Upload RC") | "Front Image" / "Back Image" slots, "Verification Pending", "SUBMIT" | discard dialog "Do you want to discard all photos?" Cancel/Discard | |
| Owner KYC | `TRUCK_OWNER_KYC_DOCS` | "Address Proof" / "ID Proof" pickers (Driving License, Aadhaar Card, Voter ID, Passport, MNREGA, PAN Card), "Truck Owner's Photo" (camera only), "Truck owner not around?" | | -> `SEND_SMS_TO_TRUCK_OWNER_SCREEN` ("Message you will be sending", mobile field, "Send SMS") |

Manager views: `TSL_SELF_REPORTS`, `TSL_TEAM_PERFORMANCE`, `ASM_TEAM_PERFORMANCE`, team attendance, `EXCEPTION_REQUESTS` ("Pending Exceptions", Approve/Reject; CRO "Apply for Exception": Absent/Half Day, reason, "Submit Request"), `CP_TEAM_VIEW` ("My Team"), month picker "Select Month". Specs: `thoughts/FRON-2312/*`.

### 2.7 Loans (`loans`, tab "Loans", nested `LoanNavigator`, route `LOAN_CONTAINER`)
- **Loans tab** (`LOANS`): header "Loan Applications" + search icon (`LOAN_SEARCH`: "Name/Phone/Application ID", "Please enter atleast 3 characters!", "No Results Found!"). Tabs from API counts: in progress / approved / rejected. In Progress = list of server pipeline stages (name, count bubble, chevron, greyed if disabled) -> `PENDING_STAGE_LOAN_LIST` (filters sheet "Filter By Status"/"Filter by CRO", Clear/Apply); empty "No Applications!". FAB "+" hidden for `is_fs_ce`, `is_credit`, `is_asm`.
- **Application hub** `LOAN_APPLICATION`: header "Loan Application" (+ id, "Created On", "TAT") and role-gated kebab ("Discard Application" [blocked after bureau retrieval], "Copy eKYC", "Copy FI", "Send back to ZCM", "Disable e-NACH", "Reject DM e-Sign", "Disable Account Aggregator"); applicant card (call, status chip); optional "Sourced By:"/"Bank Partner"/"History"; sections of step rows (server icon/colour/title/sub text, disabled if `!enabled`; CAM row has download icon; credit steps show "Inquiry No."); sticky "Submit for credit review" (`enable_submit_for_review`; confirm "Submit without Guarantor?" Yes, Submit / No, Go Back); CRO-empowered branch = sheet with Approve/Reject. States: loader, pull-to-refresh, `ReloadDataView` "Something has gone wrong".
- Step -> route (`loans/constants.ts STEP_ROUTE_MAPPING`): APPLICATION_DETAILS -> `LOAN_APPLICATION_DETAILS_FORM` ("Application Details"; names, contact, truck cards via `TRUCK_ADD_EDIT_FORM` "Add Truck"); LOAN_DETAILS -> `LOAN_DETAILS_FORM` (loan type, customer category, amount, IRR, tenure, CP sourced, deal background; sheet "EOT Norms not met" [Proceed Anyway]); APPLICANT_BUSINESS_PROFILE -> `APPLICATION_BUSINESS_PROFILE_FORM`; *_CREDIT_CHECK -> `APPLICATION_BUREAU_REPORT` (PAN/Aadhaar-QR/DL/Voter ID, "Proceed to Report Retrieval", `ALTERNATE_NUMBER_SCREEN`, `OTP_SCREEN_CIBIL` "Enter OTP from Credit Bureau", `CIBIL_PULL_LOADING_SCREEN`, submit without report); docs / FI / valuation / VE -> `DOCUMENT_LIST` (camera, preview Retake/Keep, per-asset retry sheets); `VIDEO_FI_AVAILABLE_AGENTS` ("Select Representative"); `VIABILITY_FORM`; SANCTION_DETAILS_FORM -> `PRE_SANCTION_LOAN_DETAILS` (basic info, charges, cross-sell, waivers + justification, "Calculate", "Submit", toast "Loan Details Submitted for Review") -> `KYC_DOC_PDF_GENERATION`; `DOWNLOAD_DOC_LIST`; POST_SANCTION_DIGITAL_DOCS -> `DIGITAL_DOC_LIST` (e-sign, e-NACH via Digio, `NACH_MANDATE`); `DISBURSEMENT_MEMO` + `ACCOUNT_HOLDER_FORM` (penny-drop "Verifying Account Details" / "Account Verification Failed" Okay/Retry); `APPLICATION_HISTORY_LIST`. Applicant verification: `CONSENT_OTP_SCREEN`, `AADHAAR_SCREEN`, `MORPHO_SCREEN`, Axis/Shivalik eKYC.
- Servicing (root stack): `REQUEST_FOR_REPOSSESSION` ("Raise New Request", "Submit for review"), `OTHER_BILLS`, `SALE_BIDS_SCREEN` ("Bids for Sale", "+ Add New Bid"), `FORECLOSURE_LETTER`.
- **Credit line** (drawer "Credit line"): `SEARCH_CREDIT_LINE_LEADS` ("Search Leads", "Search by Phone No."; card "Credit Line Activated" or "Activate Credit line") -> `CREDIT_LINE_KYC_SCREEN` (WebView SDK) -> `CREDIT_LINE_KYC_STATUS_SCREEN` ("Send Mandate Setup Link") -> `CREDIT_LINE_EMANDATE_STATUS_SCREEN` ("Verifying E-Mandate - Please wait...", "Re-send Mandate setup link", "Done").
- Many forms use `FORM_V2`/`DYNAMIC_FORM` (config-driven; see section 4) and `SERVER_DRIVEN_FORM`.

### 2.8 Collections (`collections`, tab "Collections"; collections-only CE/BRM home = `COLLECTIONS_CONTAINER`)
| Screen | Route | Key sections / states | Actions |
|---|---|---|---|
| CRO list | `CRO_COLLECTIONS` | Header "Collections"; "Search for customers" + "Filter" sheet; "Map View" card; `LoanCard` (LAN, customer, EMI, "PTP: <date>", badge "Meeting Ongoing"); empty "No data found!" / "No result found for ..."; next-page "RETRY" | card -> LAN details; map -> `COLLECTIONS_LAN_MAP_VIEW` |
| TSL team | `TSL_COLLECTIONS` -> `LAN_LIST` | Employee cards ("EMI Pending", "Pre-EMI Follow-up Required") | -> employee's LANs (`iamId`) |
| LAN details | `COLLECTIONS_LAN_DETAILS_SCREEN` | Customer card + call, "Co-Applicant Details", "Guarantor Details", "Truck Details", "EMI Details" + "View Breakup" sheet, "Recent Meeting" + "View History" (`COLLECTIONS_VIEW_HISTORY`), CTA "Start Meeting"/"Resume Meeting"; blocker text "You are already in another meeting, please complete it to start a new one"; `LAN_CONTACT_FORM` "Add New Contact" ("Save Contact") | -> `COLLECTION_MEETING_FORMS`; menu to repossession / sale bids |
| Meeting form | `COLLECTION_MEETING_FORMS` | Metadata (customer, phone, call vs visit, location "Verified" / "Not Verified" / "Verifying" + Retry), dynamic questions (checkbox, date, dropdown, image upload Upload/Verify/Verified/Reupload/Retry, text); footer "Cancel Meeting" (reason sheet "Reasons for cancelling meeting") / "End Meeting" (enabled when valid); modal "Meeting logged" / "Meeting cancelled" 2 s; menu "View all photos" only with `enable_collections_fake_meeting` | -> back |
| Meeting details | `COLLECTIONS_MEETING_DETAILS_SCREEN` | Read-only "Call Meeting Details"/"Visit Meeting Details", selfie, Q&A, recording, "Mark Your Presence" -> "Presence Marked" | |

### 2.9 Brokerage (indents, orders, search, ratings; Redux+saga screens)
| Screen | Route | Key sections / states | Actions |
|---|---|---|---|
| Indent tab | `INDENT_LIST` | Filter bar (search -> `UNIFIED_SEARCH`, `FILTER`); tabs "Ongoing"/"Past" or with `enable_super_leads` "Supply" + "Ongoing"; `IndentItem` cards (tons/trucks, price per ton/truck, badges Paused / Blacklisted / New, "New Lead(s) and Call(s)"); empty "You have no indents available" | -> `INDENT_DETAIL_SCREEN`; create -> `CREATE_INDENT_NAVIGATOR` |
| Create indent | `CREATE_INDENT_NAVIGATOR` | "New Indent" form: Booking Office, Loading/Unloading point, Material, Truck Preference, "Price & Payment Terms" sheet, Load expires, Primary/Secondary POC; "Post Indent"; result sheet "Indent posted successfully" [Done] / "Indent posting failed" [Ok]. Form persisted (see 4.5) | |
| Indent detail | `INDENT_DETAIL_SCREEN`, `PRIMARY_INDENT_DETAILS` | Booking Office, points, product, loads, payment mode, price, expiry, POCs; header actions "Edit Indent", "Cancel Indent", "Raise Ticket", "Share" | `EDIT_INDENT`; bids |
| Bids | `BidListScreen`, `BidDetailScreen`, `REJECT_BID` | "View Bids for <n> Bid(s)"; empty "No Bids found yet"; badges "New", "Negative Ledger Balance", "Truck Available", "Lane Match", "Truck Match"; "Call Now", "Reject Bid" (-> "Reason for Bid Rejection"), "Accept Bid" | accept -> `CREATE_ORDER_NAVIGATOR` ("Booking Details") |
| Orders | `ORDER_LIST` | Search "Search by Order ID", filter, sort sheet; scroll tabs "Created", "Confirmed", "Loading", "In Transit", "Unloading" (counts, 99+); cards (id, route, truck, "New Task(s)", "Unresolved Issues"); banners "Go on duty to start receiving tasks" / "<n> orders have unassigned tasks" + Dismiss; duty switch "On Duty"/"Off Duty" | -> `ORDER_DETAIL` |
| Order detail | `ORDER_DETAIL` ("Order ID : <id>") | Menu (Instructions, Share, Raise Ticket, Cancel Order); route, live map (Map/Satellite, Live/Overview), "Active Tasks" + "View Task Activity", SP deductions (Damages / Shortages / Transit penalty), docs (Loading / Unloading with "VERIFY AND SUBMIT"), contacts (Call Now), ETAs, pricing, adhoc charges; sticky task CTA; blocking error e.g. "Can't mark loading complete: Loading document upload is mandatory to mark loading complete."; snackbars "Task submitted successfully." | cancel sheet "Are you sure you want to cancel this order?" NO / "Yes, Cancel" + reason; `RAISE_ISSUE`; `EDIT_TRUCK`; `ORDER_TRUCK_KYC_NAVIGATOR` |
| Unified search | `UNIFIED_SEARCH` | Categories sheet (indent by ID, order by ID, FO by phone, FO by truck, BO by name); `FO_DETAILS` ("Add Truck") | |
| POD / ratings | `POD_CONTAINER`, `RATING_SCREEN`, `PENDING_FEEDBACK_LIST` ("Pending Reviews") | POD tabs "My Summary"/"My Team", "Add POD Update"; rating reasons (truck/lane/price mismatch, truck not available, load expired, others) from server | status screen after submit |

### 2.10 GPS tickets, orders, coupons (`gps-tickets`, `gps-orders`, `gps-coupon-codes`, `coupon-codes`)
| Screen | Route | Key sections / states | Actions |
|---|---|---|---|
| Ticket list | `GPS_TICKET_LIST` (tab "Tickets") | Search "Search by Truck No.", filter; tabs "Open Tickets"/"Closed Tickets"; banner "Pending Ticket" count; cards ("Installation due today", "Installation pending since N day(s)", "Call FO"); empty "No tickets available" / "No Matching Results Found" | banner -> `GPS_PENDING_TICKETS` |
| Pending tickets | `GPS_PENDING_TICKETS` | One-at-a-time Accept / Reject (reason sheet); errors "Ticket Acceptance Failed", "Ticket Rejection Failed" [Okay / View Ticket Again]; end "No Actionable Tickets" | |
| Ticket details | `GPS_TICKET_DETAILS` | Status "Activation In Progress", ID, FO, appointment, address, payment/dues, device info, contact buttons, collect-dues alert, accordion "Installation Steps"/"Service Steps" | start guided flow |
| Guided flow | `GPS_GUIDED_FLOW` (header "<truck> GPS", Reload + "Call us") | Step wizard by ticket type. Install: "Enter IMEI number" -> "Connectivity check" (soft/hard reset) -> "Power check 1/2" -> "Location check" -> "Relay check" -> optional "Panic Button Check", "VN Config", "IP Config" -> "Installation photos" -> "Device Activated Successfully". FASTag ticket: scan barcode -> photo -> "Enter Delivery OTP" -> "FASTag Assigned Successfully". Fuel sensor flows (calibration, pairing). Failure: "IMEI not eligible", "Device Not Responding", "Unable to get GPS location / Please move truck to get better GPS signal", "Exit" + call partner support; "Skip for now" on some steps; progress persisted server-side | |
| GPS inventory | `GPS_INVENTORY_LIST`, `SCAN_GPS`, `SCANNED_GPS` | Mirrors FASTag inventory (Unused / Lost tabs, scanner) | |
| GPS orders (CP) | `GPS_ORDERS_CREATION`, `GPS_ORDER_STATUS_SCREEN`, `GPS_ORDER_SUBMIT_DUCUMENT_SCREEN`, `VLTD_COMMANDS_SCREEN` | List: search "Search by FO Phone Number", "Create Order", cards ("Order ID : <id>"). Wizard "Create Order": "Phone Number" -> "User Details" -> "Plan Selections" (IMEI 15 digits); leave dialog "Entered data will not be saved..." No/Yes; success "Order Created Successfully". Status timeline + "Download Certificate" sheet; VLTD "Send" rows with ack states, "Mark as complete" | |
| FASTag coupons | `COUPON_CODE_NAVIGATOR`: `CAMPAIGN_LIST_SCREEN` ("Select Campaign"; empty "No Campaigns yet!"), `COUPON_CODE_SURFACE` ("Budget Available", status tabs, "Create New" -> server form `create_coupon_form`), `COUPON_SEARCH` | Approver sheet: "Approve Coupon" ("Are you sure you want to approve this coupon?"), "Reject Coupon", "Delete Coupon"; toasts "Coupon request approved/rejected successfully!" | notification can open sheet via `entity_id` |
| GPS coupons | `GPS_COUPON_CODE_SURFACE`, `GPS_COUPON_CODE_CREATION` | "Coupon Codes", "No coupons yet!"; wizard FO mobile -> vehicle/chassis -> RC upload -> plan/coupon -> "Generate Coupon Code" -> toast "Coupon requested successfully!"; exit dialog "Your progress will be lost" | |

### 2.11 Field sales and meetings, v1 (`sales/market`, `sales/meetings`, toll attendance)
- Market meetings (supply/toll CRO; `ASO_MEETINGS_SCREEN`): tabs "Find (n)" / "Completed (n)" / "Scheduled (n)". Find: search "Search leads/customers", "Filter" sheet, meeting cards (distance, "Yet to meet"); not found "Lead not found! Do you want to add this lead?" [Add Lead] -> `ADD_LEAD_SCREEN` ("Lead Details": contact, name, business, address + map picker; "Save" / "Save & Start Meeting"). Completed: "Map View" card -> `COMPLETED_METINGS_MAP_VIEW`; empty "No meetings done yet!". Scheduled: reschedule/cancel sheets.
- Lead details `LEAD_DETAILS` (v1, `sales/market/lead-details`): name + LEAD/CUSTOMER badge, address + distance, "MTD Meetings", last-meeting block, asset counts, ARP card, KYC entry (`LEAD_KYC_DETAILS` -> 2.5), trucks list (badges "No FT", "No GPS") -> `ASSET_DETAILS` (FASTag/GPS details, "All Transactions" with chargeback statuses "Chargeback Initiated" / "Pending with bank" / "Chargeback Paid" / "Chargeback Rejected", `TRUCK_DETAILS_MAP_VIEW`, replace FASTag -> 2.1). Footer "WhatsApp" / "Call Now" / "Start Meeting" or "Save & Start Meeting".
- Meeting execution: `ADD_MEETING` -> location verify (RETRY timer) -> meeting code ("Enter meeting code") -> photo capture ("Take a selfie with your face clearly visible", shop/FO photos) -> questions ("Whom did you meet?") -> `LOAD_SCREEN` / `SUBSCRIPTION_SCREEN` (summary; Edit / Start / Cancel / End Meeting). `SHIPPER_PROFILE_SCREEN` for demand.
- Toll attendance: on/off duty = `CHECK_ATTENDANCE_GEOFENCE_SCREEN` -> `TAKE_SELFIE_ATTENDANCE_SCREEN` ("Take a selfie with Toll plaza in background to go on duty"). TSL check-in `TOLL_CHECKIN_GEOFENCE` / `TOLL_CHECKIN_SELFIE`; check-out `TOLL_CHECKOUT_GEOFENCE` / `TOLL_CHECKOUT_SELFIE` / `TOLL_CHECKOUT_FORM` ("Checkout Form"; success "Check Out Successful"). Off duty blocks meetings ("Go on duty to create meetings").
- Team views: TSL `TslViewScreen` (tabs "Team"/"Meetings", CRO list segmented On Duty / Off Duty / All), ASM `AsmViewScreen` (search "Search CRO/TSL by name"; "Day not started", "Today's plan") [detail not read].

### 2.12 CP onboarding and KYC (`sales/channel-partner`)
Server-driven wizard (`GET_NEXT_STEP` returns `type`, `step_label` "Step x/y"), with "Save & Continue Later". Sequence:
1. `SELECT_CP_TYPE` ("Select Partner type"; Business / Individual lists).
2. Referral step: `ENTER_SALES_CODE` / `ENTER_REFERRAL_CODE_WITH_PARTNER_TYPE` / `ENTER_INSTALLATION_FREELANCER_CODE` (error "Invalid referral code!", Back/Next); installer path `SELECT_INSTALLER_TYPE`, `INSTALLER_ENTER_MOBILE_NUMBER`, `INSTALLER_VERIFY_OTP`.
3. `CREATE_CP_PROFILE` ("Profile Details": selfie, name, business name, business type via `CP_BUSINESS_TYPE_LIST`, location + map picker, Continue); FS variants `FS_CREATE_CP_PROFILE`, `FS_BANK_LIST`.
4. `CHANNEL_PARTNER_FLOW` (KYC home: "Complete Instant KYC", "Takes less than 3 minutes", "Complete KYC"; installers "Skip for now"; retailers -> `SELECT_KYC_DOCUMENT_TYPE`).
5. KYC steps: Aadhaar DigiLocker (`KYC_STEPS`; failure "Unable to verify digitally ?" -> `CP_MANUAL_AADHAR_FAILURE` front/back upload, `CP_VIEW_EXAMPLE`), PAN (`CP_PAN_VERIFICATION`; mismatch "PAN name does not match name in Aadhaar" [Try with a Different Aadhaar Number]; manual `CP_PAN_MANUAL_VERIFICATION`), office photo (`CP_STORE_PHOTO`), bank (`CP_BANK_ACCOUNT_DETAILS`: holder, account 9-18 digits, re-enter, IFSC 11 chars, cheque photo). Back sheet "Your onboarding is incomplete" [Save & Continue Later | Restart KYC].
6. Status "Verification in progress" [Continue to Profile] -> `CP_USER_PROFILE` (avatar, role, business, sales code, KYC status block Verified / "Verification Failed" [RE-UPLOAD DOCUMENTS] / "Verification in progress" [VIEW STATUS], "Your Relationship Officer" Call/WhatsApp, "Your Documents").
7. Home `CP_HOME` tabs "Reports" (default), "Tickets", "Orders" (only `is_cp`); FASTag inventory via drawer (`CP_FT_INVENTORY`).

### 2.13 Sign-in, onboarding gates, profile, account
- Sign-in screens: see 1.1. Onboarding gates (headerShown false): `INCOMPLETE_PROFILE_SCREEN` (red badge "Profile setup incomplete", checklist "Toll location" / "Home Location" with green check / red close, "You'll be able to login once these are updated.", "Please contact admin team for further assistance.", [Logout]; dead end, admin fixes data); `PROFILE_PICTURE_SCREEN` ("1/2: Profile picture", "Take a selfie with your face clearly visible", Take/Upload Selfie, Continue); `HOME_LOCATION_SCREEN` ("2/2: Home Location", "Home location setup", Back / Continue -> `GOOGLE_MAPS_PICKER_SCREEN` with "Search Location", "Current Location", CONFIRM; denial snackbar "Please give location permissions to proceed").
- `PROFILE_DETAILS_SCREEN` (Name, Phone, Zones, Regions, Shift, Work Location(s), Home Location + "Set home location", selfie). `MY_ACCOUNT` (tab "Account": App Version, "My Customer Details", "My Team", "My Warehouses and Roles", home location, Start/Stop Mimic, "Logout"). Account deletion sheet "Account Settings" > "Want to Delete your account" (30-day retention text; Cancel | Delete). `MIMIC` screen (impersonate by email).

### 2.14 v2 sales modules (`src/v2/sales`, new CP sales force CP_ASO/TSL/ASM; `AppNavigatorV2`)
Shell: Stack `HOME` (tabs "Meetings", "Reports") + stack screens. Meetings stack header (all roles): hamburger, "Meetings", `DutySwitch` ("On Duty" green / "Off Duty" red). Initial route: ASM -> `ASM_MEETINGS_SCREEN`, TSL -> `TSL_MEETINGS_SCREEN`, else `CRO_MEETINGS_SCREEN`. Data states everywhere: LSAW (loading / error + reload / content); lists 20 per page; fetch carries device lat/long; sort default DISTANCE. Route names `HOME`, `LEAD_DETAILS`, `GOOGLE_MAPS_PICKER_SCREEN`, `ASM_/TSL_MEETINGS_SCREEN` collide with v1; inside v2 the v2 screens win.

| Screen | Route | Key sections | States | Actions -> destination |
|---|---|---|---|---|
| CRO meetings | `CRO_MEETINGS_SCREEN` | Top tabs "<NAME> (<count>)" from server: FIND, COMPLETED, SCHEDULED (default Find) | LSAW | per tab below |
| Find | (tab) | Search "Business name or phone" (500 ms), "Filter" pill (blue when active), lead cards ("MTD Meetings: <n>", "<d> Km", business, contact, server tag chips, sales-point metrics), FAB "ADD LEAD" (disabled off duty; hidden in drill-down) | empty "No leads are available" | card -> `LEAD_DETAILS`; FAB -> `ADD_LEAD`. Filter sheet (70%): "Filter by user type" All/Lead/Partner/Retailer; "Filter by tag" Super/Micro/Mega; "Filter by Sale point" 4+ SP, 2 - 3.5 SP, 0.5 - 1.5 SP, 0 SP; "Sort by" SP High to Low / Sp Low to High; Clear / Apply. Rules: Lead disables all other groups; choosing a sale-point/sort auto-selects Partner |
| Scheduled | (tab) | Day-grouped cards (time, duration, "<n> Km", "Joint meeting", ONGOING) | empty "No meetings scheduled yet!" + "Create one from add option below" | ongoing -> `LOAD_MEETING_SCREEN` (off duty: modal "Meeting not allowed" / "Go on duty to be able to log meetings"); other -> details sheet with directions, "Cancel Meeting" (confirm "Are you sure you want to Cancel this meeting." No, Thanks / Ok), WhatsApp / Call Now / Start Meeting |
| Completed | (tab) | Date strip (3 months back, not future), cards, floating "MAP VIEW" | empty "No meetings done yet!" / "Complete any meeting to see it here." | card -> `MEETING_DETAILS`; map -> `COMPLETED_MAP_VIEW` |
| Lead details | `LEAD_DETAILS` ("<Lead\|Partner> Details") | Business, contact, type, address + directions, "MTD Meetings", meetings table, "Onboarding Date", "Performance" tables, previous meeting + collapsible "Meeting Notes" (VIEW/HIDE); sticky WhatsApp / Call Now / Start Meeting | LSAW | Start -> `LOAD_MEETING_SCREEN`; error snackbar |
| Meeting details | `MEETING_DETAILS` | Map (meeting + TSL markers, geofence circle green/red for TSL viewers), business, tags, time, follow-up, "Selfie", "Store / Partner Photo", notes, comments; viewers with `iamId`: icon buttons + "Mark Your Presence" -> "Presence Marked" (ASM first goes via `TOLL_CHECKOUT_SELFIE`) | LSAW | |
| Map view | `COMPLETED_MAP_VIEW` ("Map View") | Full map + draggable panel (35-63%): date strip, metrics, timeline Off Duty / numbered meetings / On Duty / Home | empty "No meetings done" / "Log meetings to see them here" | row -> `MEETING_DETAILS` |
| Pre-meeting | `LOAD_MEETING_SCREEN` ("Onboarding Meeting" / "Retention Meeting", back removed) | Business name, Phone no.; location block "Distributor Store location *" Verifying / Verified / Not Verified + Retry; "Selfie" (+ Verify / Verifying / Verified / Reupload); "Lead Photo & Shop Photo" (up to 4 tiles; >= 2 required); footer "Cancel Meeting" / "Save and Proceed" (disabled until rules met) | toasts "Task cancelled" | -> `ONBOARDING_MEETINGS_FORM` or `RETENTION_MEETINGS_FORM` |
| Meeting form | `ONBOARDING_MEETINGS_FORM`, `RETENTION_MEETINGS_FORM` | Server questions by `option_type` (YES_NO pills, RADIO, MULTI_CORRECT, TEXT_INPUT, NUMERIC_INPUT, DATE; red `*` required); onboarding: `RETAIN_LEAD` = YES reveals `SCHEDULE_FOLLOW_UP`; YES reveals "Meeting date" (today..+6 days) and "Meeting time"; "Additional Comment"; footer "Cancel Meeting" (confirm) / "End Meeting" (disabled until valid) | toast "Please select a future date"; success modal "Meeting logged" 2 s | CRO -> `CRO_MEETINGS_SCREEN`; CP ASM/TSL -> `HOME` + `USER_MEETINGS` |
| Add lead | `ADD_LEAD` ("Add New Lead") | Radio "Lead"/"Retailer" (retailer: "Select Distributor of the retailer" -> `DISTRIBUTOR_TYPES`), "Contact no" (10 digits, server uniqueness error), "Contact name", "Business name", "Partner type" (-> `CATEGORY_TYPES`), "Business type" radios (+ "Other role"), "Business location" (-> map picker, then "Change Location"); footer "Save" / "Save & Start Meeting" (disabled while a meeting is ongoing) | "Invalid location!"; success modal "Lead Added" 2 s; snackbar "Lead could not be added" | |
| Pickers | `CATEGORY_TYPES` ("Select Partner type"/"Select Business type", list, no search), `DISTRIBUTOR_TYPES` (header "Distributors", "Search Distributor by name or number", blank empty state) | | | return to `ADD_LEAD` |
| TSL home | `TSL_MEETINGS_SCREEN` | Duty-count strip (server count + label), self card, CRO `UserCard`s (avatar with green/red dot, name, `by_line_text`, `metric_value`) | two LSAW blocks | card -> `USER_MEETINGS` (CP_ASO shown as "KAM") |
| ASM home | `ASM_MEETINGS_SCREEN` | Own duty card, count strip, search "Search KAM by name" (CP_ASM), accordion of TSLs expanding to CRO cards | empty "CRO/TSL not found!" | -> `USER_MEETINGS` |
| Drill-down | `USER_MEETINGS` ("<hierarchy> Details") | User card (call/WhatsApp for CRO) + CRO surface scoped to `iamId`; no FAB, no cancel/start | | |
| OJT form | `OJT_FORM` ("OJT Form - <date>") | Employee strip, server questions, "Any Remarks?", "SUBMIT"; shown when a TSL goes on duty and last OJT not filled | | on duty -> `TSL_MEETINGS_SCREEN` + Today's Plan sheet |
| Today's plan sheet | (bottom sheet) | "Today's plan" radio list, "Cancel"/"Next" or "Confirm"; plan 0 step 2 "Make sure CRO is available for market visit"; confirm dialogs ("Todays Plan selected" ... Cancel / Ok); error snackbar "Going On duty is only allowed once per day" | | |

## 3. Key flows (F = failure branch)
1. **Login (phone).** Splash -> "Phone Number" -> enter 10 digits -> "Next" -> OTP (6 boxes, auto-fill) -> `SPLASH` re-routes by persona (1.2). F: wrong OTP (inline red text); no SMS (countdown then "RESEND"; manual entry only if `manual_otp_allowed`); below min version (hard-update card); integrity fail ("Security Check Failed" modal); missing profile data -> `INCOMPLETE_PROFILE_SCREEN` (dead end, Logout only).
2. **Toll ASO first-time setup.** Login -> `PROFILE_PICTURE_SCREEN` (1/2) -> `HOME_LOCATION_SCREEN` (2/2) -> map picker -> CONFIRM -> `PROFILE_DETAILS_SCREEN`. F: location permission denied (snackbar).
3. **Buy FASTag for a customer (2.1).** Drawer "Buy FASTag" -> list -> "Activate new" -> form (FO mobile) -> summary (bank, bill, coupon, T&C) "ADD VEHICLE TO CONFIRM ORDER" -> add vehicle -> vehicle / customer / RC forms via status-timeline CTAs -> OTP consent -> "VERIFY & PLACE REQUEST" -> customer pays in own BlackBuck account -> activation. F: coupon invalid; vehicle exists (sheet); truck owned by another -> claim; wrong OTP; cancel only if `order_cancellation_allowed`; KYC failure snackbar.
4. **Replace FASTag / change bank.** Lead > truck > replace -> replacement summary -> (partner bank picker, only `enable_replacement` banks) -> proceed (verify sheet) -> ASSIGN_FASTAG -> assign form; refund: cheque upload -> status. F: server error in sheet.
5. **Add FASTags to inventory.** Drawer > My Inventory > FASTags -> own page -> "Add FASTag" -> scan / manual -> "Proceed" -> scanned list -> "CONFIRM". F: duplicate dialog, invalid list section, discard dialogs, mark-as-lost via kebab.
6. **FASTag installation evidence.** Drawer "FT Installation" -> (TSL/ASM pick person) -> ticket -> 3 photos (camera/gallery, 5 MB) -> "SUBMIT" -> status VERIFYING. F: REJECTED per-photo; NOT_SENT_TO_BANK banner; discard dialog; camera permission dialog.
7. **Biometric toll KYC (IDFC).** Drawer "KYC" -> PENDING card CTA -> prerequisites (device + RD app) -> OTP -> Aadhaar x2 + consents -> RD fingerprint -> "Validating with Partner Bank" -> status -> list. F: app not installed / device not connected (Cancel / Install App / Retry); OTP errors; vendor branches TZF (web KYC) and LIVQ (SDK).
8. **Incentives with toll bonus.** Reports -> "Incentives" card -> month picker -> scheme card (struck-through base + total + (i)) -> "Calculation Breakdown" sheet. F: empty "No Active Schemes"; flag off hides bonus UI.
9. **Sale-history KYC docs.** Sale History > card > "Upload Documents" -> Truck KYC (RC front/back -> SUBMIT) and/or Owner KYC (ID + address proof + selfie, or SMS link). F: rejection remark per doc; discard dialog.
10. **New loan to sanction (2.7).** Loans > In Progress > "+" -> application hub -> details -> loan details -> business profile -> credit checks (bureau OTP) -> verification -> docs/FI/valuation -> "Submit for credit review" -> pre-sanction -> digital docs (e-sign, e-NACH) -> disbursement memo. F: EOT norms sheet; bureau failure (submit without report); e-NACH failure (retry or physical form); e-sign failure; discard blocked after bureau; CRO-empowered inline approve/reject.
11. **Collections visit.** Collections -> search -> LAN card -> LAN details -> "Start Meeting" -> form (call/visit, location verified, questions, photos) -> "End Meeting" ("Meeting logged"). F: "Cancel Meeting" with reason; ongoing meeting -> "Resume Meeting"; location "Not Verified" -> Retry.
12. **Brokerage indent to order.** Indents -> create ("Post Indent") -> leads/bids -> "Accept Bid" -> create order -> Orders (Created -> Loading -> In Transit -> Unloading) -> docs "VERIFY AND SUBMIT". F: bid rejected with reason; order cancelled with reason; missing mandatory doc blocks task; off-duty banner; app-kill resume of saved form (4.5).
13. **GPS install job.** Tickets -> pending banner -> Accept / Reject(reason) -> details -> guided flow (IMEI -> connectivity -> power -> location -> relay -> photos) -> "Device Activated Successfully". F: IMEI not eligible; reset failed; poor GPS signal (Exit / call support); config "Device Not Responding"; "Skip for now".
14. **CP onboarding.** `SELECT_CP_TYPE` -> referral code -> profile -> KYC (Aadhaar DigiLocker, PAN, office photo, bank) -> "Verification in progress" -> `CP_USER_PROFILE`. F: invalid referral; DigiLocker failure -> manual upload; PAN/Aadhaar mismatch; back-out sheet (Save & Continue Later / Restart KYC); verification failed -> re-upload.
15. **v2 CRO meeting (2.14).** Go On Duty (switch) -> Find -> lead -> "Start Meeting" -> `LOAD_MEETING_SCREEN` (location + selfie + >= 2 photos) -> "Save and Proceed" -> form -> "End Meeting" -> "Meeting logged" -> Completed. F: off duty (modal "Meeting not allowed"); one ongoing meeting only (disables "Save & Start Meeting"); no back arrow, only Cancel Meeting; "Please select a future date"; verification Not Verified -> Retry.
16. **v2 TSL day start.** Flip duty switch -> OJT form (if last unfilled) -> "SUBMIT" -> Today's plan sheet (plan, optionally CRO) -> confirm -> team list. F: "Going On duty is only allowed once per day".

## 4. Server-driven UI (`src/feature/dynamic-screen/*`)

### 4.1 Action types (verified in `types.ts` and `hooks/useServerActionHandler.ts`)
Response envelope `{success, message, data, actions[], meta_data?}`; each action `{type, params?}`, run in order, each awaited. No `actions` -> success: Android toast `message` (default "Successfully Submitted") and optional navigate-back after 1.5 s; failure: toast `message`. Failures may carry actions.

**The code has 11 action types, not the 8 in `docs/README_server-driven-actions-on-response-docs.md`:**

| Type | Behaviour |
|---|---|
| `SHOW_ALERT` | Opens a **bottom sheet** (`DynamicBottomSheet`), not a dialog (verified: handler calls `onShowAlert`, `ServerDrivenFormScreen.tsx` renders `<DynamicBottomSheet>`; the doc's "alert dialog" is wrong). Icon by `iconType`: SUCCESS (default, green check) / ERROR, FAILED, FAILURE ("suspicious" illustration) / WARNING / INFO; title default "Alert"; buttons `params.buttons[{text, onPress}]` (default "OK" -> `CLOSE_ALERT`), stacked, last = filled |
| `NAVIGATE_BACK` | `goBack()` |
| `NAVIGATE_BACK_WITH_DATA` | navigate to previous route (or `params.screenName`) with `merge: true` and `params.data` |
| `NAVIGATE_TO` | **pops the current screen, then navigates** to `params.screenName` with `params.data` (adds `fromServerForm: true`) |
| `NAVIGATE_TO_PUSH` | `push` (keeps current screen) |
| `RESET_NAVIGATION` | `CommonActions.reset({index, routes[{name, params}]})` |
| `SHOW_TOAST` | `ToastAndroid` short/long; iOS falls back to a system Alert; waits 1.5 s before next action |
| `SHOW_BOTTOM_SHEET` | calls `route.params.showBottomSheet({type, data})` only if the opener supplied it; otherwise nothing |
| `REFRESH_DATA` | calls `route.params.refreshData(data)` if provided |
| `REFRESH_SCREEN` | refetches the form config |
| `MAKE_API_CALL` | calls `params.endpoint` with `params.data`, then runs the response's own actions |

Bottom-sheet button `click_type` union (`DynamicBottomSheet.tsx`): GO_BACK, RETRY, RETRY_SUBMIT, CLOSE_BOTTOM_SHEET, CANCEL_BOTTOM_SHEET, RESET_FORM, ACCOUNT_NAME_MISMATCH, CONFIRM, PRE_CONDITION_FAILED, MAKE_API_CALL. In `ServerDrivenFormScreen` the pressed value is passed back as an action type, so only values that are valid action types do anything; others log "Unknown action type" [behaviour uncertain].

### 4.2 Who runs actions
Only screens that call `handleServerAction`: `ServerDrivenFormScreen` (route `SERVER_DRIVEN_FORM`, params `{formId, data, onResult}`; mounted in AppNavigator, `FTActivationNavigator`, `LoanNavigator`). Other screens ignore `actions[]`. Native flows (v2 meetings, GPS guided flow, loans hub, etc.) hardcode their navigation; only lists, labels, tags/colours, step states and verification flags are server data.

### 4.3 Form engine
- Config `{title, components[{id, type, props, conditionalRules?, conditionalLogic?}]}` fetched by `formId` from the transformer service. Frame: custom header (back + `title`), scroll body (padding 16), Formik, submit button component.
- Component types: text / email / password, text_with_action, `*_with_verify` (text, email, phone, password), date, select, checkbox, textarea, rating, form (nested), loan_application_detail_proposed_trucks, channel_partner_sourced, pin_code, state_picker, city_picker, fastag_class_card, user_info_card, single_choice_questionnaire, multi_choice_questionnaire, partner_banks, grid_view, single_image_upload, dual_image_upload, divider, button. Unsupported -> yellow "Unsupported component: <type>" box.
- Conditional visibility: operators equals, not_equals, contains, not_empty, empty, verified; `conditionalLogic` AND (all) else ANY. Validation from props (required "<label> is required", minLength, maxLength, pattern, minimumSelection); hidden fields not validated.
- Verification fields: button text, endpoint, `maxRetryAttempts`; server verification actions show_field, hide_field, set_field_value, show_message, navigate, disable_field, enable_field, clear_field, update_component_props on on_success / on_error / on_retry_exhausted / on_loading.
- Submit: button spinner; optional auto-retry (`action.retry.{max_retries, delay}`); response `meta_data` merged into hidden data.
- States: loading ("Loading form..." + spinner), error ("Error: <msg>" + "Retry"), loaded.
- Known formIds (`DynamicFormIds.ts`): shipper_profile_form, load_application_detail, loan_detail_form, bureau_report_application, applicant_business_profile (loan forms partly commented out), ft_activation_add_fo_number_form, ft_activation_add_vehicle_detail, ft_activation_assign_fastag_form, ft_activation_add_customer_detail_form, create_coupon_form.

### 4.4 What a designer can and cannot specify
- Can: the container template (header, vertical field stack, sticky/inline submit), per field-type visuals and states (default, focused, error, disabled after verify, hidden, verified badge, loading), the stacked-button bottom sheet (1-3 buttons, 100 px icon, 4 icon variants + custom), the three result paths (success toast / sheet / navigation; error sheet with retry/back; auto-retry spinner).
- Cannot: the exact field list, order, labels or validation (backend config); which result path or next screen the server picks. Name fields by `type`, not label. Any `NAVIGATE_TO` target must open from params alone and the PRD must name its route key. Toast timing blocks the action chain for 1.5 s; iOS shows a modal alert instead of a toast.

### 4.5 Form persistence (verified in code, differs from the guide)
- `src/services/FormPersistenceService.ts` (single active form, 7-day expiry, AsyncStorage), `src/services/AppStateManager.ts`, `src/hooks/useAppFormPersistence.ts` (mounted in AppNavigator, runs once 2 s after JS start). Persisted forms: `CREATE_ORDER`, `CREATE_INDENT`, `POD_UPDATE` (guide mentions only create order). Saves are debounced 1 s; saved only if partially filled.
- **Resume: no prompt. `docs/FORM_PERSISTENCE_GUIDE.md` says the user is asked to resume or start fresh; the code does not.** `AppStateManager.checkAndNavigateToIncompleteForm` calls `navigateToForm` directly (the `showResumeFormAlert` call is commented out) and navigates to the form with `resumeFromSaved: true`; the screen reloads saved values. Design the pre-filled state, not a dialog, unless product asks for new behaviour.
- Cleared on successful submit and on blur in a non-resumed session, so data survives only an app kill or crash. Stored unencrypted locally.
- v2 meetings have no persistence; an ongoing meeting is resumed from the Scheduled tab (card shows ONGOING).

## 5. Patterns a new screen should reuse
- **Data screen:** `LSApiWrapper` (page loader / error + reload / content) with Legend State `*-model.ts` + `*Surface.tsx` (newer); legacy Redux+saga. Lists: `FlashList`, 20 per page, footer loader, refetch on focus; empty states via `NoDataView` (icon + title + sub) with real copy.
- **Tabs:** top tabs with "<NAME> (count)" from server; bottom tabs per role via `useCheckAgainstRole`; team screens: self card + team cards with duty dot, drill down by `iamId`, hide mutating actions when viewing another person.
- **Search/filter:** search with 500 ms debounce, "Filter" pill opening a bottom sheet with Clear / Apply (`DualSubmitButtonSurface`).
- **Overlays:** `BBBottomSheet` + header (close x); confirm dialogs with "No, Thanks"/"Ok" or "Go Back"/"Discard"; `BBSnackbar` (success/error, 2-3 s) via `notifySnackbar`; 2 s success modal ("Meeting logged"); `BBStatusScreen` for full-page success/error (title, sub, buttons); `ReloadDataView` "Something has gone wrong".
- **Capture:** `CAMERA_SCREEN` (front for selfie), `ImageUploadItem` camera tile, `ThumbImageView` / `ImageModal` preview with delete, 5 MB limits, camera-permission dialog, discard-photos dialog on back; barcode scan screens with manual-entry sheet.
- **Verification chips:** Verifying (spinner) / Verified (green check) / Not Verified (red) + Retry/Reupload link.
- **Submit:** buttons disabled until valid (no error-on-submit); spinner inside button; irreversible flows remove the back arrow and offer Cancel only.
- **Duty gating:** off duty blocks meetings and lead creation with a modal; location-dependent features show "Please give location permissions to proceed".
- **Floating action:** extended FAB (`FloatingLabelButton`, label upper-case + icon).
- **Role vocabulary:** CRO = ASO, KAM = CP_ASO, TSL, ASM; always render role-gated variants as separate frames.

## 6. Known gaps and v1-vs-v2 notes
- **v1 vs v2:** `src/v2` contains only `sales/{constants,meetings,cp-ft-inventory}` for `is_cp_new` users (CP_ASO/TSL/ASM); everything else is v1 (`src/feature`). v2 = Legend State + `Surface` + `*-model.ts`; v1 = Redux + saga. v2 reuses v1 screens for Reports (Reports 2.0), map picker, camera, selfie (`TOLL_CHECKOUT_SELFIE`), FASTag add/scan (`ADD_FASTAG`, `SCANNED_FASTAG`). Inference from code layout (no doc states it): Surface+model is the pattern for new screens.
- Doc/code mismatches: 8 vs 11 action types; SHOW_ALERT is a bottom sheet; persistence guide's resume prompt does not exist and covers 1 of 3 forms; features survey called "Universal search" NEW-labelled and the FT drawer item "FT Activation" while code shows no NEW tag and label "Buy FASTag".
- Unverified or not read: team views (`TslViewScreen`, `AsmViewScreen`, reports internals), rating screens, permissions sheets, `NoInternetWrapper` layout, call-log native screen; `SHOW_BOTTOM_SHEET` has no found client implementation; caller of `FT_ACTIVATION_SUMMARY`; form field lists (backend); iOS behaviour; live tab-name casing from the server.
- Other quirks: TOLL_TSL with non-mandatory location leaves the first route null in code; Terms & Privacy links on login are no-ops; distributor search has no empty-state copy; `PAST_ORDERS_SCREEN` "History" tab is commented out; CP "Search" tab commented out; Android-centric (toast, back handler, Play Store).
- Toll bonus UI (FRON-2312) was uncommitted at judge time (`thoughts/FRON-2312/judgments/implementation.md`) but its components exist at this commit.

## 7. Source index (repo-relative)
- Shell/routing: `index.js`, `App.js`, `src/feature/navigators/{AppNavigator.js,HomeNavigator.js,NavigationUtils.ts,ReportsNavigator.tsx,hooks/useCheckAgainstRole.ts}`, `src/common/utils/{getAuthenticatedFirstRoute.js,createUserInfo.ts}`, `src/common/constants/index.ts`, `src/common/hooks/useFeatureFlags.ts`, `src/common/i18n/en.js`.
- Server-driven: `src/feature/dynamic-screen/{types.ts,ServerDrivenFormScreen.tsx,DynamicFormIds.ts,hooks/useServerActionHandler.ts}`, `src/common/components/DynamicBottomSheet`, `docs/README_server-driven-actions-on-response-docs.md`.
- Persistence: `src/services/{FormPersistenceService.ts,AppStateManager.ts}`, `src/hooks/useAppFormPersistence.ts`, `docs/FORM_PERSISTENCE_GUIDE.md`.
- Features: `src/feature/{ft-activation,tzf-full-kyc,ft-inventory,bt-inventory,ft-installation,loans,collections,indent,order,gps-tickets,gps-orders,gps-coupon-codes,coupon-codes,splash,signin-with-otp,onboarding,my_account,rating}`, `src/feature/sales/{toll-kyc,reports,market,meetings,channel-partner}`.
- v2: `src/v2/sales/{meetings,cp-ft-inventory,constants}` (entry `meetings/Navigators/AppNavigator.tsx`).
- Planning: `thoughts/FRON-2312/*`, `thoughts/contracts/2026-07-10-toll-incentives-bonus-summary.md`.
- Survey notes: `context/_raw/bbpro-screens-shell-v2.md`, `context/_raw/bbpro-screens-features.md`.
