---
title: "Immediate attachment tag dragging"
description: "Records the implementation that allows attachment tags in agent input to be dragged immediately with a mouse or pen, retention of the existing touch long press, regression, type, and lint verification, and the scope not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

Fixed an issue where grabbing an attachment tag and moving immediately canceled the move. Current interaction rules are in [Agent input, mentions, skills, and attachments](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md).

Extracted move initiation into a shared function in `agent-composer-attachments.tsx`. A mouse or pen starts a move when moved more than 4px while held down; touch retains the existing 350ms long press and cancellation on early movement. Tag ghosts and insertion cursors, distinguishing preview clicks from drags, cancellation with Esc or a drop outside the input field, and edit history use the existing handling.

Verification results:

- `node --test server/agent-composer-attachments-ui.test.ts`: Confirmed that the added immediate mouse drag regression test failed before the fix. After the fix, all 50 checks passed in isolated Chromium at 1100px and 390px in light and dark themes. Verified body text and tag positions after moving, no preview activation, Undo/Redo, and existing long press, cancellation, upload, and deletion behavior. The CDP touch pointer long press check also passed.
- `npx tsc -b` and `npx oxlint` on the target files: passed.
- The Impeccable check of the changed UI found no issues. Isolated desktop and mobile screens were also checked.
- The document description check passed. The full link check failed with 18 existing errors referencing feature catalog and task files deleted in separate work. Links in the documents changed here are valid.

No app build, deployment, or server application was performed. Physical interaction on actual touch devices and pen hardware was not verified.
