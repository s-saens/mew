---
title: "Debugger Panel Input Forms and Collapse State Cleanup"
description: "Records changes that make the mobile debugger's breakpoint and watch input forms open on demand and adjust collapse state and touch target sizes, along with local validation results, existing advanced UI and documentation check failures, and the scope not applied."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

Reduced the problem of breakpoint and watch input forms and detailed options pushing inspection results out of view on mobile. Use **+** beside the Breakpoints and Pinned Watches headings to open and close the forms; adding an item closes the form. Item counts appear as badges, and expansion indicators for detailed options are consistent. Execution controls, input fields, and section headings maintain a minimum height of 44 px in touch environments. The small settings button in the header follows the existing header size.

User-adjusted collapse states are preserved across updates within the same execution state. Default states are applied when a transition between paused and running changes the default display conditions. [External DAP Debugger](../features/terminals-agents-automation/external-dap-debugger.md#panel-display-and-controls) owns the current behavior and supported scope.

## Local Validation

- `node --test server/debugger-ui.test.ts`: passed. At 1366, 768, and 320 px, checks covered initially hidden forms, keyboard operation of buttons beside headings, form closure after adding breakpoints and watches, source search, condition saving, stack expansion when paused, preservation of collapse states after stepping, prioritization of changed variables, and horizontal overflow. At 320 px, the execution buttons' 44 px touch target size was also verified. Desktop and mobile captures in ready, input, and paused states were reviewed.
- `npx tsc -b`: passed.
- `oxlint` for the changed debugger components and UI tests: completed without errors. Existing ref and effect warnings in the panel remain.
- `server/debugger-advanced-ui.test.ts`: failed while waiting for `.cm-debugger-marker` to appear. The same failure at the same point was confirmed on the pre-change HEAD extracted to a temporary folder. This work is not considered to have passed full advanced-feature validation.
- `npm run check:docs`: failed because of missing frontmatter in `docs/지원서.md` that predated this work. A separately run link check also failed because of existing missing links, including README image paths and feature MOCs. Metadata and local links in the documents changed here were checked separately.

## Scope of Application and Remaining Limitations

Validation was performed in an isolated browser fixture. Screens on actual phones or the running instance were not checked. No app build, deployment, launcher execution, or server restart was performed; applying the changes to the production UI requires the user to build the app.
