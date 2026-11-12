---
title: "Discover and download build result files"
description: "Extends project Build results with conservative web-output discovery and bounded ZIP downloads. ADR 0172 adds separately identified current APK downloads."
created: "2026-11-11"
updated: "2026-11-11"
---

## Status

Accepted for implementation. Extends [ADR 0163](0163-project-build-deploy-actions.md) without superseding [ADR 0160](0160-remove-mew-port.md). [ADR 0172](0172-current-apk-discovery.md) adds a separately identified current-file path. Deployment and server lifecycle operations remain user-owned.

## Context

An automatically discovered Node build could succeed while its result displayed only the execution log. The discovery supplied a command but no output patterns, so users had no file to download unless they configured one. Web builds often contain multiple files that must be kept together.

## Decision

After a recognized Vite or Create React App build succeeds, compare the supported default output folder with its pre-run state and show new or changed eligible files. Honor explicit output patterns and retain Android APK detection. Offer a ZIP only when the eligible output folder is completely scanned and all of its files are new or changed, within bounded file-count and size limits. Preserve project scope, recorded-run authorization, safe path checks, and direct and Mewlink transport for downloads. The [feature contract](../features/terminals-agents-automation/project-build-deploy-actions.md#runs-and-results) owns the precise rules.

Present files, archive access, status, and recovery guidance in the result interface, with logs available for diagnosis. A configured address continues to open through the host Browser subject to its existing permission. A downloaded static folder does not itself become a running website.

## Alternatives and rationale

Requiring manual patterns for every recognized web build leaves ordinary users with only a log. Treating every existing `dist` or `build` file as a new result can misidentify stale files, so automatic discovery compares the output before and after each run and omits an archive when it cannot establish a complete result. The comparison cannot attribute concurrent writes to a particular process. Downloading only individual files makes a multi-file web build cumbersome; a bounded ZIP retains its directory layout.

Automatically serving the output or rewriting it into an embedded app would add a separate execution and security boundary. Existing raw-file responses intentionally block active content, and the host Browser's navigation policy does not open arbitrary `file:` URLs or the Mew port. Restoring the removed port proxy or listener discovery conflicts with ADR 0160. This decision therefore keeps the configured Browser URL and file-download paths; it does not claim generic visual preview of static builds.

## Consequences

Supported builds expose useful files without requiring users to know commands or patterns. Custom output locations, unrecognized frameworks, and unchanged or protected files can still need explicit setup. Individual file downloads read the current file at each recorded path. ZIP downloads check recorded file metadata and reject files changed or replaced since completion; neither path stores an immutable copy or hashes file contents. Recorded results and archive manifests remain process-local. The [work record](../work/project-build-deploy-actions.md) distinguishes local verification from application to a running instance.
