---
title: "0098 — Restore native mobile editor keyboard activation"
description: "Supersedes decision 0094 by removing the floating mobile editor keyboard button and persistent input suppression, restoring immediate native keyboard activation through body taps."
created: "2026-10-30"
updated: "2026-10-30"
---

# 0098 — Restore native mobile editor keyboard activation

Status: Approved

## Context

[0094](0094-explicit-mobile-editor-keyboard.md) required a separate floating button before mobile body editing and dismissed input on subsequent body or auxiliary-key presses. The requested interaction removes that extra step and opens the keyboard directly from the document.

## Decision

Remove the floating control and its pane-owned keyboard hook. Editable Hotview, Markdown Plain, and code bodies use native focus immediately when tapped. Do not force manual keyboard policy, suppress the input mode, delay body activation, or dismiss the keyboard on every app pointer press. Preserve native text selection, selection-menu timing, editor permissions, and viewport geometry handling.

## Alternatives and rationale

Keeping the button as an optional shortcut retains an unwanted control. Replacing it with delayed or explicit API activation adds gesture timing and browser fallback handling. Native focus gives the requested direct input behavior with fewer competing input owners.

## Consequences

Native browser behavior determines keyboard opening and dismissal, including during selection. Automated regressions verify focus and input eligibility during the original gesture, typing, and selection menus; actual Android and iOS keyboard appearance requires device verification. The current contract is [Mobile editor and keyboard](../development/ui-contracts.md#mobile-editor-and-keyboard).
