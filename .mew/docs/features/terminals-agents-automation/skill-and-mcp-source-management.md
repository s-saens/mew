---
id: "mew-agents-harness"
parent: "mew-agents"
title: "Skill and MCP Source Management"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-02"
status_hash: "b9b25fb50a126dd475ca2e6bae99f42419f210afd46114df41118c8d3543c502"
files: ["src/components/agent-harness-modal.tsx", "src/components/shared-mcp-connection.tsx", "server/agent-harness.ts", "server/harness-config.ts", "server/shared-mcp.ts", "server/shared-mcp-oauth.ts", "server/shared-mcp-stdio.ts", "server/shared-mcp-connections.ts", "server/shared-mcp-routes.ts"]
commits: []
description: "Feature contract for skill and native MCP source management plus account-owned Mew common MCP registration, native imports, shared authentication, connection controls, and application to new ACP conversations. Retains read-only source and runtime boundaries."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Manage each agent's skills and MCP settings within their ownership scope.
- Register and authorize a Mew common MCP once for the current account's ACP runtimes and projects.

### Scope

- View, search, create, edit, move, and delete skills/MCP at global, project, and subproject scopes.
- Add account-owned common MCP connections by URL or JSON, import supported native definitions without changing their sources, and connect, approve, retry, cancel, or disconnect in Mew.

### Boundaries and limitations

- Respect read-only boundaries for packages, system sources, plugin caches, and symbolic links.
- Native source editing does not run MCP or restart sessions and does not guarantee native runtime application. Explicit Mew common connection checks may run a server; common definitions are injected into new Mew ACP sessions. Existing conversations and external CLIs keep their current configuration.
- Native OAuth tokens are not copied. The first common approval may be required; subsequent Mew runtimes share the account-owned credentials. The OAuth login desktop retains its Linux/WSL prerequisite.

### Detailed contracts

- [Source Locations, Conflicts, and Application Contract](../../../../docs/configuration/agent-harness.md)
- [Common MCP Storage, Authentication, and Runtime Contract](../../development/shared-mcp.md)

<!-- mew:implementation:start -->
## Implementation details

- View, search, create, edit, move, and delete skills/MCP at global, project, and subproject scopes.
- Scope and agent filters and destination selection for adding and moving use shared custom dropdowns.
- View and edit the Mew-specific commit skill file, shared by `/commit` in all runtimes and Git automatic commits.
- Common MCP appears first, defaults to URL entry, and uses a stdio bridge for local, HTTP, and SSE transports across ACP runtimes. Server configuration and OAuth credentials remain in private account data.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the scope, runtime, and source path are correct and that existing content and user drafts are preserved in conflicts with external changes.
- On desktop and mobile, verify keyboard and touch selection in custom selection lists, screen boundaries, priority dismissal with Esc, and draft preservation when a filter change is canceled.

<!-- mew:validation:end -->
