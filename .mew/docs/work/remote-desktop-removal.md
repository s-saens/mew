---
title: "Remote desktop removal"
description: "Records the removal of Mew's integrated remote desktop and its verification and application boundaries."
created: "2026-11-10"
updated: "2026-11-10"
---

The project owner requested removal of the integrated remote desktop after exact-source Windows packages became unavailable. [ADR 0161](../decisions/0161-remove-remote-desktop.md) records the decision and alternatives. The viewer, server integration, setup and distribution path were removed while retaining independent browser and workspace access. At the owner's explicit request, previously modified and untracked desktop sources and tests were removed without a backup.

Local checks: `npm run build` and `npm run lint` passed (with warnings). The release, setup, socket, NAT and shared RTC tests passed (17 tests); the UI work also passed layout, dock, network and browser regression checks. The demo browser test passed the changed host flow at both tested viewport sizes but timed out later in its project-add menu flow. The browser tests used test-owned headless Chromium. An additional browser test mistakenly started a test-owned HTTP server and Chromium despite the repository's execution restrictions; the test process ended. `npm run check:docs` validated 773 descriptions and reported 37 existing missing MOC/README link targets.

The source change does not uninstall previously installed helpers or drivers, remove published release assets, or apply itself to a running installation. Deployment and server lifecycle operations are user-owned.
