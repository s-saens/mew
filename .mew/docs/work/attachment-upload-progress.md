---
title: "Attachment upload progress"
description: "Records the November 10, 2026 implementation of per-file upload percentages in the editor and agent input and the November 18 switch to the shared PercentIndicator, local verification, and the boundary before application to a running instance."
created: "2026-11-10"
updated: "2026-11-18"
---

## Purpose and result

On November 10, the editor and agent input began showing how far each attachment upload had progressed, including images, video, audio, and other files. Each pending upload displayed a percentage during transfer and remained pending while the server responded. Agent attachment tags kept their circular spinner. Current behavior belongs to the [editor attachment contract](../features/document-code-media-editing/links-file-references-and-attachments.md) and [agent input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md).

## Verification and limits

The direct and remote transfer and editor tests passed locally (19 tests). The isolated Chromium agent composer test passed (50 tests) without starting a server. `npm run build` and `npm run lint` passed; lint reported warnings. `npm run check:docs` found no errors in 780 descriptions but failed on 38 existing link errors, including missing MOC and decision README targets and an asset link in a separate task document. Real-device upload behavior remains unverified. No server lifecycle operation or deployment was performed; the build updates `dist/`, which an existing server may serve.

## PercentIndicator (2026-11-18)

The editor and agent input now share the [PercentIndicator](../development/ui-recovery-feedback.md#percent-indicator) to show upload progress in a compact ring. The ring keeps its center clear and fills clockwise with the theme accent.

The focused Chromium and upload tests passed (54 tests). The composer test checked 0%, 47%, and 100% while pending and the file icon after completion, at desktop and mobile viewport widths in both themes. `npm run build` passed, including TypeScript checks. `npm run lint` passed with warnings. Documentation checks found no description errors and reproduced the 39 existing link errors. Physical-device verification and deployment remain pending.
