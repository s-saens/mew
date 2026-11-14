---
title: "Git metadata file access"
description: "Records removal of the authenticated file API Git metadata block, recursive repository-folder deletion tests, retained anonymous exclusions, and application limits."
created: "2026-11-14"
updated: "2026-11-14"
---

Authenticated file access now follows normal file permissions for `.git`, and recursive deletion can remove a repository folder. The default hidden list still contains `.git`, but it is no longer fixed. Guest and public capability access remain blocked. See the [access contract](../development/access-control.md#storage-and-paths) and [ADR 0174](../decisions/0174-git-metadata-file-access.md).

Local checks: isolated access-policy, tree, ignore-list, public-share, and catalog-visibility tests passed 26 tests, including actual deletion and permission regressions. Targeted oxlint passed. The build passed. The documentation check reported 39 existing unrelated link errors; description validation passed. No server restart or deployment was performed. The running server must be restarted separately before the server-side change takes effect.
