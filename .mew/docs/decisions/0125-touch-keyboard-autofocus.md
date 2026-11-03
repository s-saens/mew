---
title: "0125 — Allow input autofocus after keyboard use on touch devices"
description: "Extends the shared autofocus policy to observed keyboard use on mobile and touch devices, retaining touch-only suppression. Records capture ordering, window-local lifetime, alternatives, and hardware-detection limitations."
created: "2026-11-03"
updated: "2026-11-03"
---

Status: Accepted

## Context

The viewport, hover, and pointer gate prevented automatic input focus on phones and tablets even when an external keyboard was in use. Runtime selection and Ctrl/Cmd+P therefore required an extra input tap.

## Decision

Extend the [shared input-focus policy](../development/ui-editor-input.md#mobile-input-focus) with window-local keyboard-use observation. Start tracking before application rendering and observe keydowns during capture, before shortcuts open inputs. Retain the observation across touch presses, and discard it on document reload or tracking cleanup. Existing callers continue using `canAutoFocusInput()`.

## Alternatives and rationale

Always enabling mobile autofocus would summon software keyboards during touch-only use. Pointer and hover queries cannot establish whether a keyboard is connected. Restricting focus to the opening event would prevent a keyboard user from tapping a runtime and typing immediately. Observed keyboard use supports both flows without persistent device settings.

## Consequences

The shared policy also applies to other existing guarded input surfaces. Browser key events provide evidence of keyboard use, not guaranteed hardware attachment or disconnection; some virtual keyboards can emit physical-style codes. Ignore common software-keyboard and IME events, preserve touch-only defaults, and verify physical Android/iOS behavior separately. The [work record](../work/agent-new-conversation-focus.md) records local verification and remaining limits.
