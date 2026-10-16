# BlackBuck "Boss" Android app: designer context

**Source:** `repos/boss` @ commit `559c932` (root project `bb-supply-fo-android`, package `com.zinka.fleet`; README calls it "BlackBuck app (formerly BOSS)").
**Last verified 2026-10-15.**

## 0. How to read this file
- Written for a Figma design agent turning PRDs into screens for this app. It lists real screens, real UI labels, states and flows. It does not describe colors, typography or components (see the design-system context file for those).
- Paths are repo-relative. `APP` = `app/src/main/java/com/zinka/fleet`. `RES` = `app/src/main/res`. Feature modules live under `feature/*`.
- Labels in "quotes" are English strings read from code. Hindi, Kannada, Tamil and Telugu translations exist for every screen (English-first designs need ~30% text-expansion headroom).
- "(server)" means the text, order or visibility comes from the backend, so design it as a placeholder. "unverified" means not confirmed in code.
- Most screens are legacy XML (Activity + Fragment). Newer screens are Jetpack Compose with MVI (Root / Screen / ViewModel). Compose is concentrated in GPS (timeline, alerts, reports, fitment, buy), dashcam, fuel checkout, payments engine, notification screens, brokerage loads, GST invoices, BBPS FASTag.
- Verified corrections to earlier notes (do not design against the old assumptions):
  1. The **Trucks bottom-nav tab has no screen**. `APP/trucks/MyTrucksActivity.kt` and `APP/trucks/MyTruckFragmentV2.kt` are 0-byte files. `TRUCKS` exists in `BottomNavMapping` but `BossHomeActivity` has no branch that loads a fragment for it.
  2. The manifest registers `.fastag.fastag_order_fulfilment.assign_vehicle.view.SearchTrucksActivity`, a class that does not exist. The real class `FTIssuanceSearchTruckActivity` is not in the manifest (which is live is unverified).
  3. `core/*` modules (`analytics, common, data, legacy, system, worker`) contain **no screens**, only base classes, shared Compose pieces and dialogs.
  4. There is a **single end-user role: fleet owner (FO)**. No role-based UI gating exists. The only session-type flag is the internal mock-user session (`isStartedMockingAUser`).

## 1. App at a glance

### 1.1 Who the user is
A truck **fleet owner** (India). One app combines: FASTag (tolls), GPS and AI dashcam, diesel/fuel cards, money (BlackBuck Account wallet, passbook, dues, rewards, cash drop), supply (Load Board: find loads, bid, book, orders, earnings, bank payouts), truck and owner KYC, help desk, caller ID/calls, notifications. Package size by area: supply 603 files, fastag 392, gps 382, userkyc 119, trucks 110, home 83, recharge 82, fuel 79, passbook 77, helpDesk 58.

### 1.2 App shell
- **Cold start:** `FleetSplashActivity` (white BlackBuck logo with tagline, full screen, Android SplashScreen API; also the deeplink and push entry).
  - Guards: secure-storage failure dialog (reset / try later); rooted device error "Blackbuck App currently does not support rooted devices. Please login using another device"; force update (`ForceUpdateDialogActivity`, non-dismissible); optional update dialog with "Update" / "Skip".
  - Not logged in: `SelectLanguageActivity` (only if no saved language) then `OnboardingActivity` (phone then OTP). Logged in: optional mandatory-location dialog (`CaptureUserLocationFragment`), then `BossHomeActivity`.
- **Home shell:** `BossHomeActivity` = `DrawerLayout` (left hamburger drawer) + fragment container + custom bottom nav `BossBottomNavigationView`. Tabs swap fragments with no back stack. The drawer is enabled on the Home tab only.
- **Navigation model:** no single nav host. Navigation is `startActivity` / `startActivityForResult` plus fragment replace inside home, plus a string-target **deeplink router** (`APP/deep_link/DeepLinkUtils.kt`; URL last path segment = target, query = payload, e.g. `boss://blackbuck/<TARGET>?k=v`; push notifications use the same TARGET/DATA keys). Each feature has a thin Activity container with its own fragment controller (slide animation + back stack): `FastagLandingActivity`, `GpsLandingActivity`, `UserKycHomeActivity`, etc. Only two Jetpack nav graphs exist (`RES/navigation/adhaar_verification_graph.xml`, `arp_v2_nav_graph.xml`).
- **Languages:** English, Hindi, Kannada, Telugu, Tamil (native-script names in picker; in-app switch).

### 1.3 Bottom navigation (server-driven)
Tab list and order come from app config `homeBottomNavItems` (pref `HOME_BOTTOM_NAV_ITEM_LIST`); unknown values are ignored. Mapping in `APP/home/menu/BottomNavMapping.java`.

| Config value | Visible label | Screen |
|---|---|---|
| HOME | Home | `BossHomeFragment` |
| TRUCKS | Trucks | **none** (see section 0) |
| BOOK_LOAD | Find Loads | `FindLoadFragment` |
| ORDERS | Orders | `OngoingPastOrderTabFragment` (tabs "Ongoing" / "Completed") |
| MONEY | Money | `MoneyFragment` |
| CALLS | Calls | `CallLogsFragment` (missed-call badge) |
| BROKERAGE_LOADS | SuperLoads | `SupplyBrokerageLoadsFragment` |

Freight-blocked users tapping Find Loads or Calls get `BlockingAndBlacklistingBottomSheet` instead of content. The default tab set per user is unknown from the repo.

