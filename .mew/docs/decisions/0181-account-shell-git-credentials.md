---
title: "0181 — Use Mew account Git connections in shells and agents"
description: "Extends per-account GitHub authentication from managed Git operations to terminal and agent Git commands, recording the security boundary and alternatives to shared OS credentials."
status: accepted
created: "2026-11-17"
updated: "2026-11-17"
---

## Context

The [per-account Git connection decision](../history/decisions/0179-mew-account-git-connections.md) gives managed Git operations the credentials of the signed-in Mew account. Terminal and agent commands have instead inherited the server OS user's Git credentials. A user can therefore push as a different GitHub account in a shell than in Mew's Git panel.

## Decision

Use the originating Mew account's GitHub connection for Git operations launched through Mew terminals and agents. Keep account selection independent of the repository and do not change shared Git configuration or log out the server's other GitHub accounts. The [Git connection contract](../development/git-connections.md#agent-execution-and-os-boundaries) owns execution details and limitations.

## Alternatives and rationale

Changing the active OS GitHub account affects other users and projects. Setting credentials in a repository makes the shared working tree, rather than the Mew user, determine the account. Using Mew's existing per-account connection aligns shell and agent operations with the Git panel.

## Consequences

Users must connect the intended GitHub account in Mew. Mew sessions share the server OS user's permissions: account selection is not an operating-system sandbox, and shell access can reach resources available to that user. The decision extends the execution boundary in historical Decision 0179; its credential storage and account ownership rules remain in place.
