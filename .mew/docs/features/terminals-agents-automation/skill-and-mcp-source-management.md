---
id: "mew-agents-harness"
parent: "mew-agents"
title: "Skill and MCP Source Management"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-05"
status_hash: "b9b25fb50a126dd475ca2e6bae99f42419f210afd46114df41118c8d3543c502"
files: ["src/components/agent-harness-modal.tsx", "src/components/mcp-manager.tsx", "src/components/shared-mcp-connection.tsx", "server/agent-harness.ts", "server/harness-config.ts", "server/mcp-management.ts", "server/mcp-management-routes.ts", "server/shared-mcp.ts", "server/shared-mcp-oauth.ts", "server/shared-mcp-stdio.ts", "server/shared-mcp-connections.ts", "server/shared-mcp-routes.ts"]
commits: []
description: "Feature contract for common/project skill libraries and grouped MCP connections with scoped usage and separate authentication. Covers custom service groups, safe Cloudflare consolidation, external source preservation, permissions, and runtime application limits."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Manage active skills through one common/project library and preserve external native originals.
- Manage MCP services through expandable groups and common/project usage, retaining individual preferences when a group is off.
- Register and authorize a Mew common MCP once for agent-enabled accounts across ACP runtimes and projects.

### Scope

- Show one effective skill per name, common/project enablement, source details, external imports, and removable/restorable defaults. Keep documentation dependencies inside their parent workflow.
- Use the same enabled catalog for suggestions, documentation routing, optional commit instructions, and per-turn automatic workflow selection. Revalidate selected skill hints when queued requests execute.
- Create, rename, remove, and assign custom groups; suggest Cloudflare membership from official endpoint hosts. Show saved readiness separately from usage.
- Add installation-wide definitions by URL or JSON with common/project usage. Project-only new definitions stay off elsewhere. Owners manage shared groups, definitions, and authentication; agent-enabled accounts may change project usage.
- Prepare and authorize the unified Cloudflare API connection before selecting dedicated Mew connections to turn off. Preserve their definitions and authentication.
- Open external connections to view, search, import, create, edit, move, and delete native MCP at global, project, and subproject scopes. Preserve supported native originals on import.

### Boundaries and limitations

- Respect read-only boundaries for packages, system sources, plugin caches, and symbolic links.
- Skills imports copy safe complete folders without changing external originals. Native automatic discovery is suppressed in Mew's Codex/Claude sessions; other runtimes receive selection guidance without an unverified native suppression claim. Previously read instructions and filesystem access are not erased.
- Usage switches preserve credentials and pending approval. New, cleared, or restored conversations resolve group/server usage and saved readiness; active conversations retain their tools.
- Native source editing does not run MCP or restart sessions and does not guarantee native runtime application. Explicit Mew connection checks may run a server. Group controls govern Mew registrations; native originals may still load independently.
- Native OAuth tokens are not copied. The first common approval may be required; subsequent Mew runtimes share installation-wide credentials. The OAuth login desktop retains its Linux/WSL prerequisite.

### Detailed contracts

- [Source Locations, Conflicts, and Application Contract](../../../../docs/configuration/agent-harness.md)
- [Managed Skill Library](../../development/skill-library.md)
- [Grouped MCP Management](../../development/mcp-management.md)
- [Common MCP Storage, Authentication, and Runtime Contract](../../development/shared-mcp.md)

<!-- mew:implementation:start -->
## Implementation details

- Dedicated Skills management uses common and project scopes, enablement, external import candidates, source details, and default restoration. Grouped MCP management has its own safe inventory and domain API; the external source editor remains available separately.
- Scope and agent filters and destination selection for adding and moving use shared custom dropdowns.
- Resolve the optional commit workflow through the same active library for `/commit` and Git automatic commits. Disabling it retains the validated Git plan format without injecting the disabled workflow.
- Common MCP defaults to URL entry and uses a stdio bridge for local, HTTP, and SSE transports across ACP runtimes. Definitions and OAuth credentials remain in private installation data; project files store usage only.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the scope, runtime, and source path are correct and that existing content and user drafts are preserved in conflicts with external changes.
- On desktop and mobile, verify keyboard and touch selection in custom selection lists, screen boundaries, priority dismissal with Esc, and draft preservation when a filter change is canceled.
- Grouped management's actual local test results and application limits are recorded in the [implementation work record](../../work/grouped-mcp-management.md).

<!-- mew:validation:end -->
