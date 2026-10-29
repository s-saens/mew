---
id: "mew-database-references"
parent: "mew-database"
title: "Existing DB·External Postgres References"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "0f0b4f100693e9172887fe664580e4df69853a9da651461c3a04302ef8bdf3ed"
files: ["packages/editor/src/database/DbReferencePicker.tsx", "packages/editor/src/database/DatabaseView.tsx", "server/db/catalog.ts"]
commits: []
description: "The feature contract for selecting existing document databases and external Postgres tables as read-only references. Explains the prohibition on modifying sources and the connection, catalog, and project access boundaries."
상위파일:
  - "MOC.md"
  - "_document-databases.md"
---

## Requirements

- Reference existing databases and external Postgres tables in read-only mode.

### Scope

- Provides document DB references and selection and viewing of external tables.

### Boundaries and limitations

- Reference views do not modify the source.
- Connection, catalog, and project boundaries remain in place; this does not mean unrestricted access to arbitrary external DBs.

### Detailed contracts

- [References·Project Isolation](../../../../docs/guides/database.md)

<!-- mew:implementation:start -->
## Implementation details

- Provides document DB references and selection and viewing of external tables.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that reference nodes block source editing and allow selection only of tables within the permitted access and project scope.

<!-- mew:validation:end -->
