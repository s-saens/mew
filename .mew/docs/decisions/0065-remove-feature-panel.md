---
title: "Remove the Feature Panel and Dedicated Execution Paths"
description: "Decision to remove the unused feature panel, branch work ledger, feature document APIs, execution queue, and CLI while preserving existing Markdown and stored data."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Accepted. Supersedes the feature panel and branch work ledger contracts in [0049](0049-branch-feature-previews.md).

## Background

The user did not use the feature panel and requested that its code also be removed.

## Decision

Remove the feature panel from the dock, shortcuts, docking, and mobile restoration. Also remove the per-branch title, work, verification, assessment, and port ledger and dedicated CLI; feature document lookup, request, editing, and assessment APIs; execution queue, reporting CLI, real-time subscriptions, and demo stubs. Do not distribute branch work panel recording instructions in agent context either.

Preserve feature specification Markdown and historical documents, decisions, and verification records. Do not automatically delete or migrate existing Git metadata, server execution history, or browser drafts. Exclude removed items from saved panel layouts when restoring them.

## Rationale and Impact

Eliminate the maintenance cost of UI, server, and automatic execution paths for an unused panel. Retain the Git panel, tasks, ordinary agent conversations, and `/포트번호` localhost app previews. Existing records are not viewed or automatically executed in the app. The user performs builds and applies changes to the server.

## Verification Scope

Ran type, documentation, and lint checks and 55 unit checks for docking, mobile ordering, presets, and demo data. Verified tasks, mobile transitions, and feature dock removal in the actual App, Git and task themes, Mewpet work conversations, dock interactions, and port previews through isolated browser and server checks. Stopped the full test suite due to increased memory usage and ran related checks serially. The existing `release-runtime` source graph check and UI Korean literal check failed with the same errors in both this work and the latest `main`. No build or server application was performed.

After separately fixing the missing translation key in the terminal accessible name in the latest `main`, the integrated state passed type, lint, and documentation checks and 63 related unit, demo data, agent context, and real-time subscription checks.