### 1.4 Home tab (`BossHomeFragment`, `RES/layout/fragment_home.xml`)
- Toolbar: hamburger icon, "Help" text (opens help desk), notification bell with 3 states (`ic_notification_bell`, `ic_notification_bell_unread`, `ic_notification_not_allowed` when OS notifications are off).
- Scroll content, top to bottom: in-app-update banner; API <= 26 deprecation strip; promo banner carousel (server); announcement view; alert carousel with CTA (CLEAR_DUES alerts open the due-selection dialog); balance card (wallet balance + add money); **service tile grid**; ad container.
- **Tiles are server-driven** (`BossHomeTile`: icon_url, display_name, deeplink, tile_name, show_new_tag, tracking_name; cached in Room). Known tile ids: HOME, DIESEL, FASTAG, GPS, LUBRICANT, TYRE, PROFILE, HELP, BALANCE, KYC, BANNER, BOOK_LOAD, LOAN, INSURANCE_V2, CALLS. Tiles can carry a "new" tag (limited by impression/click count) and additional-info text.
- Block flags gate tiles: `FMS_BLOCK_LOADBOARD_FREIGHT` (Find Loads / Calls), `FMS_BLOCK_GPS`, `FMS_BLOCK_FASTAG`, `FMS_BLOCK_FUEL`. Blocked tap shows the blocking bottom sheet.
- Home auto-sheets on entry (server-decided): CSAT feedback sheet (`FeedbackBottomSheet`), load-board sheet, de-whitelisted-user onboarding dialog ("Thank you! ... Get access to 50,000+ loads for Free!"), caller-ID activation permission dialog, alternate-phone-number sheet, language sheet, common alerts. Plus Play in-app update and in-app review.
- Back: closes drawer first, then double-back-to-exit. First load shows a blocking progress dialog until home config returns.

### 1.5 Hamburger drawer
First row = profile header (name, rating, "Verified" / "Unverified"; opens `TruckerProfileActivity`). Other rows are **server-driven** (`HamburgerSideNavItem`: display_name, icon_url, deeplink, show_new_tag). Footer: version text and "Legal" (opens `LegalActivity` with rows "Terms & Conditions", "Privacy Policy").

### 1.6 Entry priority for deeplinks and pushes (`BossHomeActivity.handleIntent`)
Spam caller-ID blacklist sheet (no close button) > platform block (whole app) > add-money redirect > Orders tab (ongoing/past) > Find Loads (if visible and not blocked) > SuperLoads > generic `DeepLinkUtils.launchDeepLinkScreen` (about 120 targets). A server `landingPageDeeplink` is applied if no push target exists.

## 2. Screen map by product area
Columns: screen (class) | how reached | purpose, key sections/labels | states | actions to. Paths under `APP`. Blank cells mean nothing notable.

### 2.0 Launch, login, account
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Splash `FleetSplashActivity` | launcher, link, push | logo + tagline; config fetch | force update (blocking), optional ("Update"/"Skip"), rooted error | language / onboarding / home |
| Select Language `signup/language/` | first run; Settings; home sheet | "Choose Language", "You can also change the language later on", "next" | | Onboarding |
| Sign up or Login `SignUpOrLoginFragment` | Onboarding | "Get Started", "+91", "Enter your mobile number", "Continue" (enabled at 10 digits), "Terms & Conditions" / "Privacy Policy". No separate registration form | inline "Please enter a valid 10 digit mobile number"; API error dialog | OTP |
| OTP `OtpVerificationFragment` | after phone | auto: "We are trying to auto verify your number with an SMS sent to %s", "Enter OTP manually"; manual: "Enter the OTP sent to your mobile %s", 4 digits, "Verify and login", "Resend OTP" (countdown); SMS/CALL choice sheet | wrong OTP: inline "OTP entered is incorrect" (manual) or dialog (auto); API error dialog logs out | home; invalid device: Block User |
| Block User `signup/fraudprevention/` | OTP | terminal: "BlackBuck Account login limit exceeded", "Go Back", "Call Us" | | |
| Settings `home/profile/AppSettingsActivity` | deeplink PROFILE_SETTINGS | rows: "Primary Mobile Number", "Alternate Mobile Number" ("Add mobile number" sheet: "Get full BlackBuck support on 2 numbers now!", "save number", "Not now"), "SMS Alert Service" (paid monthly: "Monthly subscription cost*", "Activate Now"), "KYC", "WhatsApp Updates" toggle, "Language", "Account Settings", "Notifications Settings" | | each row's screen |
| Clear Dues `home/clearDues/` | home alert/popup | dialog "Clear your dues now", "Total Payable", "View breakup", "Pay Now"; screen: selectable list, "Proceed to Pay" | | payment, success dialog |
| Fleet Documents `fleet_section/` | deeplink | "Search by truck number"; empty "No trucks added" / "Add Truck" | | truck conflict screen |
| My Driver `home/myDriver/` | Diesel flows | fuel-card OTP numbers: "Currently Assigned Number", "Add New Number", "ASSIGN" | empty "You have not added any mobile numbers yet."; conflict dialogs | OTP sheet |
| Shells | | `AppWebViewActivity` (T&C, privacy, web), `DateTimeSelectionActivity` (date range), `CustomCameraCaptureActivity` ("Done", "Take another"), `LegalActivity` | | |

