---
title: "Scoped workspace sessions"
description: "Implemented request, client, cache, event, input-draft, terminal, and presentation boundaries for concurrent project workspaces. Defines capability negotiation, legacy selection compatibility, logical/worktree identity, command ownership, isolated geometry, and the explicit-scope Postgres restriction."
created: "2026-11-07"
updated: "2026-11-07"
---

# Scoped workspace sessions

A project workspace binds its requests and file state to a confirmed root. Focusing another panel changes the input target; it does not change the root of an existing request, save, cache operation, or subscription. [ADR 0152](../decisions/0152-multi-project-workspace-sessions.md) records the architecture. The [multi-project feature](../features/appearance-accounts-operations/multi-project-mode.md) owns user behavior, and the [work record](../work/multi-project-mode.md) owns integration status and verification results.

## Identity and compatibility

| Identity | Owner and use |
| --- | --- |
| Authenticated account and instance | Authentication, account services, browser-storage namespace, and authorization. Browser routing fields do not assert an account identity. |
| `projectPath` | Canonical logical project directory. Account editor, agent, terminal, and workspace UI ledgers retain this identity across a worktree handoff. |
| `workspacePath` | Canonical actual working directory. File operations, caches, tree events, collaboration, and live reads use this root. |
| View or panel ID | Presentation, focus, DOM ownership, and board geometry. It is separate from either filesystem identity. |

The two paths normally match. When they differ, the server validates their membership in the same Git repository using reciprocal worktree metadata. Members can open registered roots whose two paths match; explicit linked-worktree scopes retain the owner/manager boundary.

Unscoped callers retain the account-selected root through `runAccountWorkspace`. The exported `workspaceClient` and existing named API exports are the single-project compatibility adapter. Explicit clients use a fixed scope and take precedence over that account selection. An invalid explicit scope fails instead of falling back to another root.

## Request encoding and resolution

`shared/workspace-scope.ts` owns `WorkspaceScope`, `WORKSPACE_SCOPE_VERSION`, `readWorkspaceScope`, and `workspaceScopeUrl`. The server's central workspace snapshot advertises `workspaceScopeVersion: 1`, including legacy reads and navigation responses. Before rendering explicit project views or exposing multi-project controls, the client requires a fresh unscoped workspace response with the expected version. An absent or unsupported version keeps the legacy single-project application without a board host. This protects a newly built client when the running server still predates scoped requests and would ignore their query parameters.

All three request surfaces use the same query parameters:

| Parameter | Contract |
| --- | --- |
| `mewWorkspacePath` | Actual working directory. Required when any explicit-scope parameter is present. |
| `mewProjectPath` | Logical project directory. The server defaults it to `mewWorkspacePath` when omitted; workspace clients send both. |

The parser rejects duplicate parameters, a project path without a workspace path, empty values, overlong values, and NUL/CR/LF characters. The resolver requires existing absolute directories, canonicalizes them, enforces server-data protection, and checks account, registration, and worktree restrictions. Member registration is checked before filesystem resolution and again against canonical paths. Normal feature and file permissions remain in force. A preexisting contradictory URL scope is rejected before sending.

Use this encoding for same-host API fetches, DOM resources/downloads, and WebSocket handshakes. `src/api/workspace-transport.ts` appends scope only to API URLs; external origins and `data:`/`blob:` resources retain their existing URLs. Runtime resource preparation and release remain responsible for direct/demo/Mewlink resource handling. Scope does not depend on custom headers that an image, link, or socket constructor could omit.

`server/workspace-scope.ts` resolves HTTP requests and WebSocket upgrades into `paths.ts`'s `AsyncLocalStorage`. Each connection retains its captured root and rechecks current authentication and permissions. Revalidation also rejects a changed canonical root or Documents location. It does not retarget an explicit connection after an account-level project switch.

| Workspace request | Explicit scope | Legacy unscoped request |
| --- | --- | --- |
| `GET /api/workspace` | Returns the validated scope's actual/logical identity and project-existence state. `include=workspace-ui` adds its logical project's initial UI snapshot. | Reads the account's selected root and existing fallback/onboarding state. |
| `POST /api/workspace` with `{path}` | Resolves and returns the destination without saving account selection or broadcasting a selection change. | Saves the requesting account's selected project under the existing contract. |
| `POST /api/workspace` with `{path, worktree: true, workspace}` | Requires `workspace` to match the initiating actual root and validates the destination worktree while retaining logical identity. | Retains the existing account worktree-switch contract. |

A destination response does not mutate its initiating client's scope. The host creates or selects a client for the confirmed destination before issuing its subsequent root-relative operations. Existing mutation preconditions remain separate: file/upload roots, task owners, Git owner/workspace headers, command roots, and logical UI-ledger paths must agree with the initiating scope. Contradictory values return the endpoint's conflict response, rather than overriding request context.

## Client and cache ownership

`createWorkspaceClient(scope)` copies and freezes its two paths. `WorkspaceApiProvider` supplies a stable client to hooks and tools through `useWorkspaceApi`. A scoped client's default API project is `.workspace`; `setProject` changes only that instance's API project. Its HTTP methods, Git login continuation, editor API, resource helpers, and socket factory capture the same root. Authentication helpers remain account operations.

