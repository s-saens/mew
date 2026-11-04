---
title: "Voice recording in Markdown Hotview"
description: "Completed implementation task to insert an inline recording block with /voice in Hotview and replace it with persistent audio playback after recording stops. Covers recovery, microphone cleanup, and verification."
done: "true"
tags:
  - 기능
assignees:
  - songsh5775@gmail.com
---

## Goal

Record voice directly in an editable Markdown Hotview document. Typing `/voice` and choosing the command inserts an inline recording block; stopping recording turns that location into an audio playback block.

## Acceptance criteria

- Offer `/voice` with a Korean recording alias in the slash menu.
- Insert a local recording block with explicit start, stop, and cancel actions and elapsed recording time.
- Request microphone access only after Start. Explain unsupported browsers and permission or device failures without changing other document content.
- Upload the stopped recording through the document's existing asset API, then persist the existing audio markup so playback survives reopening and works in read-only views.
- Keep the insertion location mapped while other edits occur. Do not insert a late upload into another document.
- Preserve recorded audio for upload retry. Cancel, document switching, loss of editability, and editor destruction release microphone resources.
- Add automated behavior tests and run applicable tests, build, lint, and documentation checks. Record actual verification and remaining device limits.

## Ownership

- [Markdown feature contract](../../docs/features/document-code-media-editing/markdown-hotview-source-and-properties.md)
- [Implementation and verification record](../../docs/work/hotview-voice-recording.md). Browser/device checks and user-managed host/central application remain pending as recorded there.
