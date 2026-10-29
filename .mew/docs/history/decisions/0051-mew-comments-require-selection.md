---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Comments attach only to selected characters. Remove cursor-position comments (small squares). Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0051 — Comments attach only to selected characters. Remove cursor-position comments (small squares)"
created: "2026-08-12"
updated: 2026-08-20
---

- Date: 2026-08-12
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0049](0049-mew-team-chat-and-inline-comments.md) §3 allowed comments left only at the cursor position without a selection — the anchor's `text`
was an empty string, and a small square appeared in the body.

In use, the body alone did not reveal what that square referred to. Without a quote, the list also could not distinguish "where
the comment was attached," and even a small change to the body required relocating it using only the preceding context (prefix), making it easy to
place it incorrectly. It was also too easy to create one accidentally — placing the cursor anywhere and pressing the shortcut created one.

## Decision

A comment can be added only when at least one character is selected. Even a single space counts as a selection.

- `makeCommentAnchor(text, from, to)` returns null when `from >= to` — no anchor is created at all
- `resolveCommentAnchor` treats an anchor with empty `text` as having no position (null)
- The server's `sanitizeAnchor` rejects empty `text` — requests that bypass the UI are blocked too
- The comment icon in the mobile accessory keys appears only when text is selected (`selChars > 0`). Do
  not provide a button that can be pressed but does nothing.
- Removed the small square decoration (`.mew-comment-point`) and both paths that rendered
  it (`Decoration.widget` in hotview `commentHighlight.ts` and `CommentPointWidget` in plain `CodePane.tsx`).

## Rationale

- A comment without a quote cannot explain what it refers to. The reason for choosing quotes to represent
  anchors (ADR 0049 §3) did not hold for cursor comments.
- The cheapest place to block empty selections is where anchors are created. Instead of four UI paths (hotview, plain, keyboard shortcuts,
  and accessory keys) checking independently, a single `makeCommentAnchor` returns null, and the server filters again.

## Results

- This does not prohibit revisiting the idea. If a way to refer to "this entire paragraph" without a quote (a block-level anchor) becomes
  necessary, that is a separate design, not a cursor comment. Empty `text` anchors are not what should be restored.
- Cursor comments remaining in the old ledger (`<프로젝트>/.mew/comments.json`) are not deleted. They become orphans whose positions cannot be found and remain only
  in the comment list popup — other people's writing is not deleted automatically (the same principle as ADR 0049). Clicking one
  in the list displays "Could not find the location."
- Selections without text, such as images and tables, cannot receive comments because `text` is empty. To leave a comment there, include surrounding
  text in the selection.