### 2.1 FASTag (`fastag/`; container `FastagLandingActivity`; first screen chosen by deeplink target; `FMS_BLOCK_FASTAG` shows only the block sheet)
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| FASTag home `ActiveFastagsFragment` | Home tile | toolbar "FASTag" + "Help" + tutorial videos; wallet header; "Search truck number"; vendor chips (if more than 1 vendor); truck card: "Available Balance", "Refresh", "Recharge", "Auto Recharge" toggle, "FASTag in Transit", "View Order Details"; banner "FASTag Balance is low. Recharge to avoid blacklisting" | shimmer; empty "No FASTag vehicles found" + buy; server nudges, outage sheet | recharge, truck detail, buy, ARP |
| Recharge sheet `FTRechargeBottomSheet` | truck card | "Recharge FASTag", "Enter Amount", "Recommended" chips, "Proceed to Pay" | KYC limit sheet ("Limit used"/"Available for use"); "Recharge blocked until KYC completion" + "Complete Truck KYC Now" | checkout (wallet + online, split payment), payment, status "Go to BlackBuck Account" |
| Truck detail `FTTruckDetailActivity` | truck card | "Balance", "Statement", "Recharge", "Auto Recharge", "All Transactions", "Filter By", "Date"; txn detail ("FASTag Transaction", "Type Of Vehicle", "Opening Balance"/"Debit"/"Closing Balance") | | "Request Chargeback": proof upload |
| Buy FASTag | empty state, deeplink | landing ("Designed exclusively for trucks", "See All Partner Banks", "Our Key Features"), plans, checkout ("Number of vehicles", "Balance:", pay notice), "Payment Done" | | vehicle + personal details (PAN, Aadhaar, DOB, terms), order status |
| Order status `FasTagOrderStatusFragment` | after buy, deeplink | "Order ID: %d", "Installation Appointment Details", "Vehicle Available Location", "Driver's Number", "Personal Details"/"Change", "FASTag Details", "Order Details" | cancel sheet | agents: assign flow (chassis, 16-digit barcode, "Sales Code*") |
| Auto recharge / Gold | truck toggle | "Turn on FASTag Gold to stay protected", "Turn on for all trucks", "Skip for now"; server WebView terms + "Accept via OTP"; "About Auto Recharge Plus", "Current Plan"; deactivation by phone ("Want to Deactivate? Call Now", "Monday to Saturday from 10am to 7pm") | wallet top-up if short; failure status (push) | |
| Others | | whitelisting ("Blacklisted by FASTag provider", "Yes and Pay Rs {0}"); remove tag + balance refund (reason, image, refund); replace tag (appointment sheet); other-bank BBPS tags | | |

### 2.2 GPS and Dashcam (`gps/`; container `GpsLandingActivity`; `FMS_BLOCK_GPS` shows block sheet then closes; dashcam in `feature/gps`)
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| GPS home `ActiveGpsFragment` | Home tile | "GPS" + "Help"; **server overflow menu** (reports, alert settings, buy, track orders, subscriptions, desktop link, invoices); search + filter; per-truck status and chips (repair, dues, ignition lock); FAB "Map View" ("List View"/"Satellite View") | shimmer; empty "No activated GPS available yet" + "Track your order"; server nudge | tracking, repair, dues, menu items |
| Tracking + timeline `GpsTrackingFragment` (Compose) | truck row | map + draggable sheet: "Trip Details", events, FASTag card, fuel sensor, dashcam card, "Share", "Play Trip" ("Trip History"), "Fuel Tracker" (Today/Yesterday/Last Month/Custom; "Add Mileage"), ETA ("Reaches by", "Enter Destination") | | dashcam, alerts |
| Repair ticket | sheet "GPS not working properly?" / "Create GPS Repair Request" | form: "Vehicle Number *", "Dates for technician visit *", "Vehicle Available Location *", "Preferred Contact Number *", "Driver's Number", "Create Repair Ticket"; existing: "Reschedule", "Cancel Ticket" | | |
| Alerts, Reports | menu | alerts: "Location enter/exit alert", "No Alerts Added", geofence; reports: tabs Generate / History, truck select, email | | |
| Buy GPS | menu | landing ("India's Best Vehicle Tracker"), plans ("All plans are exclusive of GST"), vehicles ("Add Vehicle", "Select from Existing Vehicle"), checkout ("Invoice Details", "I need GST Invoice", panic button, coupon, autopay), "Payment Done" | | payment; orders: "Installation Scheduled" |
| Subscriptions / dues | menu, due chip | "Total Payment Due", "Pay Now", "You have no due payments"; detail "Plan Info", "Monthly Data Charge", "Lock in Period"; renewal "Renewal amount", "Expires On" | | payment, status |
| Fitment / VLTD, desktop portal guide | menu | compliance certificate forms; "Live Now! GPS Portal for Desktop!" | | |
| **Dashcam Home** | timeline card, deeplink GPS_DASHCAM | header vehicle + "AI Dashcam"; live player (1 camera 200dp, 2+ stacked 100dp; "LIVE" badge, signal); control bar (server: playback, call, switch camera, fullscreen); alerts: heading + date range (server), filter chips (server), rows with thumbnail, title (e.g. "Drowsy Driving"), severity badge, time | "Connecting to Video ...", "Watch Live", "Try Again", "Camera Offline"; "No alerts"; error dialog | Playback, Alert Details, call |
| Dashcam call + sheets | CALL control | mic permission alert (+ "Go to Settings"); footer "Calling Driver" / "Connecting Call" then "On Call with Driver" + "Connected 00:12" + red end button; "Call could not be connected"; "End Call?" ("Continue Call"/"End Call"); "Live paused" sheet ("Resume"/"Stop Watching"); "Select duration" then "Set up Date Range" + "NEXT" | | |
| Dashcam Playback | Home control, deeplink | header "Playback" + Downloads icon; tab "Playback History" (channel selector incl. "Both"/"Play all", "Select Date & Time", timeline with "Camera Online"/"Camera Offline", footer "Start Recording"/"Stop Recording"); tab "Recordings" (chips All/Today/Yesterday/Last 7 days/Custom; 2-column date-grouped grid, "Buffering", download) | toasts "No recording available at selected time"; "No recordings found"; "Download Complete" ("Go to Downloads") | fullscreen player |
| Dashcam Alert Details | alert row, push | "Alert Details"; 16:9 media + file strip; title + severity badge, time, address; 150dp map ("GPS signal was unavailable"); sticky "Download All" | error dialog | download |

