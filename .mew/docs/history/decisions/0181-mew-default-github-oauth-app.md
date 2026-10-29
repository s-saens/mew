---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: default Mew GitHub OAuth app. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0181 — Default Mew GitHub OAuth app"
created: 2026-09-29
updated: 2026-09-29
---

- Date: 2026-09-29
- Status: Adopted
- Partially supersedes: [0179](0179-mew-account-git-connections.md) — Configuration requiring each installation operator to register an OAuth app; per-account tokens and execution boundaries are preserved
- Decision makers: user (provided a shared Client ID and requested distribution as the default), Codex (implementation)

## Background

Requiring OAuth app registration for every self-hosted installation creates a substantial initial setup burden for GitHub connections.

## Decision

- Distribute the public Client ID of the user-provided Mew OAuth app as the default in the server code. Do not distribute or use a Client secret.
- If `MEW_GITHUB_CLIENT_ID` has a value after trimming leading and trailing whitespace, use the custom app instead. If it is unset, empty, or whitespace-only, use the default app.
- The default app operator enables Device Flow. Individual installers authorize it on GitHub themselves without registering an app. Each installation server manages tokens per account.
- This decision does not eliminate the shared app's authentication limits or impersonation risks. Custom app configuration is retained, and actual GitHub authorization is verified separately.

## Current contract

Follow [environment configuration](../../../../docs/configuration/environment.md#github-oauth-connection) and the [Git connection contract](../../development/git-connections.md).