The compatibility adapter preserves legacy browser project restoration. Concurrent workspaces use their provider's API instead of the legacy mutable selection. This includes ancillary editor-tab, agent-command/harness, project-guidance, managed skill/MCP, drawing, and debugger clients. Callback and effect dependencies include bound methods so a replacement provider cannot retain an old root accidentally.

`createContentCache(workspacePath)` binds the existing get/load/put/drop operations to one actual root. Entries retain account/instance, actual root, API project, and file-path boundaries. All clients share the existing bounded memory map, persistence queue, IndexedDB namespace, eviction limits, and account invalidation. A cold read for one bound root can finish after another root gains focus. Concurrent local edits, removals, account changes, or storage-namespace changes still invalidate stale results. [File loading](file-loading.md) owns validation and read-only cache-preview behavior; [browser storage](browser-storage.md) owns budgets and persistence.

`useTabs` uses its client's cache, fetch, save methods, and database-page mutation coordinator. Delayed saves keep their original client and conflict baseline. Database document mutations use a coordinator per explicit client. Task-document handlers and request queues are keyed by actual workspace root so one project cannot replace another project's draft-protection handler or block its request queue.

## Agent inputs, terminals, and command records

Agent input drafts and sent-input history use the browser account, logical project, actual working root, and tab ID as their owner. The storage maps retain their existing names, with versioned keys for that identity. `useAgentInputDraft` restores the matching owner's text when its scope changes and ignores delayed setters captured by a previous owner. Closing a tab clears only that owner's draft and input history. Mewcat-created drafts use the same owner as the destination agent panel.

The single-project compatibility view may move a legacy tab-only draft or history entry into its current owner once. Explicit views leave those ambiguous entries untouched. The migration removes the old entry after a successful storage write; a failed write leaves the disk value available for a later retry. Drafts with a known owner remain separate across projects and worktrees in either mode.

New authenticated agent terminals in both modes derive their server-side session name from the account, logical project, actual working root, runtime, and tab ID. The account request context captures both paths before asynchronous work begins. Reconnection or a mode change within that identity reuses the terminal. The start and close routes derive the same identity from request context. A worktree handoff retains the logical tab ledger but uses a distinct execution session for the new actual root.

Preexisting tab-only terminal sessions retain their names. The single-project adapter may reuse one when no qualified session exists. Explicit requests cannot infer its former account or root and therefore never adopt, rename, or terminate it. Mode continuity applies to qualified sessions created with known ownership; an old unqualified artifact remains separate. The terminal session name also separates its browser input draft and history.

New CLI command records in both modes store a private `workspaceScope` containing the captured actual and logical roots. The existing host queue carries this field with the command; public command payloads omit it. Listing, closing a tab's commands, stopping a command, and reading its output or archive require an exact workspace match in addition to account ownership. Conversation queries retain their runtime, cwd, and session filters. Reusing a command ID with a different workspace fails. Qualified command records remain accessible across mode changes within the same workspace. Client command snapshots, retries, and pending reads also include API scope in their ownership key, preventing a late response from merging another view's records.

Preexisting unmarked command records retain their legacy account ownership. The single-project adapter additionally permits those records; explicit views cannot claim them. The records remain on disk. The server does not infer missing root ownership from cwd: agent working directories may lie outside the selected project, and nested projects can share a cwd. A mode switch does not migrate these unknown-root artifacts.

## Subscriptions and cross-view events

| Channel | Scope and lifetime |
| --- | --- |
| File collaboration | The handshake uses the workspace client; the wire room remains `project:relativePath`. Server room identity includes the actual root. A hook's exposed document identity includes its scope, preventing a same-name document from a previous root appearing during a provider change. |
| Shared memo | Uses its reserved global room and the shared transport, independently of the project's explicit scope. |
| Live Git/debugger resources | Client connections and channel caches are keyed by captured actual/logical scope. Identical subscriptions within that scope share a channel. The final unsubscribe closes its connection and removes listeners. Server sources retain root/account/resource keys and recheck access before reads. |
| DB event hub | Server event keys include actual root, project, and database ID; client connection registries separate roots. This isolation does not enable explicit-scope Postgres access; see the restriction below. |
| Task event stream | Uses the scoped client and captured owner/workspace preconditions; teardown cancels the stream and polling listeners. |
| Account tab signals | Remain content-free and account-scoped. Consumers reread the matching logical project's ledger under the [account-tab contract](account-tabs.md). |

`WorkspacePresence` provides one account connection for registered views. It sends `workspace-subscriptions` with the registered scopes and sends active focus separately. Participant payloads distinguish roots; tree messages include `workspacePath`. Explicit views ignore legacy account-selection messages while retaining matching tree, tab, permission, catalog, and theme updates. The [collaboration contract](collaboration.md) owns room storage and presence history.

The browser's `mew:database-page-updated` event carries `{workspacePath, project, path, content}`. `useTabs` filters by actual root before matching the API project and relative path. An explicit workspace ignores an event without a matching root. Absolute external-file updates and absolute-path title previews retain their existing physical-file identity.