### 2.3 Diesel / Fuel (`diesel/`, `fuel/`, `feature/fuel`; `FMS_BLOCK_FUEL` block)
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Diesel home `DieselFragment` | Home tile | "Diesel", "Search truck number", card per truck, balance, "{0} IOCL points available to convert" | empty "You have no activated diesel cards" + "How to activate Diesel Card" + "Add New Truck" | statement, recharge, plans, rewards |
| Card statement `DieselStatementActivity` | card | "Balance", "Recharge", "Change Number", "Show MPIN", "Forgot Card PIN?", "Transaction Limits", "All Transactions", "Activate"; sheets: assign card, "Set Your Card PIN" | | |
| Activate card | "Activate" | sheet chain: KYC gates, address ("Pin Code", "State", "City", "Confirm & Continue"), "Truck Owner Phone Number", OMC choice, consent WebView + OTP, activation-fee checkout | | status |
| Recharge amount sheet | card | amount entry (XML) | | Fuel Checkout |
| **Fuel Checkout Details** (Compose) | amount sheet | toolbar "Payment Details"; backend cards: header, "Available balances" (toggle pay-from re-prices), bill details, footer with preferred mode + "Change" + backend CTA; CVV sheet ("Enter CVV", "Save & Proceed") | loader; load error dialog exits; pay error dialog stays | direct pay, or Make Payment |
| **Fuel Recharge Status** (Compose) | after pay | "DIESEL", server title/subtitle, OMC logo + "Balance:", transaction details, info box, "Initiating confirmation call in N seconds", "Missed the call? Retry Call", "RETURN TO HOME" | polled; auto-redirect 5s; X close until terminal | caller screen |
| Plans, rewards, gold pumps | menu | "Diesel Plans", "Select a Plan", "Sales Code"; rewards "Total Reward Balance", "Convert Point to Rewards (1 Point = Rs 1)", "Convert Now"; "Fuel at Gold Pumps", "FIND NEAREST GOLD PUMP", pump map ("Directions", "Share", "Save") | | |

### 2.4 Money and payments
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Money tab `MoneyFragment` | bottom nav | "Money" + "Help"; cards: "Cash Drop" (server), "BlackBuck services" ("Account Balance"/"Total Balance", "BlackBuck Rewards"/"Total Rewards", "Dues & Recoveries"/"Total Pending" if applicable), supply "Orders Account" (Earnings, Passbook), "Payments" ("Saved cards" if any, "Pay Direct From Bank Account" if whitelisted) | each card: shimmer, "Couldn't load. Please retry" + Retry | each card's screen |
| Passbook `passbook/` | Account Balance | "Balance", "Add Money", "Statement" (download or email), "All Transactions", "Filter By", "Date"; detail "Opening Balance", "Closing Balance", "Source", "Mode"; missing top-up: "Enter UTR no. (Received from your bank)", "Check", "Enquiry History" | | add money |
| Add money / legacy payment `AddMoneyCheckoutActivity`, `PaymentProcessingActivity` | passbook, balance card, checkouts | amount, "Balance:", "Pay Now", pay notice; modes UPI, net banking, cards; "Processing your payment"; debit-card OTP ("Enter OTP", "Invalid OTP"); UPI ("Enter UPI ID", "Verify") | blocked: support number + "Cancel" | gateway web activities, status "Okay" |
| **Make Payment** (Compose; only fuel mounts it today) | checkout Pay/"Change" | toolbar "Payment Options" + "To Pay: Rs amount"; mode cards in backend order with fee subtitle ("Debit Card Fee: 0.3%"): UPI app radio rows + "Choose Another UPI App"; saved cards + inline CVV; "Add Credit Card"/"Add Debit Card" sheet; Net Banking + "Choose Bank"; Transfer (NEFT/IMPS/RTGS rows with "Copy"); footer "The #1 Choice of Lakhs of Fleet Owners Across India" | "Fetching Payment Methods...", "Processing your payment"; "No UPI Apps available for the Payment."; error dialog exits | alert sheets (section 5), gateway |
| **Payment Gateway** (Compose) | Make Payment | third-party surface under a loader; back: "Cancel Transaction ?" ("Close"/"Ok") | | status |
| **Payment Status** (Compose) | gateway | icon; "Transaction Successful"/"Failed"/"Aborted"/"Pending"; "Transaction ID", "Transaction Amount", "Transaction Date"; "OKAY" or "GO TO BLACKBUCK ACCOUNT"; back disabled | polling spinner; auto-redirect 5s | feature status |
| Dues, rewards, cash drop, saved cards | Money cards | dues: "Download All", "Proceed to Pay"; rewards: "Total Earned Rewards", "View Reward History"; cash drop: "My Deposits", deposit-point map; saved cards: "There are no saved cards!", delete "Are you sure?" | | |
| Payment-account KYC `bb_payment_ac_kyc/` | payment pre-validation | "Enter Basic Details", "Enter PAN Card*", "Full Name(as per PAN Card)*", "Date of Birth(as per PAN Card)*", "NEXT" | | back to payment |

