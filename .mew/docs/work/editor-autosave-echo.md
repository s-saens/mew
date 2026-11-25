---
title: "Preserve newer edits after a Markdown autosave"
description: "Records the November 25 reproduction of lost Hotview paragraphs after a repeated file notification, the disk bridge fix, local verification, and runtime application limits."
created: "2026-11-25"
updated: "2026-11-25"
---

## Reproduction and fix

A collaboration client added two paragraphs while an earlier snapshot was saved to disk. The bridge ignored the first file notification as an autosave echo. A later timestamp-only notification triggered another read after the first notification consumed the echo entry. The bridge then treated the older disk body as an external edit and removed both newer paragraphs from the room.

The bridge now compares the disk body with the last body it observed on disk. The [collaboration room contract](../development/collaboration.md#collaboration-rooms-yjs-relay) defines how the watcher handles repeated notifications, frontmatter, and external body edits.

## Verification and runtime application

- `server/collabAgent.test.ts` reproduced the loss before the fix. After the fix, it preserved both paragraphs through the autosave, repeated notification, and frontmatter-only edit, then relayed a subsequent external body edit.
- The collaboration relay and headless DOM tests passed. Isolated Chromium tests passed for reconnect, editor handoff at desktop and mobile widths, and editor error recovery. The Markdown serializer tests also passed.
- `npm run build` passed, including TypeScript, with Vite chunk-size warnings. Scoped lint passed.
- Wiki descriptions passed validation. The repository link check reported 39 existing errors, including a missing parent link target from the collaboration contract. It reported no errors for the new links.

The fixture reproduces a text-loss mechanism. The reported document and session remain unverified. The server-side change requires a server reload to take effect. Deployment and server lifecycle operations were outside this task.
