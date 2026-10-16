# BlackBuck design-system context (Boss + BB Pro) for the Figma design agent

Sources: Boss (native Android, `repos/boss`) @ commit **559c932**; BB Pro (React Native, `repos/bb-pro`) @ commit **f7cc17d**; web notes from `tzf-customer-portal` @ bedb936, `tzf-activation-web-sdk` @ 2d519f4, `tzf-full-kyc-sdk-web` @ 0d6387b.
**Last verified 2026-10-15.** All paths are repo-relative to the named repo. Values were read from code; anything marked **unverified** could not be resolved from the checkouts.

> **Caveat: Figma library component keys are NOT known from code.** This file gives token values and component specs so you can match them to library components by appearance and name. Never invent or guess a component key; search the library (`search_design_system`) first. If a match is ambiguous, follow section 9.

## Figma library links (to be filled by the user)
- Boss library: _TODO (user to paste Figma library/file URL)_
- BB Pro library: _TODO (user to paste Figma library/file URL)_
- Shared / web library (optional): _TODO_

Neither app has a formal token system in code, no Code Connect and no usable Storybook. Both catalogues below are reverse-engineered from usage frequency; treat the "recommended" sets as the tokens and everything else as legacy.

---

## 1. Authoritative vs legacy (what new screens must use)

### Boss (Android, "Fleet Owner" app, package `com.zinka.fleet`)
- **Use for new screens:** Jetpack Compose + `BlackbuckAppTheme` + Material3 widgets + SDK `Base*` composables, colors from the section 2 recommended set via `colorResource(...)`. Examples: `core/common/ui/src/main/java/com/blackbuck/ui/component/*`, `feature/gps`, `feature/payment`, `feature/settings`, `feature/fuel`, `app/.../fleet/gst/invoices/views/InvoiceListScreenRoot.kt`, `app/.../fastag/bbps_recharge/ui/**`.
- **Legacy (do not copy for new work):** XML screens on `ActivityTheme` / `SupplySDKTheme` (`app/src/main/res/values/styles.xml`), `Roboto<Weight><size>sp` text styles, `button_*` styles, ALL-CAPS Montserrat button labels, 2dp/5dp-radius buttons. ~90% of shipped screens are still XML, so existing screens will look like this; new designs should not.
- **The real theme lives outside the repo:** Compose theme, fonts and `Base*` components ship in external artifact `com.blackbuck:common-sdk:05.05` (`gradle/libs.versions.toml`). Its source and the artifact are not available here (gradle cache search found nothing). Token values defined only there are **unverified**: `blueish_black`, `text_sub_title`, `colorAccent`, `black`, `red`, `grey80`, `bg_grey`, `blue_rating`, `checked_thumb_color`, `BBButtonSize.LARGE` dimensions, `BaseComposeText` defaults.
- **Single Light mode, portrait only.** No night resources (`app/src/main/AndroidManifest.xml` has 138 portrait declarations). minSdk 24, target 36.
- Brand: BlackBuck red `brand_red` #D91E48 is splash/branding/error; **primary UI action is navy #0D2C40, not red.**

