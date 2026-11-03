---
title: "Mew common MCP implementation"
description: "Records the common MCP implementation, the November 3 installation-wide ownership change, and the November 4 corrections for startup diagnostic reply bubbles and an unavailable sign-in action. Separates fixture checks and builds from pending server application and real-provider approval."
created: "2026-11-02"
updated: "2026-11-04"
---

## Initial implementation: 2026-11-02

The user requested one MCP connection in Mew instead of repeating registration and authorization after switching between Claude Code and Codex. The implementation adds an account-private **Mew common** registry, URL entry and advanced JSON, native definition import, connection checks, inline OAuth approval through the host login desktop, and saved authentication shared across ACP runtimes.

Imports preserve native source files, capture a local source's working folder, and copy only referenced source-runtime environment values into private common configuration. Common bindings are reread for each new/cleared/loaded ACP conversation. Local, HTTP, and SSE transports pass through a stdio bridge. Authentication uses the MCP SDK, process-shared refresh coordination, credential epochs, effective-secret identity, and account/access/configuration guards. Account deletion clears common MCP data. The [common MCP contract](../development/shared-mcp.md), [source manager contract](../development/agent-harness.md), [user guide](../../../docs/configuration/agent-harness.md), and [ADR 0120](../decisions/0120-shared-mcp.md) own the behavior and rationale; the installation-wide follow-up below changes the original ownership and deletion rules.

Relevant native TOML regression checks exposed a preservation failure caused by parser tables with null prototypes. Parsing now clones TOML tables before semantic comparison, retaining source values and allowing existing safe edits.

## Local verification

- The final combined shared MCP, harness, account-settings, ACP, supervisor, WebSocket, and Mewpet regression run passed 99 checks. This includes actual SDK fixture handshakes, account isolation, imports and conflicts, new/load/clear injection, OAuth callbacks, cancellation, refresh from independent processes, desktop/mobile controls, and credential invalidation. Two independently launched stdio bridge processes successfully used the same private HTTP definition for tools, resources, and prompts.
- The UI fixture covers desktop at 1200 px and touch/mobile at 390 px, with mocked connection status and the existing login viewer stubbed. Paired captures were inspected for overflow and control access. Impeccable detection reported no findings on the two changed UI components.
- Focused UI localization tests passed four checks.
- `npm run build` passed, including TypeScript project checks. Vite retained its large-chunk warning.
- `npm run lint` passed with the repository's existing React warnings; focused new modules passed without warnings.

Integration review reproduced a background authentication attempt replacing an interactive PKCE verifier and a metadata publication overwriting a newly rotated credential pair. Verifiers now remain in provider memory, successful authorization saves the matching client/token pair, and metadata publication is separate from locked credential-pair writes. Regression checks cover the actual SDK unauthorized path, concurrent aliases, a new client grant without an old client's refresh token, and deterministic overlap between metadata publication and another process's token save.

The full `npm run check:docs` metadata stage passed. Its link stage reported one unrelated absolute image URL in `.mew/tasks/Image preview and attachment editing.md`; that in-progress task was left unchanged. The existing metadata/link checker functions were also applied to this task's eight changed documents: zero description or link errors. `git diff --check` passed.

## Application and limits

No deployment, launcher execution, or app-server lifecycle operation was performed. The build updates `dist/` in this checkout; the user must apply server-side changes through the repository's normal lifecycle procedure. Start or clear a conversation after common registrations change. Existing external CLI registration and authentication remain independent.

Real Cloudflare approval, DNS/certificate mutation, and real-provider permissions were not tested. The first common authorization can require user approval even when that provider was previously connected in another native CLI. The OAuth host login desktop retains its Linux/WSL and Chrome/X11 prerequisites. Connection status reports the last check rather than continuous availability.

## Installation-wide follow-up: 2026-11-03

The user requested sharing common MCP across all Mew login accounts. Definitions and credentials now use the installation registry, with agent permission required for inventory, status, and ACP use and owner permission additionally required for raw details, mutations, imports, and authentication changes. Connection jobs remain initiator-owned and are deduplicated by shared registry/server name. Account deletion cancels the initiating account's jobs and retains legacy private-directory cleanup while preserving shared definitions and credentials.

Existing private registries remain untouched and are not automatically promoted. Native import preserves originals and rejects unsupported settings; preparing an explicit supported common definition is a separate action. [ADR 0127](../decisions/0127-installation-wide-mcp.md) records the ownership change, and the [current contract](../development/shared-mcp.md) owns its details.

