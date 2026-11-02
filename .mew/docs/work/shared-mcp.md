---
title: "Mew common MCP implementation"
description: "Records the 2026-11-02 implementation of account-owned common MCP registration, native imports, shared OAuth, runtime injection, connection controls, and local verification. Separates fixture checks and builds from pending server application and real-provider approval."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and resulting behavior

The user requested one MCP connection in Mew instead of repeating registration and authorization after switching between Claude Code and Codex. The implementation adds an account-private **Mew common** registry, URL entry and advanced JSON, native definition import, connection checks, inline OAuth approval through the host login desktop, and saved authentication shared across ACP runtimes.

Imports preserve native source files, capture a local source's working folder, and copy only referenced source-runtime environment values into private common configuration. Common bindings are reread for each new/cleared/loaded ACP conversation. Local, HTTP, and SSE transports pass through a stdio bridge. Authentication uses the MCP SDK, process-shared refresh coordination, credential epochs, effective-secret identity, and account/access/configuration guards. Account deletion clears common MCP data. The [common MCP contract](../development/shared-mcp.md), [source manager contract](../development/agent-harness.md), [user guide](../../../docs/configuration/agent-harness.md), and [ADR 0120](../decisions/0120-shared-mcp.md) own the current behavior and rationale.

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