### BB Pro (React Native 0.85 / Expo 56, react-native-paper 5 in MD2 mode)
- **Use for new screens:** `src/common/theme/{colors,fonts,icons}.js` + `BB*` components in `src/common/core-components/`, `LS*` wrappers in `src/common/ls-wrapper-core-components/`, and the Paper-based set in `src/feature/loans/components/*` (`BBPaperButton`, `ButtonsDeck`, `SubmitButtonSurface`, `ScreenHeader`, `BBDynamicBottomSheet`, `BBStatusView`). Paper theme in `App.js`: `roundness: 4`, primary/accent `#1554F6`, placeholder `#7A7A7A`, disabled `#B3B3B3`, background `#FFFFFF`.
- **Legacy:** `src/common/components/ButtonComponent.js` (radius 2, 14/700 capitalized), `BottomSheet.js` (RBSheet), `OtpInputView.js`, `BBSnackBar.js`, `ConfirmBottomSheet.js`, old `*V1` pickers, `TextInputWithIcon`/`BBOutlinedTextInput`. Prefer their BB*/Paper replacements.
- **"v2" is not a visual generation.** `src/v2/` and `*V2` components use identical tokens.
- **Light only, no dark mode**; status bar forced dark-content, translucent. Portrait phone; Android primary.
- **Two primaries coexist** (blue #1554F6 and navy #0D2C40) and **two tab accents by role** (blue for sales users, #D91E48 for all others, `src/feature/navigators/HomeNavigator.js:535`). Rule of thumb from code: forms/contained Paper buttons/links = blue #1554F6; dialogs, CallNow, selected chips, tab indicator, text = navy #0D2C40. No rule in code beyond this; ask the user when a new surface is ambiguous.

### Cross-app note
Both apps share the same brand family: navy #0D2C40 text, #0BBB7A green, #D91E48 brand red, Roboto. They disagree mainly on primary action colour, page background, divider/border greys and error/warning shades (flagged in section 2).

---

## 2. Colors

One semantic table. "Variable" = proposed unified Figma variable name (`/`-grouped). Hex is exact from code. **Disagree** column flags where Boss and BB Pro differ. BB Pro 8-digit hex in code is #RRGGBBAA; Boss XML 8-digit is #AARRGGBB; the table below normalises everything to #RRGGBB plus an explicit alpha %.

| Variable | Boss (token) | BB Pro (token) | Disagree? / note |
|---|---|---|---|
| `text/primary` | #0D2C40 (`blackish_blue`, `text_title`) | #0D2C40 (`text_color_dark`, `color_0D2C40`) | Agree. Default body/heading colour (navy, not black). |
| `text/primary-60` | #0D2C40 @50% (`blackish_blue_semi_transparent`: dialog subtitle, placeholder) | #0D2C40 @60% (`text_color_dark_099`) | Alpha differs 50% vs 60%. |
| `text/secondary` | #5D727F (`grey_5D727F`) | #5D727F (`color_5D727F`) | Agree. Blue-grey. |
| `text/tertiary` | #717171 (`grey_support_text`) | #727F8B (`color_727F8B`) | **Differ** (neutral grey vs blue-grey). |
| `text/caption` | #909EA7 (`grey_909EA7`) | #909EA7 (`grey_909EA7`) | Agree. |
| `text/muted` | #9B9B9B (`light_grey_4`, `color_nav_unselected`) | #9B9B9B (`text_color_light`) | Agree. Also inactive tab/nav. |
| `text/on-dark` | #FFFFFF (`white`) | #FFFFFF | Agree. |
| `text/black` | #000000 (`blackColor`) | #000000 (`black`) | Agree; rarely used for body. |
| `brand/navy` | #0D2C40 | #0D2C40 | Same value as `text/primary`; used as fill. |
| `brand/red` | #D91E48 (`brand_red`; near-dup `blackbuck_red` #DA1E48) | #D91E48 (`blackbuckRed`) | Agree (ignore #DA1E48). Splash, branding, non-sales tab tint. |
| `action/primary-fill` | #0D2C40 (buttons) | #1554F6 (`blue_primary`, Paper contained) **and** #0D2C40 (dialogs, CallNow) | **Differ: Boss primary button = navy; BB Pro form button = blue.** |
| `action/primary-blue` | n/a (not a Boss primary) | #1554F6 | BB Pro only. Paper `primary`/`accent`. |
| `action/link-blue` | #1185FA (`action_blue`; BlueLinkText uses #2C88E4) | #1185FA (`blue_1185FA`); links also #1554F6 | Mostly agree on #1185FA; Boss text-link variant #2C88E4. |
| `action/bright-blue` | #1587FF (toolbar action chips) | #1587FF (`color_1587FF`, counter +/-) | Agree. |
| `state/success` | #0BBB7A (`_info_green`; loaders, success status) | #0BBB7A (`green_0BBB7A`); also #00BC78 (`success`) | Agree on #0BBB7A. Boss `green` #20BE79 = switch only. |
| `state/success-snackbar` | n/a (snackbar is navy) | #27AE60 (`color_27AE60`) | BB Pro only. |
| `state/success-tint` | #E7F8F2 (`green_positive`) | #0BBB7A @5% (`green_0BBB7A0C` = #0BBB7A0C, i.e. 5%); #E7F8F2 (`green_E7F8F2`) | Tint approach differs (solid vs alpha). |
| `state/error` | #D91E48 (`brand_red`, status failure); #C10000 (`rc_error`, input error text); #CD3333 (`colorAccent400`) | #CD3333 (`red_CD3333`, status/snackbar/required `*`); #C10000 (`red_C10000`, alert text); #B00020 (`red_B00020`, Paper default error) | **Differ and fragmented.** Proposal: `state/error` = #CD3333; `state/error-strong` = #C10000. Boss failure status uses brand red #D91E48. |
| `state/error-tint` | #FFF2F3 (`error_red_light`), #F9E6E6, #FBE9ED | #C10000 @5% (`red_C100000C` = #C100000C, i.e. 5%); #FCEAEA (`pink_FCEAEA`) | Differ. |
| `state/warning` | #FFA213 (`amber_yellow`, pending text); #F5A623; #D98F1E (`orange_text_status`) | #D98F1E (`warning`); #F5A623 (`color_F5A623`); #DC8C09 (pending title) | **Differ.** Proposal: `state/warning` = #D98F1E, `state/pending` = #F5A623. |
| `state/warning-tint` | #FEF6E9, #FFF7E9, #FFF9EE | #FFF4E2 (`color_FFF4E2`, dialog icon bg); #D98F1E @5% | Differ. |
| `state/info` | #1185FA | #1185FA | Agree. |
| `state/info-tint` | #F0F7FF (`colorSecondary50`), #F1F8FF | #F0F7FF (`blue_F0F7FF`); selected option bg #E9EFFF (`color_E9EFFF`) | Agree on #F0F7FF. |
| `surface/page` | #F2F2F2 (`home_screen_bg`; Compose scaffolds); #F1F1F1 (`screen_bg`, XML); #F8F8F9 (`bg_color`, settings) | #FFFFFF (default `Screen`); grey #F5F5F5 / #EFEFEF / #F2F2F2 on card-list screens | **Differ.** Boss = grey canvas + white cards; BB Pro default = white screen. |
| `surface/card` | #FFFFFF | #FFFFFF | Agree. |
| `surface/subtle` | #F3F3F3 (`grey_dialog_bg`), #F6F6F6 | #F3F3F3 (`color_F3F3F3`), #F6F6F6 | Agree. |
| `border/divider` | #EBEBEB (`grey_EBEBEB`), #EDEDED (`divider_white_color`, Compose), #F6F6F6 (`HorizontalDivider` style) | #F6F6F6 (`divider`, 1px); #EDEDED (dialog divider/option border) | **Differ** in default hairline: Boss #EBEBEB/#EDEDED, BB Pro #F6F6F6. |
| `border/default` | #E2E2E2 (`text_input_layout_stroke_color`); #D8D8D8 (`light_grey_11`); #EAEBED (toolbar pill) | #CCCCCC (`grey_CCCCCC`); #E5E5E5; #C4C4C4 (unselected chip); #E7E9EB (counter) | Differ. |
| `border/input` | XML #E2E2E2 all states; Compose focused = #0D2C40, default white container | #A0AAB1 (`grey_A0AAB1`) default; focus #1554F6; error #B00020 (Paper default, **unverified**) | **Differ.** |
| `border/outline-btn` | 1dp #0D2C40 (legacy outline) | rgba(0,0,0,0.1) (`opacity_1`) or #0D2C40 (BBDialog) | Differ. |
| `state/disabled-fill` | #D8D8D8 (`button_disable_state_color`); #9B9B9B (login/legacy) | #8E8E8E (`grey_8E8E8E`, legacy button); #0D2C40 @50% (OTP verify); Paper #B3B3B3 | **Differ.** |
| `skeleton/bone` | #E1E1E1 (`shimmer_grey`) | none (no shimmer component) | Boss only. |
| `scrim/default` | #000000 @40% (`black_alpha_40`); #000000 @60% (`black_alpha_60`) | #000000 @30% (loader, `opacity_3`); #00000077 (legacy sheet, = 46.7%) | Differ. |
| `overlay/black-5` | n/a | #000000 @5% (`color_0D000000` = '#0000000d'; verified) | BB Pro only. |
| `brand/gold-gradient` | #C9AA45 / #FBE69E / #9E7E14 (Gold/ARP) | n/a | Boss only. |
| `fastag/class-*` | 4 #7300FA, 5 #FA6400, 6 #F5A623, 7 #22C821, 12 #FF1248, 15 #1185FA (bg tints = 10% alpha; dark text #3C0071/#712D00/#654500/#0E5500/#5F0800/#062E55) | purple #7300FA/#3C0071/#F1E5FE; orange #FA6400; web adds grey #40535A | Palette consistent; see raw for per-class text colours. |

**Consolidation rule:** both codebases contain ~40-540 colours, mostly duplicates. Only create Figma styles for rows above (plus star gold #FFCB02, rating-bad #C10000). If a design needs a colour not listed, use the nearest listed token and flag it (section 9).

**Pitfalls:** BB Pro keys `green_22C821_1A`, `blue_1185FA_1A`, `color_0DC10000`, `color_0DD98F1E` are mis-written ARGB with 0 usages; ignore. Boss Compose also uses inline Tailwind-like colours in the OTP field only (`core/common/ui/src/main/java/com/blackbuck/ui/text_field/SystemKeyboardTextField.kt`: default #CBD5E1, focused #3B82F6, error #EF4444, digit #1E293B, disabled digit #94A3B8; verified).

**Server-driven colours (Boss):** `SimpleActionButton.bgColor/color`, `CommonAlertDialogDataResponse.bgColor`, `ActionLabelComposeViewData`, `Status.color` come as hex from the backend, so production button/banner/status colours can differ from static tokens. BB Pro status pills in the web portal are also API-coloured.

---

## 3. Typography

### Font files
| | Boss | BB Pro |
|---|---|---|
| Primary | **Roboto** Regular / Medium / Bold (`@font/roboto_*`) | **Roboto**, 12 static TTFs in `src/assets/fonts/` (Thin, Light, Regular, Medium, Bold, Black + italics) |
| Secondary | **Montserrat** (SemiBold 14 in `button_text_generic_style3`, Medium, Bold; used for ALL-CAPS button labels and "Due" tags) - legacy role. Also rare `roboto_mono_medium`, `poppins_bold`, `inter_medium`. | none. Android native only: `roboto_mono_medium`. |
| Where files live | **Not in this repo**: ship in `com.blackbuck:common-sdk`. In Figma use Roboto (Google Fonts) and Montserrat for the secondary role. | `src/assets/fonts/`, linked via `react-native.config.js` |
| Fallback | `@string/sans_serif(_medium)` = system sans (SDK-defined) | Text without `fontFamily` = platform default (Roboto on Android) |
| Hindi/regional fonts | none bundled (system Devanagari/Kannada/Tamil/Telugu fonts) | none bundled |

**Weight trap (BB Pro):** token suffix `SemiBold` = `Roboto-Medium` (500), not 600 (verified in `src/common/theme/fonts.js`). In Figma use **Medium 500** wherever a BB Pro token says SemiBold. Boss Compose also has FontWeight SemiBold (33 uses) and W500 variants, so Boss may truly use 600 in places.

### Unified type scale for Figma (Roboto)
Line heights are mostly implicit in both apps; values below marked * are observed, others default (use 1.2-1.4x).

| Style | Size / weight | Boss usage | BB Pro token (fonts.js) |
|---|---|---|---|
| `display/32` | 32 / Medium | `RobotoMedium32`, `RobotoBold32sp` | `textXXXXLargeBold` (32 Medium) |
| `display/30` | 30 / Bold | `RobotoBold`, login 24-30 | `textXXXLargeBold` (30 Bold) |
| `amount/24` | 24 / Medium (Bold in OTP) | BBPS balance amount 24 Medium; OTP digit 24 Bold | `textXXLargeSemiBold` (24 Medium, 50 refs), `textXXLargeBold` (24 Bold) |
| `title/20` | 20 / Medium (dialog/sheet title; Bold in confirm dialog) | `custom_toolbar` title, Compose sheet title | `textXXLargeMedium` (20 Medium), sheet picker title |
| `title/18` | 18 / Medium | `light_header_title` screen title (main XML toolbar) | `textXLargeSemiBold` (18 Medium, 81 refs); `textXLargeBold` 18 Bold (dialog title, 25 refs) |
| `heading/16` | 16 / Medium (also Regular, Bold) | list/section title, Compose sheet rows | `textLargeSemiBold` (16 Medium, 187 refs), `textLarge` 16 Regular, `textLargeBold` 16 Bold; stack-header title = 16 Medium #0D2C40 |
| `body/14` | 14 / Regular, Medium, Bold | default body (756 XML uses) | `textMedium` (Regular, 394), `textMediumSemiBold` (Medium, **474 most used**), `textMediumBold` (Bold, 123), `textMediumLight` (Light) |
| `caption/12` | 12 / Regular, Medium, Bold | sublabels, chips, bottom-nav labels | `textSmall` (416), `textSmallSemiBold` (Medium, 160), `textSmallBold` (51) |
| `micro/10` | 10 / Regular, Medium, Bold | tags, error line (`errorTextStyle` 10sp #D91E48) | `textXSmall` (61), `textXSmallSemiBold`, `textXSmallBold` |
| `badge/8` | 8 | n/a | `textXSSmall*` (CountBadge) |

Other sizes that occur: 13 (picker header labels Boss; Top-tab labels 13-14 BB Pro), 15, 22, 26, 28 (`textXXXLarge` Regular), 11. Treat as one-offs.

### Observed line-height / tracking / casing
- Boss Compose `lineHeight` (105 explicit uses): 20sp x32, 16 x25, 18 x20, 24 x10, 14 x4, 28 x3. XML `lineSpacingExtra`: 3dp (dialog text), 1sp, 5.6sp. `letter_spacing_04` = 0.04 only.
- BB Pro `lineHeight`: 20 (buttons), 33.6 (24 x 1.4, status titles), 16.8 (12 x 1.4), 21 (14 x 1.5), 16, 18, 32. `letterSpacing` 0.5 / 0.02 / 0.15; OTP uses 20 for digit spacing.
- Casing: see section 7. Boss legacy buttons are ALL CAPS via style (`textAllCaps`, 279 layouts); BB Pro `textTransform` uppercase 42 / none 31 / capitalize 18.

### Component type recipes
| Use | Boss | BB Pro |
|---|---|---|
| Screen title | 18 Medium #0D2C40 (XML toolbar); 20 Medium (`custom_toolbar`); Compose manual toolbar 18 SemiBold | Stack header 16 Medium #0D2C40; module headers 16 Bold; `ScreenHeader` 18 Medium + 12 #727F8B subtitle; `HeaderTitle` 18 Bold |
| Dialog title / body | 20 Bold (confirm dialog) or 16 Medium centred (alert dialog); body 14 at 50% alpha | 18 Bold centred; body 14 centred |
| Bottom sheet title | 18 Medium (XML), 20 Medium (Compose) | 18 Medium (`BBBottomSheetHeader`); picker 20 Medium |
| Button label | 14 Medium/Bold (Compose primary 14 Medium); Montserrat SemiBold 14 caps in legacy | 14 Bold (legacy); 16 Medium no transform (dialog / loans); Paper contained default label |
| Status screen | title 16 Medium in status colour + 20 Bold subtitle | title 24 Medium, lineHeight 33.6, centred; subtitle 14 #89949E |
| Field label / helper | hint 14, error 12 `#CD3333`/`#C10000` | Paper floating label; HelperText 12 (**unverified**, Paper default) |

---

## 4. Spacing, radius, elevation, stroke

Neither app has tokens. Figma scale proposed from usage counts.

### Spacing (dp / px; 1:1 in Figma)
| Variable | Value | Notes |
|---|---|---|
| `space/2` | 2 | BB Pro gap |
| `space/4` | 4 | both |
| `space/6` | 6 | BB Pro gap |
| `space/8` | 8 | both; gap between grey section bands (Boss) |
| `space/12` | 12 | both |
| `space/16` | 16 | **standard screen gutter and card padding, both apps** |
| `space/20` | 20 | legacy/Supply Boss screens; BB Pro roomy screens; dialog inner padding |
| `space/24` | 24 | sheets, dialog side margin |
| `space/32` | 32 | BB Pro large insets, modal margin |
| (off-grid) | 10, 15, 5 | common in code (BB Pro `padding` 10 x87, `gap` 10 x92; Boss 10/15 legacy); round to 8/12/16 for new designs and note |

Counts: Boss `layout_marginStart` 16 x319, 20 x236, 8 x232; Compose `.padding(16.dp)` x125. BB Pro `paddingHorizontal` 16 x370, 20 x91, 24 x83.

### Corner radius
| Variable | Value | Boss | BB Pro |
|---|---|---|---|
| `radius/2` | 2 | legacy buttons | legacy `ButtonComponent`, `BBTag` |
| `radius/4` | 4 | legacy XML default (buttons, inputs, "Due" tags, snackbar top) | Paper `roundness`, `MeetingCard` |
| `radius/6` | 6 | `ListCardItem` | `CardView`, dialog/OTP buttons (55 high), `DocumentPanel`, alert banners |
| `radius/8` | 8 | **Compose buttons, outlined fields, OTP boxes, shimmer card** | `SnackbarNotification`, `CallNowButton`, option row, OTP box |
| `radius/12` | 12 | cards (35 uses) | **Paper loans buttons, `LoanCard`, `Panel`**, `ButtonsDeck` |
| `radius/16` | 16 | dialogs, Compose sheet top (16 x16), toolbar pill, expandable option card | bottom-sheet top corners (OTP, selection) |
| `radius/20` | 20 | chip pill (`CommonRoundedChipItem`) | 51 uses |
| `radius/24` | 24 | Compose bottom sheet top | rare |
| `radius/pill` | 99-100 | 50/99 x6 | FAB, counter, swipe rail, 100 x34; `radius/circle` 50 |
| (legacy) | 15 | XML sheet top (`white_top_leftright_corner`) | legacy `BottomSheet` top |

### Elevation
- **Boss:** depth = grey page + white card + 1dp border; Compose almost never uses elevation. XML: 0dp x86, 4dp x46, 1dp/2dp x21 each, 8dp x15 (bottom-nav strip 8dp).
- **BB Pro recipes (verified in notes):** `CardView` black, offset (0,4), blur 6, opacity 0.05, elevation 4; header shadow #171717 offset (-2,4) opacity 0.2 blur 3 (module navigators only; default stack header has 0 elevation); sticky footer `Surface` elevation 5; selection-sheet footer shadow (0,-4) 0.1 blur 8; search bar elevation 4; legacy solid button elevation 5 with rgba(0,0,0,0.3).
- Proposed Figma effect styles: `elevation/card` = (0,4) blur 6 black 5%; `elevation/footer` = (0,-4) blur 8 black 10%; `elevation/header` = (-2,4) blur 3 #171717 20% (module headers only). Boss gets no shadows by default.

### Stroke
- Default 1 (Boss 1dp; BB Pro 1px, 360 uses). 1.5 for Boss pressed button outline and Compose OTP boxes; 2 (BB Pro connector/indicator, Boss OTP underline); 3 BB Pro legacy OTP underline; 4 BB Pro timeline hollow dot.
- Dividers: 1 thick (Boss 361 uses of 1dp; BB Pro `Divider` 1px #F6F6F6).

### Sizes
| Thing | Boss | BB Pro |
|---|---|---|
| Icon | 24 default (16, 18, 20, 32 also); bottom-nav icon 20; close icon 30 hit area (24 + 6 padding) | 24 dominant (16, 20, 22); tab icon 24 |
| Toolbar/header | 56 (`actionBarSize`) | native header (default); `ScreenHeader` row padding 4 + 40 icon buttons |
| Primary button | Compose `LARGE` **unverified** (inferred 48-52; one call overrides 52); legacy `button_height` 46; pills 36 | 48 (CallNow) - 56 (FAB, 56 high), dialog buttons 55, Paper ~40+ with label padding 8; OTP verify ~50 |
| Text field | XML ~48; Compose OTP box 48x48 | Paper outlined 56 (**unverified**); OTP box 40x40 |
| List row min | 56 (x18), 40 (x14) | 40 (Panel min), 48-60 common |
| Avatar / status icon | n/a | avatar 40 circle; `StatusIcon` 140 default |

---

## 5. Components catalogue

"SDK" = external Boss artifact, behaviour inferred from call sites (unverified visuals). Library component names in Figma are unknown; match by spec.

### 5.1 Boss (paths repo-relative to `boss`)
| Component | Path | Variants / states | Visual |
|---|---|---|---|
| `BaseComposeActionButton` (SDK) | used in `app/.../fuel/activate_fuel_card/generic_card/FuelGenericCreateCardScreen.kt`, `app/.../fastag/bbps_recharge/ui/common/BBPSBalanceAndRechargeCard.kt` | size `LARGE` (only one used); type default=primary / `SECONDARY`; enabled/disabled; loading (20dp white spinner, stroke 2dp replaces label) | Full width, fill #0D2C40, white 14 Medium, radius 8 (seen), height 52 override seen. Secondary = outlined/light. |
| Legacy buttons | `app/src/main/res/values/styles.xml` (`button_solid_dark_blue_regular`, `whiteButtonWithBlueBorder`, `ButtonRounded*`) | enabled / pressed (white fill + 1.5dp navy stroke) / disabled (#9B9B9B, white text) | Navy rect, radius 2-5, ALL CAPS label. Outline = white, 1dp #0D2C40. |
| Toolbar action pill | `light_header_title.xml`, `custom_toolbar.xml` | Help (call icon), Add | White, radius 16, 1dp #EAEBED, 14/12 Medium #1587FF, leading 24 icon |
| `BaseComposeText` (SDK) | 129 imports | size, weight, colour, align, maxLines | Roboto, navy default |
| `ActionLabelView` / `ActionLabelComposeView` | `app/.../supply/common/views/ActionLabelView.kt`, `app/.../common/ActionLabelComposeView.kt` | server-driven bg | Full-width promo strip, 44 leading icon, 12 Regular white title, right action icon |
| Banners / nudges | `BannerNudge.kt`, `AlertView.kt` (+ dots indicator), `FastagInfoAlertView.kt` | | Alert card carousel with dots |
| Text field XML | `CommonTextInputLayout` / `CommonTextInputEditText` | default / focused / error | Outlined, radius 4, 1dp #E2E2E2 all states, text 14 Medium, error 12 #CD3333, no error icon |
| `BaseOutlinedTextField` (SDK) | `CommonOptionalTextCheckboxItem.kt` | default / focused | 14 Roboto, radius 8, focused border+label #0D2C40, white fill |
| `SystemKeyboardTextField` (OTP) | `core/common/ui/src/main/java/com/blackbuck/ui/text_field/SystemKeyboardTextField.kt` | default / focused / error / disabled; 6 boxes default (4 used) | 48x48, radius 8, white, 1.5 border #CBD5E1 / #3B82F6 / #EF4444, digit 24 Bold #1E293B, gap 8 |
| `CustomSwitch` | `core/common/ui/.../component/CustomSwitch.kt` | on / off | Track 34x18 pill, thumb 24 circle; notification settings track on #B3EAD6, off #B0B0B0, thumb SDK `checked_thumb_color` (**unverified**). XML `GreenSwitch` #20BE79 |
| Radio/checkbox | `CommonComposeRadioButton`, `blackishBlue*Style` | | Navy tint #0D2C40; expandable option card: radius 16, 1dp #D3D3D3, expanded border #92C7FD + bg #F0F7FF |
| `CommonRoundedChipItem` | `core/common/ui/src/main/java/com/blackbuck/ui/component/chips/CommonRoundedChipItem.kt` (canonical; duplicate in `app/.../common/compose_components/`) | selected / unselected; optional 16 icon | Radius 20, 1dp; selected fill+border #1185FA white 14 Medium; unselected white, border/label SDK colours (**unverified**); padding 24h x 9v |
| Cards | `CardView` (117 layouts), `ListCardItem` (radius 6, padding 20/16/16/20), Compose `Card` | | White on #F2F2F2/#F8F8F9, 16 padding, radius 4/8/12, 1dp #EBEBEB; `BBPSBalanceAndRechargeCard` = label 14, amount 24 Medium, full-width 8-radius navy button |
| Due tags | `DueOrange/DueRed/DueGreen` styles | 3 colours | Montserrat Regular 12 caps, radius 4, 1dp tint border; orange #EF8433/#FEF7F2/#FCE7D9, red #C13031/#FBF4F4/#F4DFDF, green #0DBE7E/#E0F6EE/#D9F4EA |
| Toolbar | `app/src/main/res/layout/light_header_title.xml`; Compose `CommonComposeToolbar` (SDK) | with/without Help pill, action icon | 56 high, white, 16-padded back arrow navy, 18 Medium title ellipsized |
| Bottom navigation | `app/.../home/superBoss/BossBottomNavigationView.java`, `boss_bottom_nav_view.xml`, `home_bottom_nav_view.xml` | selected / unselected; red dot badge; amber strip above (#E69C3D, 12 black text) | 20 icon, 12 label; selected `colorAccent` (SDK, **unverified**), unselected #9B9B9B |
| Stepper | `StepIndicatorList` (Compose) | | Used in `GPSVLTDCertificationFormScreen.kt` |
| Confirm dialog | `common_dialog_white_bg_round.xml` | 2 buttons | White, radius 16, 24 side margin, title 20 Bold, subtitle 14 navy 50%, outline left + solid right, 16 Bold |
| Alert dialog | `dialog_common_alert.xml`; `CommonComposeAlertDialog` (SDK) | server-driven | White, radius 5, close X 16, 50 illustration, title 16 Medium centred, message 14 50%, primary button |
| Bottom sheet | `dialog_common_bottom_sheet.xml`; Compose `TimeLinePickerBottomSheet.kt` | | XML: top radius 15, notch 40x5 #E1E1E1, title 18 Medium. Compose: top radius 24, no handle, title 20 Medium + 16 close, divider #EDEDED, rows 16 padded 16 Medium |
| `GenericErrorDialog` | `core/common/ui/.../component/dialog/` | | Title "Some error occurred", single "Okay" |
| Snackbar | `CustomSnackbar.kt`, `custom_snackbar_view.xml` | SUCCESS / ERROR | Full-width navy #0D2C40 bar, 4 top radius, 22 icon, 14 Regular white, bottom anchored |
| Toast | platform `Toast` (225 uses) | | Unstyled |
| Loaders | `FullScreenLoader.kt` (68 spinner, stroke 4, #0BBB7A, track #E7F8F2, message 16 Medium); `ProgressMessageLoader.kt` (scrim #806C6C6C, white card, 45 spinner) | | |
| Shimmer | `ShimmerAnimationView`; bone #E1E1E1, 1500 ms | | 73 layouts |
| Empty / error | `content_fastag_empty_data.xml`, `RecyclerEmptyView.java` | | Big illustration `ic_no_*`, 14 centred text, 1-2 CTAs (36 pill, caps) |
| Payment status screen | `CommonComposePaymentStatusScreen.kt`, `PaymentStatusUtils.kt` | success #0BBB7A / failure #D91E48 / pending #FFA213 / processing navy | Close X 24, 48 icon, title 16 Medium status colour, subtitle 20 Bold centred, details block, footer 14 #9B9B9B |
| Date/time picker | `core/common/ui/.../data_picker/GenericDateTimePicker.kt` | | Navy header, 13 Medium white labels, Today/Yesterday chips |

### 5.2 BB Pro (paths repo-relative to `bb-pro`)
| Component | Path | Variants / states | Visual |
|---|---|---|---|
| `BBPaperButton` (current) | `src/feature/loans/components/BBPaperButton.tsx` | `mode` contained (~34 uses) / outlined (~132) / text (3); loading; disabled; 500 ms debounce | Contained blue #1554F6, white label; outlined 1px primary-tinted border (Paper default, **unverified**); radius 12; label padding-v 8, no uppercase |
| `ButtonsDeck` | `src/common/components/ButtonsDeck.tsx` | `theme` light/dark; 1-3 buttons; footer text | flex:1 buttons, margin 8, radius 12, container padding 8 |
| `SubmitButtonSurface` / `DualSubmitButtonSurface` | `src/feature/loans/components/` | single / dual | Sticky Surface padding 17, elevation 5, radius 12; dual = outlined left + contained right |
| `ButtonComponent` (legacy) | `src/common/components/ButtonComponent.js` | solid / disabled / outline; isLoading | Radius 2, solid #1554F6, disabled #8E8E8E, outline 1px rgba(0,0,0,.1); 14/700 capitalize |
| `CallNowButton` | `src/common/components/CallNowButton.tsx` | | 48 high, radius 8, #0D2C40, call icon 16 + "Call Now" 14 Medium |
| `FloatingLabelButton` | `src/common/components/FloatingLabelButton.js` | | Extended FAB 56 high, radius 100, blue, bottom 15 / right 25 |
| `SwipeButton` | `src/common/components/SwipeButton/` | enabled / disabled (#989898) | Pill rail h50, white thumb |
| `VerifyButton` | `src/common/components/VerifyButton.tsx` | VERIFIED / PENDING / NOT_VERIFIED / IN_PROGRESS / FAILED / MANUAL | Inline text button, icon 20 + bold text; green #0BBB7A / red #CD3333 / amber #FFA318 / blue #1554F6; disabled 50% |
| `BBTextInput` (core) | `src/common/core-components/BBTextInput.tsx` | default / focused / error / disabled; required `*`; helper (info/error); right slot; formatter | Paper outlined, outline #A0AAB1, focus #1554F6, floating label, height 56 (**unverified**) |
| `BBDropdown`, `LSDropdownPicker*` | `src/common/core-components/BBDropdown.tsx`, `src/common/ls-wrapper-core-components/` | loading, disabled | Read-only field + `menu-down` caret #A0AAB1, opens option bottom sheet |
| Radio / checkbox / switch | `LSRadioButtonGroup`, `RadioButton.js` (18 ring, #0D2C40 / #CCCCCC), `CheckboxButton.js`, `LSSwitch` | | Paper RadioButton; switch labels inactive #9B9B9B, active #0BBB7A |
| `BBCounter` | `src/common/core-components/BBCounter.tsx` | disabled | Pill stepper, 1px #E7E9EB, +/- #1587FF 16 Medium |
| OTP | `OTPBottomSheet/BBOTPTextInput.tsx`, `BBOTPBottomSheet.tsx` | error; resend timer (30 s) | Boxes 40x40, radius 8, 1px #0D2C40@20%, error #CD3333; sheet radius 16; verify button #1554F6 (disabled #0D2C40@50%), radius 6, white 14 Medium UPPERCASE |
| Search | `SearchInput.js`, `SearchBar.tsx` | | Back arrow 24, 16 text #717171, bottom border #CCCCCC |
| `BBChip` | `src/common/components/BBChip.tsx` | selected / unselected / disabled | Paper outlined; unselected white, 1px #C4C4C4, black text; selected fill+border #0D2C40, white; min width 70, label weight 600 |
| `Tag` / `BBTag` / `CountBadge` | `src/common/components/` | | Tag radius 4, 12 Medium white, default #0BBB7A; CountBadge 12 circle #0BBB7A, 8 white ("+9"); BBTag 40x15 rgba(0,0,0,.3) |
| `CardView` | `src/common/components/CardView.js` | | White, radius 6, shadow (0,4) 6 5% |
| `LoanCard` | `src/feature/loans/components/LoanCard.tsx` | | Radius 12, margin-h 16, margin-top 12, padding 16, name 16 Medium + chevron |
| `Panel` | `src/common/components/Panel.tsx` | completed / disabled(50%) / mandatory | Form-section row, check-circle 24 (#0D2C40 done, #909EA7 not), chevron, min 40, radius 12 |
| `StatusIcon` | `src/feature/loans/components/StatusIcon/index.tsx` | PENDING #909EA7, REJECTED #CD3333, UNDER_REVIEW #F5A623, APPROVED #0BBB7A | 3 concentric discs, 140 default |
| `Timeline`, `StepHorizontal` | `src/common/components/timeline/`, `StepHorizontal.js` | tick / filled / hollow / grey | Dot 18, connector 2 |
| Stack header | `src/feature/navigators/AppNavigator.js:1069-1079` | normal / mimic (#1185FA bg) | White, no shadow, title 16 Medium #0D2C40 |
| `ScreenHeader` | `src/feature/loans/components/ScreenHeader.tsx` | light / dark; left/right icon buttons | Title 18 Medium, subtitle 12 #727F8B, shadow default on |
| Bottom tab bar | `src/feature/navigators/HomeNavigator.js:77-90, 531-540` | active / inactive; badge | White, icon 24, active #1554F6 (sales) / #D91E48 (others), inactive #9B9B9B |
| Top tabs | `src/common/components/TabNavigator.js` | | White, indicator + active #0D2C40, inactive #9B9B9B, 13-14 Medium no transform |
| `BBBottomSheet` + `BBBottomSheetHeader` | `src/common/core-components/bottom-sheet/` | snap ['90%'] | gorhom modal, no drag handle, header 18 Medium + X 24, padding 24/16 |
| `BBDynamicBottomSheet(Modal)` | `src/feature/loans/components/dynamic-bottom-sheet*/index.tsx` | auto-height max 90% | Recommended default for new sheets |
| `BottomSheetOptionPickerV2` | `src/feature/loans/components/BottomSheetOptionPickerV2.tsx` | | Title 20 Medium, rows 16 Medium #0D2C40 + 12 description, 1px dividers |
| `BBDialog` | `src/common/components/BBDialog.tsx` | 1-2 buttons | 80 icon disc (#F5A623 on #FFF4E2), title 18 Bold centred, divider #EDEDED, buttons 55 high radius 6 16 Medium, outlined navy + solid navy |
| `ConfirmationModal` | `src/feature/loans/components/ConfirmationModal.tsx` | primary red (#CD3333) or blue | Radius 10, margin 32, message 18 Bold, buttons outlined + contained |
| `SnackbarNotification` | `src/common/snackbar-notification/SnackbarNotification.tsx` | info #1A1A1A, error #CD3333, success #27AE60 (white text), warning #D98F1E (**black** text); icon hidden by default | Radius 8, 3 s, message 75% screen width (verified bg/text) |
| Alert banners | `src/common/components/AlertError/Success/Warning*.js` | with icon / subtitle | Radius 6, 12 centred; error #C10000 on #C100000C etc. |
| Bottom sticky alert | `BottomStickyAlert*.js` | error / warning | Full-width, pad 12 |
| Loaders | `BBPageLoaderView`, `BBFullPageLoaderView` | | Spinner #0BBB7A, scrim 30%; no skeleton |
| Empty / error | `NoDataFound.tsx` (60 circle #F6F6F6, 14 #5D727F), `ErrorView.js`, `ReloadDataView` | | Small icons only |
| `BBStatusView` | `src/feature/loans/components/BBStatusView.tsx` | success / error / pending | StatusIcon + 24 Medium title #0BBB7A/#CD3333/#DC8C09 + 14 #89949E + ButtonsDeck, padding-h 40 |

### 5.3 Boss to BB Pro equivalence
| Concept | Boss | BB Pro | Visual delta to respect |
|---|---|---|---|
| Primary button | `BaseComposeActionButton` | `BBPaperButton` contained / `SubmitButtonSurface` | Navy #0D2C40 radius 8 vs blue #1554F6 radius 12 |
| Secondary button | `SECONDARY` / `bg_solid_white_blue_border` | `BBPaperButton` outlined | |
| Dialog buttons | confirm dialog (outline + solid navy, radius 16 dialog) | `BBDialog` (55 high, radius 6, navy) | Both navy |
| Text field | `CommonTextInputLayout` / `BaseOutlinedTextField` | `BBTextInput` | Boss 4-8 radius #E2E2E2; BB Pro Paper outline #A0AAB1 floating label |
| OTP input | `SystemKeyboardTextField` (48, #3B82F6 focus) | `BBOTPTextInput` (40, navy 20% border) | |
| Switch | `CustomSwitch` | `LSSwitch` | Boss on-track #B3EAD6 |
| Chip | `CommonRoundedChipItem` (selected #1185FA, radius 20) | `BBChip` (selected #0D2C40, radius Paper) | Selected colour differs |
| Card | `Card` white on #F2F2F2 | `CardView` / `LoanCard` | Radius 4-12 / 6-12 |
| Toolbar | `light_header_title` (56, 18 Medium) | stack header / `ScreenHeader` (16-18 Medium) | |
| Bottom nav / tabs | `BossBottomNavigationView` (20 icon, 12 label) | `HomeNavigator` bottom-tabs (24 icon) | Active colour SDK vs blue/red by role |
| Bottom sheet | Compose sheet radius 24 / XML 15 | `BBDynamicBottomSheet` radius 16 | |
| Alert dialog | `CommonComposeAlertDialog` | `BBDialog` / `ConfirmationModal` | |
| Snackbar | `CustomSnackbar` navy | `SnackbarNotification` 4 colours | Boss one colour |
| Loader | #0BBB7A spinner | #0BBB7A spinner | Same |
| Skeleton | `ShimmerAnimationView` #E1E1E1 | none | Do not draw skeletons for BB Pro |
| Status screen | `CommonComposePaymentStatusScreen` | `BBStatusView` | Icon 48 vs concentric 140 |
| Empty state | illustration + CTAs | 60 circle icon + text | |

---

## 6. Iconography and illustration
- **Boss:** Android VectorDrawables in `app/src/main/res/drawable/` (885 vectors, 787 named `ic_*`); sizes 24 (default), 16, 18, 20, 32. No icon font. Naming: `ic_nav_*_selected/_unselected`, `ic_no_*` (empty), `ic_error_*`. Toolbar icons navy #0D2C40; action icons #1185FA/#1587FF; inactive #9B9B9B. Lottie animations (47 layouts) for illustration; remote images via `BaseAsyncImage`. Map style `res/raw/uber_map_style.json`.
- **BB Pro:** three systems. (1) `react-native-vector-icons`, default **MaterialCommunityIcons** (`src/common/components/Icon.tsx`; also Ionicons, Entypo, MaterialIcons, FontAwesome, Feather, AntDesign), sizes 16/20/22/24 (24 dominant). (2) Raster PNG icons `src/assets/icons/` (~115 images, @1x/@2x/@3x) registered in `src/common/theme/icons.js` (`IC_*`), active/inactive pairs for tabs. (3) 16 SVGs via `BBIcon.tsx` (logos, `grade_1..4`, vehicle views). Icon colour: navy default, #909EA7/#9B9B9B inactive, white on filled buttons, status colours for state.
- **No illustration library** in BB Pro (empty/error use small icons); Boss uses larger `ic_no_*` illustrations and Lottie. Match icon style to the app: Boss = outlined Material-like vectors; BB Pro = MaterialCommunityIcons glyphs.

## 7. Localization and copy conventions
| | Boss | BB Pro |
|---|---|---|
| Languages | English (default), Hindi, Kannada, Tamil, Telugu (`app/src/main/res/values{,-hi,-kn,-ta,-te}`); ~82-83% non-English coverage; **design for Indic text expansion and taller glyphs** | English only (`src/common/i18n/en.js`); no regional files |
| RTL | not designed | not supported; design LTR only |
| Casing | Title Case for buttons/labels/headings ("Add Truck", "Buy FASTag Now"); sentence case for messages; ALL CAPS via style on legacy buttons (279 layouts) and 61 literal-uppercase strings | Mixed; newer Paper buttons sentence/Title case; legacy CTAs ALL CAPS ("SUBMIT", "VERIFY AND SUBMIT"); required fields end with red `*`; "Label : " pattern in some forms |
| Rupee | **"₹ 1,234"** (space; `amount_format` = `₹ %s`); Indian lakh/crore grouping; whole numbers no decimals, otherwise 2 decimals; rare "Rs.750/-" legacy | `₹` added in code, **inconsistent**: `₹{n}` and `₹ {n}` both occur; ranges `₹{lo}–₹{hi}`; Indian grouping via `en-IN` (`₹1,20,000`) where formatted. **For new designs use "₹ 1,23,456" (Boss form) unless the user says otherwise.** |
| Dates | `dd MMMM yyyy`, `hh:mm a`; relative "Just now", "5m ago", "2h ago"; ranges Today / Yesterday / Last 7 / Last 30 / Custom | `DD MMM YYYY` (12 Jan 2026), `hh:mm A`, `DD MMM YYYY [at] hh:mm A`; "Resend in 30 sec" |
| Tone | Conversational, second person, plain | Short direct one-liners; default error "Something has gone wrong" + "Reload"; empty "No data found" |
| Phone / vehicle | 10 digits, +91, starts 6-9; truck numbers in standard format | same market |
| Brand words | "BlackBuck", "FASTag" (not FASTAG), FO, Indents/Leads/Orders, CRO/ASM/TSL (BB Pro sales roles) | |

## 8. Layout conventions
- **Both portrait phone, light only.** Frame 360x800 (Android). Gutter **16** (Boss legacy/Supply 20; BB Pro roomy 20/24, status screens 40).
- **Boss:** status bar white with dark icons, nav bar `colorPrimary` #1E2026 in theme (edge-to-edge helper `applySystemBarInsetsAndStyling` on many screens). Compose scaffold: page #F2F2F2, white top bar (56) + 8 gap, bottom bar = white column with 16-padded full-width CTA, `navigationBarsPadding().imePadding()`. Sections separated by 8 grey bands. Sticky bottom CTA is the standard pattern.
- **BB Pro:** `SafeAreaView edges=['bottom','left','right']` at root (`src/feature/navigators/AppNavigator.js:1085`); top inset handled by each header; translucent dark-content status bar. White screens by default; grey page for card lists with 16-inset white cards. Sticky footer = `Surface` padding 17 elevation 5 or `ButtonsDeck`; FAB bottom 15 / right 25.
- **Touch targets:** neither app enforces a minimum (Boss close icon 30, chips 24-36; BB Pro Paper IconButton 40, many 24 icons use hitSlop 8-30). **Design new work with a 48 minimum hit area.**
- Bottom sheets add bottom safe-area; dialogs have 24 side margin (Boss) / 32 (BB Pro `ConfirmationModal`).
- Press feedback: BB Pro Android ripple rgba(0,0,0,0.1); 500 ms debounce on buttons.

## 9. Rules for the Figma agent when a needed component does not exist
1. **Search first.** Query the relevant library (Boss or BB Pro, section "Figma library links") by name and visual spec; try the equivalence table (5.3) before concluding something is missing. Never fabricate component keys.
2. **Pick the app/surface and its authoritative set** (section 1). Do not mix Boss and BB Pro components in one screen. Do not use legacy styles for new screens.
3. **If no component fits:** build it from library variables only (colour/spacing/radius/type from sections 2-4), as a local frame named `[NEW] <ComponentName>`, using auto-layout, and keep it composed of existing atoms (buttons, text fields, icons).
4. **If no matching variable exists:** use the nearest listed token, never a raw hex, and add a text annotation `TOKEN GAP: wanted <value>, used <token>`.
5. **Flag it visibly:** put a sticker/annotation next to the frame: `Component missing in <Boss|BB Pro> library: <name> - proposed spec: <size/colour/radius>`, and list all such items in a final "Open design-system gaps" summary in the reply.
6. **Do not "fix" the system.** Keep values from this file even if they look inconsistent (e.g. SemiBold = Medium 500 in BB Pro).
7. **Anything marked unverified** (SDK tokens, Paper defaults) must carry a small annotation in the design.
8. **Ask, don't guess,** when Boss navy vs BB Pro blue primary is ambiguous, or the screen needs dark mode, tablet, RTL or landscape (none exist).

## 10. Web surfaces tokens (brief)
All three are Next.js + Tailwind 4, Geist Sans/Mono fonts; no white-labelling; none match the native apps exactly.
- **`tzf-customer-portal`** (desktop, Ant Design 5 + a little shadcn; commit bedb936): primary CTA red #D52544 white text, 53 high, radius ~2-4, shadow-md; navy #0D2C40 for Recharge/headings/toast; link blue #0086CC / #1185FA; active sidebar bg #F0F7FF; error #CD3333 / #FF1248; success #0BBB7A; app bg #FBFBFB; borders #EDEDED / #D8D8D8; strip #F6F6F6. 416 login card, sticky header 10vh, 256 sidebar, 445 modals, toast 3 s navy with check. Title text-2xl bold, table text-sm. Landing page is black with red glow. shadcn variables unmodified (not brand).
- **`tzf-activation-web-sdk`** (mobile web, shadcn base-nova; commit 2d519f4): ports BB Pro tokens verbatim (`common/theme/colors.ts`, `fonts.ts`): primary #1554F6 (#007AFF submit/retry), navy #0D2C40, #5D727F/#909EA7 secondary, bg #F6F6F6, success #0BBB7A/#0AAA6F, error #C10000/#E53935/#CD3333, FASTag class palette as above. Type: 30/700, 18/500, 16/500+400, 14/700+500+400, 12/700+500+400. 56 header, 16 gutters, radius 8-12, pill FAB, drawers for pickers, 40 spinner, toasts top-centre (sonner).
- **`tzf-full-kyc-sdk-web`** (mobile web, shadcn new-york; commit 0d6387b): generic Tailwind: bg gray-100, cards white p-16, primary blue-600 (disabled blue-400) rounded-lg full width, success green-100/800, error red-600/700, rejection banner red-100/800, OTP boxes 48x48 radius md, 2-col upload grid gap 16, dark camera screens #1A2B3C / #2C3E50, toasts bottom-centre. Not BB Pro #1554F6.
- Contact numbers differ across customer-portal screens (copy consistency issue).

## 11. Known gaps
1. **Boss SDK tokens** (`blueish_black`, `text_sub_title`, `colorAccent`, `red`, `grey80`, `bg_grey`, `blue_rating`, `checked_thumb_color`), Compose theme, fonts, `BBButtonSize.LARGE` height/radius: **unverified**. `blueish_black` presumed #0D2C40; `colorAccent` (bottom-nav active, links) unknown.
2. **BB Pro Paper MD2 defaults unverified** (no `node_modules`): outlined input height, label behaviour, helper size 12, error #B00020, outlined-button border, IconButton 40, Chip 32, Dialog radius.
3. Primary action colour is surface-dependent in BB Pro (blue vs navy) with no rule in code; tab accent depends on role.
4. Line heights mostly unspecified; spacing/radius/elevation values are usage frequencies, not intent.
5. Boss and BB Pro disagree on error, warning, divider, page background and input border colours (section 2); no cross-app standard exists.
6. Server-driven colours/copy in Boss (SimpleActionButton, dialogs, banners, status chips) and TZF web forms.
7. Motion tokens not catalogued (Boss: slide 300 ms, shimmer 1500 ms, snackbar scale 100 ms; BB Pro: none).
8. BB Pro components not inspected: `Calendar`/date pickers, `BBMapView`, `MultiSlider`, `BBCamera`, `BBSelect/*`, caller-ID overlay, splash/launcher assets. Boss: Boss launcher/splash assets, `feature/*` screen-specific components.
9. Several BB Pro tokens referenced but undefined (`fonts.textMediumNormal` in `DoubleLabelledSwitch.js`) render at default size.
10. No dark mode, tablet, landscape, RTL or accessibility specs exist in either app.
