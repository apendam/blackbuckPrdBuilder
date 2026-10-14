---
name: app-ui-map
description: Reads a mobile app repository (Android, Kotlin/Java/Compose/XML, or React Native/Flutter) and writes a design-facing Markdown map of the app — screens, navigation, design tokens, reusable components, states and user-visible copy — so a Figma agent or the PRD Builder can reason about the app's UI without opening the code. Use when the user asks to document, map, or summarise an app's UI/screens/design system from its repo, e.g. for the Boss App (bb-supply-fo-android) or the BB Pro app (blackbuck-pro-app).
---

# App UI Map

Run this **inside a clone of the app's repo** (the cloud PRD Builder session cannot read the BLACKBUCK-LABS repos until the GitHub App is granted org access). The output is one Markdown file describing what the app looks like and how it flows, written for designers and PMs, not engineers.

## Rules

1. **Never assume — ask or mark TBD.** If a screen's purpose, a colour's role or a state is not evident from the code, write `TBD` and list it under Open items. Do not invent screens.
2. **Describe, don't dump.** No code listings, no API endpoints or payloads, no class dumps. One line per screen/component; the code pointer is the only technical detail.
3. **Every item gets a source pointer** in the form `path/to/File.kt :: SymbolName` plus the commit short-SHA the file was read at. Pointers are leads, not current truth.
4. **Stay inside the UI layer.** Business logic belongs in the PRD; do not summarise repositories, use-cases or network code except to name which user action triggers a screen change.

## Process

1. **Identify the stack.** Check build files and top-level folders (Compose vs XML views, Fragments vs Activities, navigation graph or NavHost, React Native/Flutter equivalents). State the stack in the file header.
2. **Find the entry points.** Launcher activity, the navigation graph / NavHost / router, bottom-nav or drawer definitions, deep-link handlers.
3. **Build the screen inventory.** One row per screen: name, purpose in plain words, how a user gets there, where it leads, source pointer. Group by feature area using the app's own module/package structure.
4. **Extract design tokens** from the theme layer (colour resources/theme file, typography, dimens/spacing, shapes, elevation, dark-mode variants). Record names and values; note which are actually used for primary actions, backgrounds, error and success.
5. **List reusable components** (buttons, cards, banners, inputs, bottom sheets, dialogs, list items, toolbars): variants, states, where used most.
6. **Capture states per key screen:** loading, empty, error, success, and any blocked/disabled variants, as shown to the user.
7. **Collect user-visible copy** for the main flows from string resources, grouped by screen. Keep only strings a designer needs; skip debug or log strings.
8. **Draw the navigation map** as a Mermaid flowchart (screens as nodes, user actions as edge labels). Split by feature area if it exceeds ~25 nodes.
9. **Note feature flags / remote-config-driven UI** that change what is shown, without describing the flag plumbing.
10. **Write the file** using `references/app-ui-map-template.md`. Save as `app-ui-map.<app-name>.md` at the repo root (and tell the PM where it is). End with an Open items list of everything marked TBD.

## Check before finishing

- Every screen reachable from the launcher appears in the inventory, or is listed under Open items as unreached.
- Every colour/type token named in components exists in the tokens section.
- No endpoint, JSON, or network-layer class names slipped in.
- Header records repo URL, branch, commit SHA and date read.
