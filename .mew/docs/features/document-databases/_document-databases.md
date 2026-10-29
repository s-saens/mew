---
id: "mew-database"
parent: null
title: "Document Databases"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "f03d728f3b30313a25a90287a23c58079e6eb29523ef4c263d20e2dbe67d7d6b"
files: []
commits: []
description: "The parent feature document covering document table database editing, the full list, and read-only references to existing DBs and external Postgres. It outlines subfeature scopes, links to detailed contracts, and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Link project-specific tabular data to documents and work on it collaboratively.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Document Databases·Full List](document-databases-and-catalog.md)
- [Existing DB·External Postgres References](existing-database-and-external-postgres-references.md)

### Detailed contracts

- [Database Usage Guide](../../../../docs/guides/database.md)

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
