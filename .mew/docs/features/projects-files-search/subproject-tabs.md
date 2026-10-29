---
id: "mew-projects-subprojects"
parent: "mew-projects"
title: "Subproject Browsing and Switching"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "f8e5ccb90cec46b682b7f74bf0a0ce3972a30581008397911e415e198d12da6a"
files: ["src/components/subproject-link.tsx", "src/components/FileTree.tsx", "server/subprojects.ts"]
commits: []
description: "A feature contract covering regular hierarchical browsing of subfolders with actual .mew directories, active project switching through a separate arrow, and reuse of the existing project list. Explains the boundaries of shared project icons, file operations, Git initialization, and owner permissions."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Browse projects inside folders in the current tree and select them as independent working roots when needed.

### Scope

- Use the project's single `.mew/project-icon.json` as the shared icon in the file explorer and project selector.

- Subprojects with actual `.mew` directories appear at the same locations and sort positions as regular folders, and folder rows provide expansion, collapse, and browsing and operations on internal files.
- Designate a folder as a subproject and switch the working root using a separate arrow. Paths already registered are reused from the project list.

### Boundaries and limitations

- Browsing and operating on subproject files follows the current project's file permissions.
- Designation does not initialize Git or automatically switch the root, and project switching through the arrow follows owner permissions.

### Detailed contracts

- [Project and File Usage](../../../../docs/guides/projects.md)

<!-- mew:implementation:start -->
## Implementation details

- `server/projectIcons.ts` handles reading and saving per-project icons and migrating existing values. Direct and nested trees and the project selector display the same value, and changing it in the selector updates the project file.

- Under [ADR 0004](../../decisions/0004-subproject-folder-exploration.md), the folder row only toggles expansion, and a separate `SubprojectLink` arrow switches projects. The server checks the owner, source root, actual subpath, `.mew`, and file viewing permissions. The header uses the [project selector](../../decisions/0019-project-selector.md), and the parent project path also remains in the list.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `projectIcons.test.ts` and `project-icons-api.test.ts`: Verify shared SVGs, nested icons, migration priority, initialization, renaming, corruption/link protection, owner permissions, and exclusion of account copies.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that direct and nested project folders can be expanded in the current tree and their internal files opened.
  - Verify that clicking the arrow switches to that root and that the parent project and already registered subprojects can be selected again from the header list.

<!-- mew:validation:end -->
