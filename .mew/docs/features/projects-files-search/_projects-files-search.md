---
id: "mew-projects"
parent: null
title: "Projects, files, and search"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-03"
status_hash: "9d42c3f85dd684af076ce22b3d7c3a6e79602ce5c77e72784345380a970e31d4"
files: []
commits: []
description: "Top-level feature document covering project and subproject tabs, Documents, file browsing, search, replacement, and task documents. Defines the scope of subfeatures, links to detailed contracts, and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Find documents and files within project boundaries and manage work locations.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Opening Projects·Tabs·Groups](opening-projects-tabs-and-groups.md)
- [Subproject Tabs](subproject-tabs.md)
- [Documents·Document Map Management](documents-and-document-map-management.md)
- [Project Documentation Guidance·Initialization](project-documentation-guidance-and-initialization.md)
- [File·Folder Navigation and Operations](file-folder-exploration-and-operations.md)
- [Filename·Content Search and Replace](filename-content-search-and-replacement.md)
- [Task Panel·List·Calendar·Gantt](task-panel-list-calendar-and-gantt.md)

### Detailed contracts

- [Project and file usage](../../../../docs/guides/projects.md) · [Search settings and contract](../../../../docs/configuration/search.md)

<!-- mew:implementation:start -->
## Implementation details

- Groups the currently available child features into one work area.
- Each child feature links to the basis for its implementation and limitations.

- Removed RAG from the current subfeatures and preserved the records from that time in [History](../../history/rag-feature.md).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review child feature boundaries and omissions.
  - Parent status does not automatically approve child statuses.

<!-- mew:validation:end -->
