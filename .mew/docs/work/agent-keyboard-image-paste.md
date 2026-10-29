---
title: "Mobile keyboard image paste fix and verification"
description: "Records the removal of CodeMirror's plaintext-only property from the agent input and regression test results for image and text pasting. Actual Android keyboards and production application remain unverified."
created: "2026-10-27"
updated: "2026-10-27"
---

## Purpose and changes

Addressed a report that images from a mobile keyboard clipboard could not be pasted into the agent input. Confirmed that CodeMirror's default styles apply `read-write-plaintext-only` to the editing host and overrode it with `read-write` only in the agent input. Preserves the existing image attachment callback and plain-text pasting. Current behavior and support boundaries follow the [input feature contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md).

## Verification

- Running the new `server/agent-composer-clipboard-ui.test.ts` without the fix failed in all four viewport and theme combinations because of the plaintext-only property. After the fix, isolated Chromium checks at 1100 and 390px with light and dark backgrounds verified the computed editing property, browser permission to insert images, single delivery to the image callback and preservation of existing content for synthetic `paste` and `beforeinput` events, and pasting HTML as plain text at the cursor.
- The new UI checks and 19 related tests in `clipboard-images.test.ts` and `agent-composer-document.test.ts` passed.
- `npx tsc -b` and targeted oxlint checks passed with exit code 0. The input component's 1 existing React ref warning remains. Impeccable `detect` returned an empty array.
- The initial pre-fix run of `agent-composer-attachments-ui.test.ts` failed the new property check and also timed out waiting because an existing pending-upload tag was hidden, then terminated at the overall 60-second limit. Changes to that file were not retained; regression checks for this bug were separated into an independent file.

- The 486 description checks in `npm run check:docs` passed. At the time, the full link check failed on 21 links to documents deleted or being written outside this work.

## Application and limitations

Image selection on actual Android devices, Brave, and keyboard clipboards was not checked. Support is not guaranteed for OS, keyboard, and browser combinations that do not pass image files to the web. No app build, deployment, or server start, stop, or restart was performed; the user must verify on a physical device after applying the change to production.