The demo collaboration provider receives the same optional scope. Its canonical-file resolver accepts an explicit actual root without changing the demo store's selected workspace. Aliases for the same physical file retain one CRDT document; separate roots retain separate documents.

## Explicit presentation

`WorkspaceViewProvider` carries view ID, compact presentation, active state, and an owning DOM root. `useWorkspaceDesktop` follows that presentation when a desktop project panel uses the compact mobile composition. Actual pointer, touch, keyboard, and viewport capabilities remain independent. Scoped compact CSS changes workspace placement; body portals keep their existing viewport bounds.

`useDeviceLayout` retains independent single-project and compact-panel geometry sessions. Single-project desktop geometry remains account-wide; mobile and compact geometry use separate per-project storage. Accepted geometry also survives blocked browser storage in memory. A presentation change restores its geometry before layout effects may save it, and chrome restoration is keyed by presentation as well as logical project. The retained editor does not need a remount to apply that state. Compact writes cannot replace single-project desktop or mobile storage.

The shell tracks the confirmed legacy account root separately from board slots. Only the matching active single view uses the unscoped adapter; a handoff keeps explicit clients until an account workspace read confirms the destination. Closing or replacing a panel makes it inert from the save barrier through completion, preventing new unsaved input during that operation. Failure restores the same view. Shared Mewcat actions resolve the matching actual root's registered, ready handle after focus or replacement, rather than retaining an originating view's callbacks.

Account theme, fonts, personal projects, notification collection, Mewpet, and the shared native Browser belong above project views in `WorkspaceAccountProvider`. Project focus supplies callbacks to those shared owners. The board owns arrangement and panel handles under the [workspace layout contract](ui-workspace-layout.md); it does not own file-saving logic. Integration checks must establish editor/undo/IME retention and singleton lifecycle behavior across mode changes. Source composition alone does not establish those results or measured multi-panel performance.

## Current Postgres restriction

Explicitly scoped requests currently fail closed for Postgres. The existing shared pool/catalog has not completed its root-isolation migration. `isDbConfigured()` returns false in an explicit request context, and `getPool()` throws before creating or using a pool. This restriction follows the request scope, even when a client is embedded outside the multi-project board. Legacy unscoped database requests retain their existing configuration and behavior.

| Operation in a valid explicit scope | Current result |
| --- | --- |
| Otherwise authorized, valid `/api/db` service operation | HTTP 503 before pool access. Earlier authentication, permission, or input errors retain their ordinary responses. |
| `/api/db/ws` upgrade | HTTP 401 rejection before the upgrade under the current database authorization guard. Invalid scope/origin/authentication may be rejected earlier. |
| Ordinary file reads, including Markdown source with DB frontmatter | Follow the normal file permission and read path. Embedded database views remain unavailable through the guarded DB APIs. |
| Ordinary Markdown save | Uses the normal file save path without requiring Postgres. A UUID filename alone does not make a file DB-bound. |
| Markdown save with a string-valued `_mew_database` frontmatter field in the existing file, submitted content, or expected baseline | HTTP 503 before writing the file. This also prevents bypassing the guard by removing an existing binding or creating a newly bound file. |
| Generic filesystem rename, move, or delete | Retains filesystem behavior; optional Postgres metadata synchronization is skipped. This is not support for the full DB-bound page lifecycle in explicit scope. |

Keep these guards until catalog access, transactions, metadata synchronization, and live authorization can be verified for independent roots. Root-keyed event delivery alone is insufficient. [Database row pages](database-row-pages.md) remains authoritative for the full supported row-page lifecycle.

## Implementation entry points

- Request validation: `shared/workspace-scope.ts`, `server/workspace-scope.ts`, `server/account-workspace.ts`, `server/reqAuth.ts`, and `server/live-sources.ts`.
- Client boundary: `src/api/client.ts`, `src/api/workspace-transport.ts`, and `src/api/workspace-api-context.tsx`.
- Local state: `src/utils/contentCache.ts`, `src/utils/database-page-mutations.ts`, `src/utils/task-document-sync.ts`, `src/hooks/useTabs.ts`, `src/utils/agentInputDrafts.ts`, and `src/hooks/use-agent-input-draft.ts`.
- Agent execution ownership: `server/agentTerminal.ts`, `server/agent-command-routes.ts`, and `server/agent-commands.ts`.
- Presentation geometry: `src/hooks/use-device-layout.ts` and `src/utils/device-layout.ts`.
- View and account ownership: `src/workspace/workspace-view-context.ts`, `src/workspace/workspace-account.tsx`, `src/workspace/workspace-presence.ts`, and `src/workspace/workspace-application.tsx`.
- Restriction: `server/db/pool.ts`, `server/db/rowPageIntegration.ts`, and database socket authorization in `server/reqAuth.ts`.

The scope, client, cache, task-sync, demo collaboration, and two-workspace hook fixtures provide focused regression coverage. The [work record](../work/multi-project-mode.md) distinguishes those local checks from complete UI acceptance, performance measurements, builds, deployment, and operational application.
