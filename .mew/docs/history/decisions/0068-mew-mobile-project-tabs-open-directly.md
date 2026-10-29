---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Open mew mobile project tabs with a single tap. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0068 — Open mew mobile project tabs with a single tap"
created: 2026-08-21
updated: 2026-08-21
---

- Date: 2026-08-21
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

Inactive project tabs on mobile showed only icons, so the first click displayed a `ProjectPeek` label containing the name and command
button instead of opening the project. The user had to click the same tab or label again to actually open the project. This protective step required
an extra click for the basic action of switching projects, and felt like a delay when tapping a tab did not navigate.

## Options

1. Keep 2-step switching — users can check the project name first, but every mobile switch requires an extra tap.
2. Switch with a single tap — accidental taps remain possible, but the tab's default behavior matches desktop and responds immediately.

## Decision

On both mobile and desktop, clicking a project tab once immediately opens that project. Remove the `ProjectPeek` component that intercepted
the first click on inactive mobile tabs, along with the name and command label. Keep the active project's command button and the tab's long-press, drag,
and right-click interactions.

**Do not retry** the same 2-step switch that shows a label first. If mobile icon discoverability becomes a problem again, address
it without blocking project switching.

## Rationale

- Users strongly expect tapping a tab to change the view, so immediate switching is more predictable than a confirmation label.
- The current project's name expands on mobile as well, so users can identify the project immediately after switching.
- Command buttons remain accessible on the active tab, so removing the label does not remove command execution.

## Results

- The secondary path for running an inactive project's commands from its label without switching projects is removed.
