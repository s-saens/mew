---
title: "Allow authenticated Git metadata file access"
description: "Allows authenticated file-permission access and recursive deletion of Git metadata while retaining guest and public-share exclusions and server-data protections."
created: "2026-11-14"
updated: "2026-11-14"
---

## Status

Accepted. Extends the [file access contract](../development/access-control.md#storage-and-paths).

## Context

The general file API denied `.git` at every depth. Recursive deletion therefore rejected a folder containing a Git repository even when the user could edit the whole folder.

## Decision

Treat `.git` as an ordinary path for authenticated file access, subject to feature permissions, path rules, workspace and server-data boundaries. It remains in the default hidden list but is no longer fixed there. Guest access and anonymous public-share capabilities continue to exclude Git metadata. Other blocked segments remain unchanged.

## Alternatives and rationale

A deletion-only exception would let users remove repositories but leave Git metadata inaccessible despite this request to remove its general protected-path treatment. Allowing anonymous access would expose repository configuration and history through existing shared links. Normal authenticated file permissions provide a consistent boundary while retaining anonymous exclusions.

## Consequences

Users with file permissions can read or alter Git configuration, hooks, and history, which may contain credentials or affect future Git operations. Administrators must set file rules accordingly. The existing OS-level access boundary and explicit server-data protections remain in force. Applying server changes requires a separate server restart.
