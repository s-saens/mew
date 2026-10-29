---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew per-account feature permissions and file access matrix. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0150 — mew per-account feature permissions and file access matrix"
created: 2026-09-16
updated: 2026-09-16
---

- Date: 2026-09-16
- Status: Adopted
- Partially supersedes: [0080](0080-mew-server-file-explorer.md) — Fixed role gate for the server file explorer
- Partially supersedes: [0127](0127-mew-browser-server-dom-runtime.md) — Fixed role gate for the internal browser
- Partially supersedes: [0034](0034-mew-agent-panel-acp-reintroduction.md) — Fixed role gate for agents and tmux
- Partially supersedes: [0120](0120-mew-project-local-assets-replace-r2.md) — Public viewing boundary for UUID attachments
- Decision makers: User (directed creation of a per-account feature and file permission matrix), Codex (implementation)

## Background

Bundling all server features under a single role and granting file sharing only to guests through the sidebar cannot manage per-account feature restrictions and per-file viewing and editing scope.

## Decision

- Keep account management exclusive to owners. Roles provide default feature permissions; store feature permissions separately for each account and guest. Do not allow demotion of the last owner.
- In account management, rows represent accounts and guest, and columns represent features. For file permissions, select Inherit, Block, View, or Edit per account in the file and folder navigation table on the same screen. Remove the guest eye and pencil settings from the sidebar.
- Check feature use on the HTTP and WebSocket servers. File viewing and editing feature toggles set the upper limit, and the most specific rule on the path itself or an ancestor takes precedence. Editing requires viewing. Unauthorized files must be inaccessible through the tree, search, raw content, and collaboration.
- Bind path rules to the actual workspace boundary and normalized paths. Restrictions cannot be bypassed through Documents, subproject, or root aliases, and permissions for the same path do not propagate to other workspaces. Import existing guest rules into the current workspace.
- Default features for owners and managers remain unchanged, and members can also use individually permitted server features. Account management is determined solely by role and cannot be delegated through changes to the feature matrix.
- File permissions define the boundary of the mew file API. Features with OS access, such as agents, terminals, remote desktop, and the server file explorer, are not sandboxed by file permissions. Show this scope in the feature matrix. Do not lift existing prohibitions concerning OS isolation, provider credential collection, and similar matters.
- The server also applies permission changes to existing connections, and clients reread the new permissions and revalidate open features and files. Show permission save failures on screen; do not display them as successes.

- For guest, configure only file viewing and editing; allow server control features only for logged-in accounts. Terminal-based agents require both agent and terminal features.
- Apply file ACLs to UUID attachments as well. Block project-wide queries such as Git, DB, and RAG management in projects with partial file restrictions.
- Revoking permissions blocks connections and API use; it does not retroactively revoke OS processes already started or data already downloaded.

## Rationale

Separating defaults from per-account settings instead of creating more roles reduces coupling between features. Distinguishing explicit blocking from inheritance makes it possible to allow a parent folder while hiding specific files. Change file access at the server boundary as well as in the client display.