### 2.5 Supply (Load Board) (`supply/`, mostly XML; `PWAActivity` shows remote web)
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Find Loads `FindLoadFragment` | tab | "Find Loads", "Buy Premium Plan", From "Enter loading point" / To "Enter unloading point", voice search, banners, lane alerts | "Location not entered"; freight-blocked sheet | location search, results |
| Results `LaneSpecificLoadsActivity` | Find Loads | From/To bar, truck-type chips, filter dialog ("Truck Type", "Passing Ton", "Loading Date", "Apply", "Clear All"); load card ("Truck Type", "Product", "Payment Terms", "Rate (Negotiable)", "Call", "Buy Plan"); "Set Alert"; caller-ID nudge | empty "No loads found!" + set alert (WhatsApp); retry | Load Details, call sheet |
| SuperLoads `SupplyBrokerageLoadsFragment` (Compose, tab) | tab | server page: banner, benefits, suggested lanes, load cards, help CTA | | results |
| Load Details `LoadDetailsActivity` | card, order, push | route(s), "Trucks Required", "Pricing and Payment Details (Negotiable)", "BlackBuck Price", "Booking Policy", "Get 100% Guaranteed Payment on this load", transporter card ("Verified", ratings, "Share Profile"); CTAs "Bid"/"Call now"/"Continue to book"/"Accept Bid"; bid states "Active Bid", "Edit Bid", "Cancel Bid", "Bid Expired" | blocked sheet | pre-validate (subscription, KYC), then checkout or bid |
| Bid `RequestYourPriceActivity` | "Bid" | "The lowest Bid will win the load", "Enter your Bid" (Rs), "How long do you want to wait for a load at your Bid?" ("%d hour wait"), "Continue"; customer loads: sheet "Confirm your Bid" then "Bid Received" | too-high inline error | checkout (bidding) |
| Checkout `SupplyCheckoutActivity` | book/bid | four steps on one screen: "1. Select Your Truck", "Driver Name & Number", "3. Select Arrival Time", "4. Select Your Bank Account" ("Change"; empty "Bank account not added" + "ADD"); "Payment Process" card | toasts "Please select a truck/driver to continue", "Please select arrival date"; truck blacklist and serving-elsewhere sheets | review or bid confirmation |
| Review + confirmation | checkout | "Confirm Booking Details", "Step 2 of 2", "Payment Details", "Order Details"/"Change", "Confirm Booking"; then "Booking in progress" to "Booking Confirmed", "Order ID: %s", "View Details", "Go Back"; bid: "Bid submission in progress", "Okay" | back: "Going back" support prompt; error "Go Back" | track order, results, Orders |
| Bid alarm `BidBookingAlarmActivity` | push, full screen | "Load Booking Request", "Reject"/"Accept" | error retry | |
| Orders `OngoingPastOrderTabFragment` | tab | "Orders" + help; tabs "Ongoing"/"Completed"; bid rows | empty "No orders yet" + "Find Loads" | Order Details |
| Order Details | order row | "Track", "Truck & Driver" ("Change", "Call Driver"), diesel card info, "Payment Details" ("Net Earnings", "View Details"), "Load Details", bank account "ADD", "Find Your Next Load" | cancel sheet: "You may be charged a penalty for wrong cancellation!" ("Yes, Cancel"/"No") | track, earnings breakdown, help |
| Accounting + payout | Money "Orders Account" | Earnings ("Search by order number"), Passbook, "Transfer to Bank Account"; transfer: "Select bank account to transfer", "Enter amount to transfer", "Transferrable Balance", "Confirm Transfer", "Transferring / Please wait. Do not leave this page", result "Share"/"Done"; or move to BlackBuck Account | | |
| Bank, PIN, drivers | checkout, order, transfer | accounts: "No bank account added" + "ADD BANK ACCOUNT", form ("Account Number", "IFSC Code", "Account Holder's Name"); **4-digit PIN** ("Enter your 4-digit PIN", "Don't remember the PIN?", OTP, "Re-enter new 4-digit security PIN to confirm") guards bank change and transfers; drivers: "No Driver Added" + "ADD YOUR DRIVER", "Driver Name", "Mobile Number", "SAVE" | | |
| Profiles, lanes, plan | | transporter profile ("Active Loads", "Call", "Rate", rating scale Bad to Excellent, "Review Transporter"); own profile `TruckerProfileActivity`; "No favourite lanes added" + "Add lanes"; "Find Your Next Load"; premium plan list, checkout, status | | |

### 2.6 KYC and trucks
| Screen | Reached | Purpose / key labels | Actions to |
|---|---|---|---|
| KYC home `userkyc/UserKycHomeActivity` | Settings, drawer, gates | steps 1-2-3 "Truck KYC" / "Truck Owner KYC", "For KYC verification, please submit:", "It will take up to 15 minutes to verify the documents", "start instant kyc" / "RETRY INSTANT KYC"; truck list ("Add New Truck"); document list ("One Address Proof", "ID Proof", "Truck owner not around? Send an SMS link...") | Aadhaar, DigiLocker, upload, selfie |
| Upload, selfie, name check | | "TAP TO UPLOAD", "Submit", "Upload failed. Please try again."; selfie "Take a Selfie", "Your face should be within the circle"; "Confirm Your Name", "I confirm this matches the name on my PAN card" | |
| Instant KYC | "start instant kyc" | "Aadhaar Number", "Request OTP", verify, owner proof, status "Okay"; DigiLocker redirect | |
| Toll KYC | FASTag limit | biometric or video KYC + personal details | |
| Truck verification, attributes, conflict, KYV | diesel, KYC list, gates | "Vehicle Number", "Please enter a valid Truck number", "Or Select from existing trucks"; attributes stepper (body type, length, height, flooring, weight, tyre; "Start Now", "NEXT", "Submit"); "... is claiming your truck", "Resolve this issue"; image upload with guidelines, "Submit for Approval" | |

