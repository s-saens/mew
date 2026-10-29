---
title: "0016 — Hotview Block Caching and Pretext-Based DOM Virtualization"
description: "Records the rationale for reducing full Markdown serialization repeated on every Hotview input through block caching, and for choosing Pretext height estimation, full model preservation, and offscreen DOM placeholders, along with effects on editing, navigation, and complex blocks."
created: 2026-10-19
updated: 2026-10-19
---

# 0016 — Hotview Block Caching and Pretext-Based DOM Virtualization

Status: Adopted

## Background

In [pre-adoption measurements](../research/editor-input-performance.md), Hotview input on 1.13 MB of synthetic Markdown used about 16 seconds of JavaScript per keystroke. Full document serialization repeated 4 times per input and consumed most of the time. Text DOM and link cursor decorations for offscreen paragraphs were also retained, increasing update costs as documents grew longer.

## Decision

1. Introduce a per-block serialization cache using the existing Markdown renderer. Do not delay save notifications, and preserve existing string and clipboard formats.
2. Manage line numbers with plugin state and per-block line maps. Do not repeat full serialization or Markdown analysis during React echoes of local input or cursor movement.
3. Pin Pretext 1.0.0 as an editor package dependency. Estimate text height and replace the content DOM of offscreen top-level blocks with placeholders. Correct to actual heights after they appear onscreen.
4. Retain the entire document model, Yjs state, and undo history. Display blocks with selections or active composition, and restore the DOM from model positions during navigation.
5. Pass only the line numbers and file link cursor decorations needed for the visible range to ProseMirror. Use position and measurement caches so virtualization's supporting calculations do not themselves grow quadratically with document length.

## Rationale and Impact

Pretext does not address serialization costs, so apply caching and visible-range limits together. Simple CSS hiding was rejected because it does not reduce DOM and node view creation or decoration calculations. Do not replace the full editing model with partial documents, since that changes position contracts for collaboration, selection, and undo.

Keep the existing full display for short documents. Even large documents retain a placeholder for each top-level block. The interiors of a huge single list or table and long selections can still create substantial DOM. Reduce estimation errors for fonts and complex nodes through measurement and scroll anchor correction. Native browser find for offscreen text and its persistent presence in the accessibility tree are limited.

The current contract and verification boundaries are maintained in [Hotview Rendering](../development/hotview-rendering.md). Distinguish app builds, server application, and actual OS keyboard checks from passing isolated tests.
