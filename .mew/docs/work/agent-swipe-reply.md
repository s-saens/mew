---
title: "Agent message swipe reply"
created: "2026-11-17"
updated: "2026-11-18"
description: "Records the original swipe-to-reply implementation and the move from draft quotes to a composer preview, with local checks and application limits."
---

Agent conversations now let users swipe a text-bearing question or answer left, or choose its Reply button, to add an editable Markdown quote to the composer. This provides context for a follow-up without replacing the existing draft or introducing a separate message transport. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#reply-to-a-message) owns the current behavior.

The reply gesture and mobile panel swipe regression tests passed locally. `npm run build` and `npm run lint` passed; lint reported warnings. `npm run check:docs` validated 844 descriptions but failed on 39 existing broken or invalid links. The build updated the local `dist/` assets served by a running instance; no deployment or server lifecycle operation was performed. Physical-device interaction has not been verified.

## Composer preview (2026-11-18)

The original interaction placed the quote in the editable draft as soon as the user selected a message. Mew now shows the selected source and an excerpt above the editor and adds the quote when the user submits. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#reply-to-a-message) describes cancellation and submission.

Isolated Chromium tests passed at desktop and mobile widths in light and dark themes. They exercised mouse and emulated touch swipes, keyboard selection, focus, cancellation, and the submitted quote. The gesture, mobile panel swipe, and shared translation tests passed. The existing connection test failed on automatic tab switching, and the repository localization scan flagged untranslated literals. Both failures also reproduced against the previous commit. The build and lint passed with warnings. The documentation check passed description validation and reported 39 existing link errors.

The local build updated `dist/`. This change was not deployed or tested on a physical phone.
