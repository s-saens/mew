---
id: "mew-agents-harness"
parent: "mew-agents"
title: "Skill and MCP Source Management"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "b9b25fb50a126dd475ca2e6bae99f42419f210afd46114df41118c8d3543c502"
files: ["src/components/agent-harness-modal.tsx", "server/agent-harness.ts", "server/harness-config.ts"]
commits: []
description: "Feature contract covering searching, creating, editing, moving, and deleting skill and MCP source configurations at global, project, and subproject scopes. Describes read-only boundaries for system sources, plugin caches, and symbolic links, and limitations on runtime application."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Manage each agent's skills and MCP settings within their ownership scope.

### Scope

- View, search, create, edit, move, and delete skills/MCP at global, project, and subproject scopes.

### Boundaries and limitations

- Respect read-only boundaries for packages, system sources, plugin caches, and symbolic links.
- The management window does not run MCP or restart sessions and does not guarantee application to native runtimes.

### Detailed contracts

- [Source Locations, Conflicts, and Application Contract](../../../../docs/configuration/agent-harness.md)

<!-- mew:implementation:start -->
## Implementation details

- View, search, create, edit, move, and delete skills/MCP at global, project, and subproject scopes.
- Scope and agent filters and destination selection for adding and moving use shared custom dropdowns.
- View and edit the Mew-specific commit skill file, shared by `/commit` in all runtimes and Git automatic commits.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the scope, runtime, and source path are correct and that existing content and user drafts are preserved in conflicts with external changes.
- On desktop and mobile, verify keyboard and touch selection in custom selection lists, screen boundaries, priority dismissal with Esc, and draft preservation when a filter change is canceled.

<!-- mew:validation:end -->
