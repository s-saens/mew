---
title: "Project selection panel appearance"
description: "Records transparent mobile and multi-project selectors, project-add controls, external path labels, local verification, and remaining documentation link failures."
created: "2026-11-17"
updated: "2026-11-17"
---

The panel-scoped project selector now exposes the workspace background and hides the underlying project while open. Its title bar matches the project panel height and colors, and the Korean title reads **프로젝트 선택**. The current layout contract is in [workspace layout](../development/ui-workspace-layout.md).

Local verification: the Korean copy test and the browser tests for adding a panel and preserving independent workspace state passed. The browser test for existing workspace controllers confirmed that the underlying panel is hidden, but later timed out waiting for the selector to close after interaction with another panel. The current project selection draft and its remaining regressions are documented in [project selection favorites](project-selection-favorites.md). Lint completed with warnings. The documentation metadata check passed; the repository link check reported 40 errors involving existing missing paths and an asset URL. The build passed locally. No server was restarted and no deployment was performed.

## Mobile panel and project paths

The mobile selector now uses a transparent surface over the theme background, with Add beside Close. The add dialog offers New project, Git clone, and Browse. Registered projects outside the server's managed root show their paths beside their names; the server checks the actual managed root, including a symlinked root. The [navigation contract](../development/ui-project-navigation.md) describes the current controls.

Local verification covered project registration, project path labels, the add dialog, and panel-scoped selection and focus. Lint completed with warnings. The documentation metadata check passed; the link check reported 39 existing missing targets and an asset URL. The build passed locally. The build updates browser assets served from `dist/`; server source changes require a separate server reload. No server was restarted and no deployment was performed. Physical-device appearance remains unverified.
