---
title: "Find current APK files for project downloads"
description: "Extends recorded build results with bounded discovery and scoped download of current APK files in standard Flutter and Android output locations."
created: "2026-11-12"
updated: "2026-11-12"
---

## Status

Accepted. Extends [ADR 0164](0164-build-result-files.md) with a separate current-file download path; recorded results retain their existing authorization and history.

## Context

A Flutter Android build can succeed while a Gradle-derived output pattern points inside `android/` and misses the actual project-level `build/` directory. A file may also predate the current process or come from a command button. Requiring the user to configure the path leaves the result inaccessible in the ordinary build interface.

## Decision

Discover Flutter Android build actions and their standard APK output paths from project evidence. Independently list current APK files in bounded, supported Flutter and Android Gradle output locations in the project command menu and Build dialog. Label these as found files rather than attributing them to a particular run. Preserve user-configured actions and their output patterns.

Current-file downloads use the existing project and terminal authorization boundary and revalidate supported locations, project containment, regular-file status, protected paths, and symlinks on every request. They read the current file, not a historical snapshot. The [feature contract](../features/terminals-agents-automation/project-build-deploy-actions.md) defines the supported behavior and API.

## Alternatives and rationale

Changing only new action patterns would leave existing files inaccessible. Reconstructing a successful historical run from a file on disk would imply provenance that discovery cannot establish. Allowing arbitrary paths would expand the download boundary beyond known build outputs. Separate, bounded current-file discovery makes existing APKs accessible without either claim.

## Consequences

A found APK can be stale, overwritten, or removed independently of any run, and unsupported output locations still need explicit configuration. The existing large-download confirmation applies. Server code must be applied before clients can use the new endpoints; local verification is recorded in the [work record](../work/project-build-deploy-actions.md).
