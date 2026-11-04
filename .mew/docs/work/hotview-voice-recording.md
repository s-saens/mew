---
title: "Hotview voice recording implementation"
description: "Records the November 4 implementation of /voice recording, local playback and upload retry, mapped audio insertion, and microphone policy plumbing. Separates automated verification from blocked Obscura UI checks and pending user-managed host and central application."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and result

Implemented the [voice recording task](<../../tasks/Done/Voice recording in Markdown Hotview.md>): insert local controls from `/voice` or `/녹음`, request the browser microphone only on Start, show elapsed time, then turn the stopped recording into persistent audio playback through the existing document asset upload. Upload failure keeps local playback and supports Retry. External server-file tabs and read-only documents cannot start a session.

The [Markdown feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#voice-recording) owns behavior and limits. The [package contract](../development/packages.md#editor-package) owns integration and the host option. A local decoration avoids persisting unfinished recording state; transaction mapping preserves placement, and context invalidation prevents late uploads entering another document. Capture cleanup includes permission results arriving after cancellation, recorder errors, microphone tracks, timers, and object URLs. Recordings use a supported browser container with a matching filename and the existing 25 MiB upload limit.

The direct host previously prohibited microphone access. [ADR 0131](../decisions/0131-hotview-voice-recording.md) records same-origin permission and source-origin delegation through the separate Mewlink launch frames. The [remote access contract](../development/remote-access.md#microphone-permission) owns that policy and application boundaries. Existing unrelated changes in both repositories are excluded from this task's commits.

## Local verification

- 35 native capture, actual recording component, and Editor/ProseMirror/Yjs/React hook tests pass: final chunks, supported MIME types, empty/error/oversized recordings, late permission cleanup, local widget isolation, source round-trip, read-only playback, transaction-mapped insertion, retry, and path/API/editor/editability/deletion/unmount invalidation.
- Host security middleware tests pass for same-origin microphone policy, preserved sensitive-feature denial, CSP, and TLS headers. The separate Mewlink frame-policy test passes for all three iframe construction paths.
- `npm run build` passes, including TypeScript checking. The separate Mewlink type check and build pass.
- `npm run lint` passes with repository warnings. Focused test lint passes.
- Documentation metadata/link checks and changed diff whitespace checks pass.
- The related editor schema, incremental Markdown and shared translation tests pass. The broader `src/ui-localization.test.ts` scan fails on existing literals in unrelated API/task/debugger sources; none of the reported paths are changed by this task.
- `node --test server/voice-recording-ui.test.ts` cannot connect to the user-managed Obscura CDP endpoint. No browser fallback or service startup was attempted. Desktop/mobile layout, slash-menu interaction, screenshots, and actual native microphone capture remain unverified in a browser.
- The design detector reports only the unchanged existing blockquote border in `editor.css`; no new recording-surface findings were reported. This mechanical scan does not substitute for browser inspection.

## Application and remaining limits

No server lifecycle operation or deployment was performed. The root build updates local `dist/` assets; the changed direct HTTP microphone header requires a user-managed host restart. The separate Mewlink launcher source requires its own central rollout. Existing central launchers can still block cross-origin microphone access until updated.

Physical-device recording quality, browser permission UI, codec interoperability, and actual Mewlink recording need user verification after application. An interrupted or canceled upload can leave an unreferenced asset under the existing upload lifecycle. Pending recordings are local and disappear when the editor closes or reloads.
