---
title: "Image preview and attachment editing"
description: "Implementation task for shared Hotview and agent image previews,
  subtle preview transitions, popup-sized drawing canvases, and non-destructive
  image editing with the existing drawing board."
done: true
tags:
  - 기능
assignees:
  - songsh5775@gmail.com
startDate: "2026-11-02"
date: "2026-11-02"
---

# Image preview and attachment editing

## Requirements

- Add an enlarge icon inside the upper-right corner of Hotview images, including read-only images. Reuse the image preview used by agent attachments.
- Fade the shared preview in and out subtly, respecting reduced-motion preferences. Keep close, outside-click, and Escape behavior.
- Replace the drawing board’s unbounded canvas with a finite canvas initially sized to its popup drawing area. Preserve zoom and pan for navigation; preview and export share the same canvas bounds.
- Add a pencil action to editable image previews. Open the existing drawing board with the image as its initial layer and the canvas fitted to the image. Save a new PNG rather than overwriting the original asset.
- In editable Hotview, replace only the selected image reference after upload succeeds, preserving its alt text, title, and display width. In the agent composer or queued draft, attach the edited PNG to the originating input. Sent-message previews remain read-only.
- Preserve drawings on load/upload failure and show a recoverable error. Canceling leaves the original reference unchanged. Late saves must not affect another document, project, or queued draft.

## Interpretation

The original editing request ended mid-sentence after proposing reuse of the drawing component. The save and read-only boundaries above complete that flow using the existing document and agent attachment contracts.

## Acceptance and verification

- Cover preview entry, keyboard dismissal, transitions, read-only behavior, image initialization, finite canvas export, save/cancel/failure, and stale-target protection with automated regression tests.
- Check desktop and narrow mobile layouts, run applicable tests, lint, documentation checks, and `npm run build`. Do not start, stop, restart, or deploy servers.
- Update the owning image and drawing contracts and add an implementation work record with actual verification results.