### 2.7 Help desk (`helpDesk/`; backend `boss-portal`, a Freshdesk wrapper; categories, articles, numbers are server content)
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Landing `HelpDeskLandingActivity` | "Help" in toolbars; deeplinks | "BlackBuck Help Desk", "At your service 24x7", persistent "Call Us"; tabs "Open Tickets (n)" / "Closed Tickets (n)"; categories (logo, "new" flag) on Open tab | "No data found" / "No tickets found" | category, ticket |
| Quick action `QuickHelpActionActivity` | category type QUICK_ACTION | "Do you want to...", "Call Us", "or", "Raise Ticket" (options: call, ticket, call logs) | | |
| Articles + article | category | list ends with "My issue is not listed here" (call / ticket / deeplink); article HTML; "How was your support experience ? Good / Bad" | | raise ticket or server action |
| Raise ticket | article | "Write your issue here..", "Type here (15-500 characters)", attachments, "Raise Ticket"; payment issue: "Load Payment Support", "Upload LR / POD / Bilty Photo", "LR/POD/Bilty Photo Required", success "Your ticket has been raised successfully" | | ticket |
| Ticket chat `TicketActivity` | ticket row, push | "Resolving by", thread (sender "You" / "BlackBuck Support", attachments), "Type your message here"; waiting on user: "Action required"; "Thanks for contacting us. Our team is working on it."; resolved: "We have marked your issue as resolved. If you need more help, raise a new issue." + "Re-Open Ticket" (up to 5); rating "How was your support experience ?" | open vs closed only; GPS repair tickets read-only | CSAT sheet |
Ticket status the app sees: OPEN (open, pending, waiting) or CLOSED (resolved, closed). Rating prompt only within 48 hours of resolve. Two support numbers: "relationship officer" (may be absent) and "BlackBuck support".

### 2.8 Calls, notifications, settings
| Screen | Reached | Purpose / key labels | States | Actions to |
|---|---|---|---|---|
| Calls tab `callerid/CallLogsFragment` | tab | "Calls", "Call Us", "Search by transporter name", rate-call; caller-ID overlay permission ("Turn this on to see caller ID") | empty "No calls...yet" + "Find Loads"; retry; missed-call badge; freight-blocked sheet | |
| **Notification Center** (Compose) | Home bell | toolbar "Notification Center"; row "Notification Settings"; headers "TODAY"/"EARLIER"; row: avatar, title, 2-line body, category pill (FASTag, GPS, Superloads, Diesel, Loans, Loads, Call, Wallet, Dashcam, General) + time ("Just now", "%dm ago", "d MMM yyyy"); unread rows tinted | shimmer; "No New Notifications"; "Couldn't load notifications" + "Retry"; sheet "Turn ON notifications" ("Turn ON"/"Maybe Later") when OS off | row opens its deeplink |
| **Notification Settings** (Compose) | Settings, Center, GPS bells, deeplink | "Manage all notifications", "Allow App Notifications" switch, "Manage individual notifications": per-channel card (switch, "Sound"/"Silent") | cards dimmed when app off; no loading or error | turn off: "Are you sure?" ("Yes, Turn Off"/"Cancel"); on: OS prompt or OS settings |

## 3. Key flows (failure branches in brackets)
**F1 Launch to Home.** Splash [force update: blocking; rooted: exit] > language (first run) > "Get Started" phone [invalid: inline] > OTP auto-verify then manual [wrong: inline/dialog; resend after countdown, SMS or CALL] > device registry [error: dialog + logout; device not registered: Block User] > location dialog (if none stored) > Home (+ auto-sheets: CSAT, load board, caller ID, alternate number, language).
**F2 Hub.** Tile tap [service blocked: sheet with server title, byline, "Call Us"; platform/blacklist block has no close] > feature. Push/link > Splash > Home > router (priority in 1.6).
**F3 Find and book a load.** Find Loads From/To [empty: "Location not entered"] > results [none: "No loads found!" + Set Alert] > Load Details > "Continue to book": server pre-validation [subscription needed: premium plan list > checkout > status; KYC needed: KYC dialog] > checkout: truck [blacklisted/serving elsewhere: sheets], driver [add], arrival, bank [optional; change/add needs 4-digit PIN, forgot-PIN by OTP] > review "Step 2 of 2" [back: support prompt] > "Booking in progress" > "Booking Confirmed" [error: "Go Back"] > track order.
**F4 Bid.** Same pre-validation > bid amount + wait hours [too high: inline; at/below min: falls to booking] > checkout > "Bid submission in progress" > success > Orders. Customer loads: sheet > "Bid Received". Manage: edit, cancel (confirm then reasons), expired, lowest-bid mismatch with "Accept Bid". Later a push alarm "Load Booking Request" (Accept/Reject).
**F5 Order to payout.** Orders > Order Details [cancel: penalty sheet] > Money > "Orders Account" > "Transfer to Bank Account" > PIN > amount > "Confirm Transfer" > "Transferring / Please wait. Do not leave this page" > result (Share, Done), or move earnings to BlackBuck Account.
**F6 FASTag.** Recharge: card > amount [KYC limit: block sheet > KYC] > checkout (wallet + online) > payment > status [short wallet: add money; dues: Dues & Recoveries]. Buy: landing > plans > checkout > payment > "Payment Done" > vehicle and personal details > order status + appointment [cancel sheet]. Auto Recharge toggle > success dialog > Gold activation (server terms, "Accept via OTP", wallet top-up) [failure: status screen via push]; deactivate by phone. Ledger > transaction > "Request Chargeback" > proof upload.
**F7 Money.** Cards load independently [each: Retry]. Balance > Passbook > "Add Money" > amount > mode > gateway > status [blocked: support number; debited not credited: UTR enquiry]. Dues: select > "Proceed to Pay" > success dialog.
**F8 GPS.** Tile > list (map toggle) > tracking + timeline (share, fuel, history, ETA, dashcam card). Repair: "GPS not working properly?" > form > back; existing ticket: reschedule/cancel. Buy: landing > plans > vehicles > checkout > payment > confirmation > installation appointment. Renewal chip > renewal checkout > status.
**F9 Dashcam.** Card > Home ("Connecting to Video ..." > "LIVE") [offline: "Camera Offline"; error: "Try Again"] > after server auto-pause "Live paused" ("Resume"/"Stop Watching"). Call: mic permission [denied: "Go to Settings"] > "Calling Driver" > "On Call with Driver" [error: "Call could not be connected"; leaving: "End Call?"]. Alert row > Alert Details > "Download All" > "Download Complete" > "Go to Downloads". Playback: date/time > timeline > play, "Start Recording"/"Stop Recording"; Recordings > grid > play/download [fatal timeline error: dialog then back].
**F10 Diesel.** Home [no card: empty state] > add truck > KYC + name check > activation sheets (address, owner phone, OMC, consent + OTP, fee) > assign card, set PIN. Recharge: amount > Fuel Checkout [load error: dialog, exit] > sufficient balance: pay > Recharge Status (polled, auto-redirect 5s); insufficient or "Change": Make Payment > gateway > Payment Status > Recharge Status. Needs a driver OTP number.
**F11 KYC.** Gate or Settings > truck KYC: instant (Aadhaar number > OTP > owner proof > status), DigiLocker, or documents [upload failed: re-upload]; owner not around: SMS link; owner: selfie + PAN name confirm; toll KYC (biometric/video) for FASTag limits. About 15 minutes to verify (on-screen copy).
**F12 Help ticket.** Help > category [quick action: "Call Us"/"Raise Ticket"] or articles > article > Good/Bad > (negative) server action: call, raise ticket (15-500 chars, attachments) or deeplink > ticket chat [waiting on user: "Action required"] > resolved: rating (48h) and "Re-Open Ticket" (max 5). Pushes: created, agent replied, action required, delay, resolved.
**F13 Notification.** Bell > Center [loading, list, empty, error] > row (marks read) > deeplink [launch failure silent]. OS off: sheet > Settings > OS prompt.

