---
title: "Project catalog loading"
description: "Records the November 17 project selection delay, immediate saved-catalog response, Unity cache discovery fix, selection-priority cancellation, verification, and server application boundary."
created: "2026-11-17"
updated: "2026-11-17"
---

The project selector waited for nested discovery beneath every registered project before displaying any row. A read-only scan of the current registry reached the final registered root but did not complete within 20 seconds. This supports a filesystem-discovery delay; it does not measure the mobile network or the reported request itself.

The [registry contract](../development/architecture.md#shared-project-registry-and-my-projects) defines a fast account-specific snapshot and a full discovery response. The panel displays the snapshot as soon as it arrives and replaces it with the full result, while ignoring a snapshot that arrives late. Newly discovered projects and custom icons still depend on full discovery. The isolated regression tests hold discovery open and cover account isolation, both response orders, and eventual child discovery.

The 22 focused registry and panel tests passed, including held discovery and response ordering. `npm run build` passed. Targeted lint completed without errors and reported a React effect warning. `npm run check:docs` reported 39 existing missing or invalid links. The running application server was not restarted; its server code must be applied separately before the new snapshot endpoint takes effect. The preceding project-selection change remains incomplete as described in [its work record](project-selection-favorites.md).

## Discovery root cause

The slow registered root is a Unity project on a WSL Windows 9p mount. The discovery walk entered its generated `Library` tree. A read-only instrumented scan took 23.5 seconds, made 2,857 directory reads, and found one nested project; 2,696 reads were inside `Library`. Discovery now skips `Library` and `Temp` only in directories that contain both `Assets` and `ProjectSettings`. It still explores real Unity assets and ordinary non-Unity directories named `Library`.

The same root, scanned after the change, took 1.2 seconds and 161 directory reads and found one nested project. These are sequential local observations, not an end-to-end mobile request measurement. The Unity regression and existing registry suite passed 21 tests; targeted lint reported no errors. The server still needs a separate authorized restart for the new discovery code to run.

## Prioritizing selection

The selector starts a saved-catalog request and a full discovery request independently. Selecting a saved entry cancels the panel's discovery request and starts switching without waiting for discovery. The server stops scheduling discovery after its final caller disconnects; another active caller keeps a shared scan alive, and already submitted filesystem operations may finish. An isolated HTTP fixture held discovery while obtaining a snapshot and switching a project, and panel and registry tests cover cancellation and shared callers. These checks do not measure a real mobile session.

The priority regression suite passed 27 tests across the HTTP fixture, panel, registry, and Unity discovery. The production build passed. Targeted lint completed with one React effect warning; the documentation check reported 39 existing link errors. No server lifecycle operation or deployment was performed.
