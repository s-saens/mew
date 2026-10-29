---
id: "mew-git"
parent: null
title: "Git and change history"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "be98a5da301e8a6d4a72e5909779ab2d912575aeb6bbb60a258035c4ed2aee21"
files: []
commits: []
description: "Parent feature document grouping per-file commits, restoration of past content, and the current project's Git operations panel. Provides guidance on child feature scopes and detailed contract links, distinguishing ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Provide file-level history separately from repository operations for the current project.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Current project Git operations panel](project-git-work-panel.md)
- [Current file commits and history restoration](current-file-commits-and-history-restoration.md)

### Detailed contracts

- [Projects and files guide](../../../../docs/guides/projects.md) · [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- Groups the currently available child features into one work area.
- Each child feature links to the basis for its implementation and limitations.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review child feature boundaries and omissions.
  - Parent status does not automatically approve child statuses.

<!-- mew:validation:end -->