## 4. Server-driven vs hard-coded
**Designer CAN specify:** layout and hierarchy; toolbar titles ("Money", "Orders", "Calls", "Payment Options", "Payment Details"); fixed CTAs ("Continue", "Verify and login", "RETURN TO HOME", "OKAY", "Download All", "Start Recording"); form fields and validation; empty, loading and error designs; confirmation and permission dialogs; sheet structure; legacy XML flows in section 2.
**Server decides (design as placeholders with slots, length limits, fallbacks):** bottom-nav set and order; Home tiles (icon, label, "new" tag), drawer items, banners, alerts; block-sheet text (platform, caller ID, freight, FASTag, GPS, fuel); FASTag vendor chips and nudges; GPS overflow menu and nudges; Money cards (Cash Drop, Dues, Saved cards, Pay Direct); help categories, articles, quick actions, support numbers; brokerage page; Fuel checkout and recharge status text (cards, bill rows, CTA, titles, info box); Make Payment (mode order, fees, alerts, "Change"); Payment Status title and subtitle; dashcam controls, alert heading and filters, auto-pause, date limits, camera count; checkout/diesel error dialogs (title, message, primary button); update type, language prompt, KYC nudges, CSAT sheet; feature flags (`enabled_features`, e.g. CALLER_ID, IN_APP_REVIEW); entry gates (subscription, KYC, whitelist).
**A PRD cannot fix by design alone:** which tabs a user sees (a Trucks tab renders nothing), which payment modes or fees appear, exact server wording. These need a backend or config change.

## 5. Patterns a new screen should reuse
- **Checkout > payment > status.** Toolbar (back, title, "Help") > summary cards > optional sales/coupon code > pay notice "Ensure to pay via BlackBuck app only. No cash payment" > primary pay CTA > payment mode screen > gateway (external surface; back asks "Cancel Transaction ?") > status page (icon, colored title, details card, auto-redirect 5s, "OKAY" or "GO TO BLACKBUCK ACCOUNT") > feature status page. New Compose features should use the shared engine (`feature/payment`): checkout > Make Payment > Gateway > Payment Status, with backend-driven checkout cards (header, available balances, bill details, footer with preferred mode + "Change"). Show "Balance: Rs X" wherever wallet pay is possible.
- **Pre-payment alert sheet** (server codes): UPI_BLANK_ERROR "Transaction Error!" ("Choose Others"/"Go Forward"), UPI_LAST_TXN_FAILED, INSUFFICIENT_FUND "Transaction Alert", INCORRECT_DETAIL (CVV, OTP, "DON'T press back button"), FACING_DOWNTIME "UPI Alert!".
- **Bottom sheets** for amount entry, single-field entry (PIN, OTP, CVV, alternate number, sales code), confirmations, success acknowledgements, nudges, date ranges, permissions. Pattern: title, one body line, primary button, optional text button ("Maybe Later", "Not now", "Cancel").
- **Blocking sheet** for restricted services: title, byline, "Call Us".
- **Dialogs.** Generic error: "Some Error Occurred ! Please Try Again" / "We are trying to fix the error for you. Please try again", one "Okay", usually exits the screen. Offline: "No Internet Connection" / "You are offline, Please check your internet connection." Destructive confirms: two buttons, safe one secondary ("Yes, Turn Off"/"Cancel", "Yes, Cancel"/"No", "End Call"/"Continue Call"). Progress/success/error dialog: LOADING, ERROR ("Go Back"/"Retry"), SUCCESS. Transient: toast or snackbar.
- **Loading.** Translucent full-screen spinner; shimmer lists; per-card loaders; "Processing your payment"; polled status pages.
- **Empty states:** icon + title + one line + CTA, e.g. "No FASTag vehicles found", "No orders yet" + "Find Loads", "No Driver Added" + "ADD YOUR DRIVER", "No bank account added" + "ADD BANK ACCOUNT", "No New Notifications", "No alerts", "No data found".
- **Inline error:** "Couldn't load. Please retry" + Retry.
- **Lists:** search field, filter chips, "Filter By"/"Date" on ledgers, pull-to-refresh, paged append loader. Ledger: balance header, "Statement", "All Transactions", row > detail (Opening/Closing Balance, Copy ID).
- **Forms:** "Step 2 of 2", asterisk required labels, inline validation, primary disabled until valid, 4-box OTP with "Resend OTP" countdown.
- **Toolbar:** back, title (+ subtitle such as vehicle or route), "Help" or call icon on the right.
- **KYC gate:** server pre-validation result > KYC dialog/screen > return to the action.
- **Copy:** English, Hindi, Kannada, Tamil, Telugu; leave room for longer scripts.

