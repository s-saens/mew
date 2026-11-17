---
title: "Project selection panel appearance"
description: "Records the transparent multi-project selector, matching title bar, local verification, and remaining test and documentation link failures."
created: "2026-11-17"
updated: "2026-11-17"
---

The panel-scoped project selector now exposes the workspace background and hides the underlying project while open. Its title bar matches the project panel height and colors, and the Korean title reads **프로젝트 선택**. The current layout contract is in [workspace layout](../development/ui-workspace-layout.md).

Local verification: the Korean copy test and the browser tests for adding a panel and preserving independent workspace state passed. The browser test for existing workspace controllers confirmed that the underlying panel is hidden, but later timed out waiting for the selector to close after interaction with another panel. The current project selection draft and its remaining regressions are documented in [project selection favorites](project-selection-favorites.md). Lint completed with warnings. The documentation metadata check passed; the repository link check reported 40 errors involving existing missing paths and an asset URL. The build passed locally. No server was restarted and no deployment was performed.
