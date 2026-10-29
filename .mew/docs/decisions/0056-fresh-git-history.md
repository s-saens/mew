---
title: "Start a new Git history for the integrated source"
description: "Keep the existing GitHub repository and start the integrated source with a parentless initial commit. Define the scope of the external Git backup, preservation of uncommitted changes, an explicit lease for remote main, and preservation of existing data and other refs."
created: "2026-10-23"
updated: "2026-10-23"
---

## Status

Accepted. The user explicitly requested backing up the existing `.git` externally and replacing the `main` history in the same GitHub repository.

## Background and decision

Use the current source, with distributed work integrated into local `main`, as the starting point for the new history. Keep the existing GitHub repository, issues, and settings, and apply a parentless initial commit to `main`. Do not change existing license and contribution terms or ownership of source and documents.

Preserve the entire existing `.git` and original staged and unstaged changes in dated folders under `~/dev/mew-backups/`. Also preserve separate sources and recovery materials within the existing Git metadata. Include only tracked files from the current source and approved changes in the new initial commit; do not add account data, environment settings, build outputs, or user temporary files.

Update only the relevant ref using `--force-with-lease` with the SHA of remote `main` read before replacement explicitly specified. Do not change other refs or branch protection. If the remote changes, do not forcibly overwrite it using the old expected value. The [repository operations guide](../operations/repository-maintenance.md#starting-fresh-git-history) owns the specific application and recovery boundaries.

## Impact

The new `main` history starts with the initial commit. Past commits and Git metadata remain in the external backup, and historical decision and research documents in the source remain preserved. Clones using the previous history must be cloned again. This operation does not completely delete historical data from GitHub internal references and caches or external clones.