## 6. Known gaps and legacy oddities
- **Trucks tab** has no screen (empty `MyTrucksActivity.kt`, `MyTruckFragmentV2.kt`); truck lists live only inside feature flows.
- **Stale manifest entry:** `SearchTrucksActivity` registered but has no class; `FTIssuanceSearchTruckActivity` is the real FASTag truck search and is not registered (which is live: unverified).
- **Payment engine adoption:** the Compose payment graph is mounted only by Fuel checkout in code searched; FASTag, GPS and add money still use legacy payment screens (unverified for every consumer). Fuel also keeps legacy XML checkout/status for `APP_DRIVEN` and `APP_ORCHESTRATION`.
- **Deprecated deeplinks:** BUY_GPS_V2, BUY_FASTAG, BUY_DIESEL, ADD_MONEY. Legacy names (Boss, Zinka, Fleet, FMS) differ from user-facing "BlackBuck". "SuperLoads" = `BROKERAGE_LOADS`; "BlackBuck Account" = wallet; "Orders Account" = supply passbook; "Gold" = auto-recharge plus.
- **Sales-only fields visible to all:** "Sales Code", "Coupon Code", "Plan Extension Code", "FASTag mapping is only available for our agents" (inferred from labels).
- **Internal screens, never design:** `MockFoActivity`, `TestCaseDummyActivity`.
- **Copy inconsistencies:** "Blackbuck"/"BlackBuck", "select atleast one location", mixed-case buttons ("next", "start instant kyc", "ASSIGN").
- **Error style:** most Compose screens use a blocking dialog that exits; exceptions are Notification Center, Make Payment bank list, Money cards.
- **Phone-only flows:** FASTag Gold deactivation and some support actions.
- **Not covered:** Compose-only strings in GPS timeline/alerts/reports/fitment, BBPS, balance refund, GST invoices, brokerage page, parts of Order Details; `PromotionActivity` purpose; per-user default tabs; translations; visual tokens. Derived from code, not run on a device.

## 7. Source index
- Shell/home: `app/src/main/AndroidManifest.xml`; `APP/FleetSplashActivity.kt`; `APP/signup/` (onboarding, OTP, language, fraudprevention); `APP/home/superBoss/ui/BossHomeActivity.java`, `BossHomeFragment.java`; `APP/home/menu/BottomNavMapping.java`; `APP/home/appVesion/AppConfigViewModel.kt`; `APP/deep_link/DeepLinkUtils.kt`; `APP/home/profile/AppSettingsActivity.kt`; `APP/home/clearDues/`; `APP/settings/BBSettingsActivity.kt`.
- Notifications: `feature/common/src/main/java/com/blackbuck/feature/common/presentation/notification_center/`; `feature/settings/src/main/java/com/blackbuck/feature/settings/presentation/notification_settings/`.
- Money/payments: `APP/money/`, `APP/passbook/`, `APP/recharge/payment/`, `APP/savedcards/`, `APP/cashDepositPoint/`, `APP/rewards/`, `APP/bb_payment_ac_kyc/`; `feature/payment/src/main/java/com/blackbuck/feature/payment/` (README, `presentation/make_payment`, `gateway`, `core_payment_status`, `core/ui/checkout_details`).
- FASTag: `APP/fastag/`, `APP/chargeback/`. GPS: `APP/gps/`; dashcam: `feature/gps/src/main/java/com/blackbuck/feature/gps/dashcam/`.
- Fuel: `APP/fuel/`, `APP/diesel/`, `APP/nro/`, `feature/fuel/src/main/java/com/blackbuck/feature/fuel/presentation/`, `APP/fuel/recharge/FuelRechargeCheckoutActivity.kt`.
- Supply: `APP/supply/`, `APP/osa/subscription/`, `APP/callerid/`. KYC/trucks: `APP/userkyc/`, `APP/trucks/`, `APP/cardless/`, `APP/common/truck_kyv/`, `APP/fleet_section/`.
- Help desk: `APP/helpDesk/`; backend repo `boss-portal` (`com.zinka.bosshelpdesk`, commit `4dc4813`).
- Core (no screens): `core/legacy`, `core/common/ui`, `core/system`, `core/common/event-bus`.
- Condensed from `context/_raw/boss-screens-app-core.md`, `boss-screens-features.md`, `boss-portal-and-ops.md` (help-desk part).
