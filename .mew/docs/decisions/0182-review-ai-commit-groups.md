---
title: "Review AI commit groups before execution"
description: "Changes Git panel AI commits to show file-based work units and uncertainties for explicit selection before committing. Supersedes the immediate execution portion of historical ADR 0174."
created: "2026-11-17"
updated: "2026-11-17"
---

## Status

Accepted for the Git panel. This supersedes immediate execution in [historical ADR 0174](../history/decisions/0174-mew-commit-skill-and-automatic-commits.md); its scope and snapshot safeguards remain.

## Context

One selection can contain independent work, incomplete changes, and files whose purpose is unclear. An automatic plan can explain these differences, but immediate execution gives the user no opportunity to choose which work to record.

## Decision

Analyze the selected snapshot into file-based groups and explain each group and unresolved exclusions. Present the plan before any commit. The user selects groups explicitly; Mew rechecks the snapshot and connection and executes only those groups. Keep the plan available when the dialog closes. Titles and commit descriptions follow the configured commit language; review explanations use the UI language.

## Alternatives and consequences

Immediate execution avoids an extra interaction but can commit groups the user did not intend to record. Asking an agent to run Git directly after selection would also require broader tool access; Mew retains its existing constrained execution and index preservation. Files shared by multiple concerns cannot be split at hunk level, so the review must state such limitations. Changed snapshots require a fresh analysis.