Local follow-up verification:

- The combined shared MCP, OAuth, bridge, harness, route, and desktop/mobile UI run passed 54 tests. Regression coverage includes cross-account new/load/clear injection, shared credential retention after account deletion, single-job authorization, initiator-only login streams, observer panels preserving pending approval, owner-only management, and rejection of items or destinations absent from the authorization snapshot.
- `npm run build` passed, including TypeScript project checks. Vite retained its large-chunk warning.
- The shared UI translation suite passed four tests. A separate repository-wide literal scan passed one test and failed its untranslated-literal check on files outside the changed MCP UI modules; it reported no findings in those modules.
- `npm run lint` passed with existing React warnings. Focused changed-file lint also passed with existing effect warnings in the harness modal.
- The full documentation metadata check passed with 676 descriptions and zero errors. The full link check still reports the unrelated task image URL described above; this change's eight documents pass metadata and link checks.
- A local registration operation validated every source before publishing the complete common registry, deduplicated equivalent entries, preserved native source bytes, and verified eight distinct runtime bindings and POSIX file mode 0600. Unsupported native timeout options were omitted only from explicitly prepared common definitions; their original settings remain unchanged. This checked registration and configuration, not live provider access.

No deployment, launcher execution, or app-server lifecycle operation was performed. The user must apply the server-side change before the running installation uses the shared registry, then start or reload a conversation. Real-provider approval remains unverified and can require a fresh owner connection in the common MCP panel.


## MCP startup reply-bubble correction: 2026-11-04

Read-only transcript inspection and an isolated event-fold reproduction confirmed that Codex ACP can emit reserved `mcp_startup.*` tool-call diagnostics after a completed user turn. The conversation fold created a new tool-only turn; the idle UI then labelled that empty reply “Done”. No synthetic user prompt or actual assistant “Done” text was responsible.

The display fold now ignores these startup diagnostics before creating a turn. Deferred history preserves their identity instead of converting them into anonymous work markers, while retaining every sequence position. Original transcript records, real MCP tool calls, and genuine assistant replies remain intact. The [conversation display contract](../development/conversation-storage.md#display-tool-events) owns this behavior; MCP connection management and authorization are unchanged.

Local verification:

- All 29 focused tests passed: 28 event-fold, display projection, and history-state tests plus one real AgentPanel browser regression covering both 1100px desktop and 390px mobile. Checks include late startup call/update events, restored history, startup-only history, ordinary MCP tool details, genuine assistant “Done” text, and preserved sequence positions and source objects.
- `npm run build` passed, including TypeScript and Vite, with the existing large-chunk warning. Separate TypeScript and new browser-test lint checks passed. Global `npm run lint` passed with existing warnings.
- `npm run check:docs` found 676 valid descriptions and the existing unrelated absolute image link in the Image preview and attachment editing task. The three changed documents passed scoped metadata and link checks. `git diff --check` passed.

No production transcript was modified, and no deployment, launcher invocation, or server lifecycle operation was performed. Real-provider reconnection and runtime application remain outside local fixture verification.


## Saved sign-in state recovery: 2026-11-04

A saved `needs_auth` status was treated as an active login job. The management panel displayed only cancellation, even though no authorization job or login desktop existed; cancelling returned the same saved state.

The panel now distinguishes saved authentication requirements from live jobs using the existing `ownsJob` field. A saved requirement shows **Log in** and starts no polling or cancellation merely from opening or closing the panel. Selecting **Log in** starts the existing owner-authorized connection flow. Active approval polling, login desktop display, explicit owner cancellation, and initiator-only automatic cleanup retain their behavior. No backend authorization or credential storage contract changed. The [current connection contract](../development/shared-mcp.md#connection-jobs-and-api) and [user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) own the controls.

The regression failed before the fix because no login button existed. After the fix, both desktop/mobile harness browser tests passed, covering 1200px and 390px viewports, idle saved sign-in state, absence of polling/cancellation, starting an owned login job, the login viewer, and existing owner-observer/member restrictions. Four shared translation tests also passed. `npm run build` and `npm run lint` passed with existing warnings. The three changed documents passed description and link checks; the full documentation check found 678 valid descriptions and the existing unrelated task image link. `git diff --check` passed.

The build updates the served UI assets; refreshing the browser applies this frontend correction without a backend change. No real-provider approval or server lifecycle operation was performed.
