---
title: "Mew common MCP connections"
description: "Defines account-private common MCP registration and imports, stdio forwarding into ACP runtimes, shared OAuth storage and refresh coordination, connection jobs, host-browser approval, permissions, and verification boundaries."
created: "2026-11-02"
updated: "2026-11-02"
---

Mew common MCP lets one Mew account register a server and authorize it once for use across its projects and ACP runtime conversations. [The user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) owns everyday controls. [ADR 0120](../decisions/0120-shared-mcp.md) records the change from native-source-only management.

## Definitions and ownership

`DATA_DIR/agent-accounts/<normalized account SHA-256>/mcp/servers.json` contains `{ "mcpServers": { "name": configuration } }`. The directory uses mode 0700 and new/replaced files use 0600 on POSIX. Mew's existing account-settings context selects the owner; API requests cannot choose another account or a file path. This registry is private instance data and is not written into project files or native CLI configuration. Standalone runners without an account use the legacy data root; authenticated requests never inherit that fallback.

Definitions support a local `command`, string-array `args`, optional absolute `cwd`, and string-map `env`, or a remote HTTPS URL with `type: "http"` or `"sse"`, optional string-map `headers` and `env`, and optional OAuth `scope`, `client_id`, and `client_secret`. HTTP is allowed only on loopback. `enabled: false` prevents injection and connection checks. URL credentials, fragments, malformed headers, and unsupported provider-specific execution or tool-filter settings are rejected. Environment references use `${NAME}` and fail explicitly when the required variable is missing. Raw definitions and credentials remain out of inventory summaries and browser persistence.

The source manager converts supported Claude, Codex, OpenCode, and other discovered definitions to this format when **Import to Mew** is selected. For local imports it captures the source project working folder. It copies only referenced source-runtime environment values into the private common definition, so a token configured only for Claude or Codex remains available in the other runtimes. Unrelated runtime environment values are excluded, and unresolved references fail before writing. It preserves the original configuration and never imports another CLI's private OAuth tokens. Native source editing and import conflict rules follow [the harness contract](agent-harness.md). Unsupported fields require the user to create an explicit common definition rather than silently losing behavior.

## Runtime application

`AgentSession` reads enabled definitions under its captured account for each session/new and session/load request and combines them with existing debugger or Mewpet MCP bindings. Each definition becomes a local stdio binding to `shared-mcp-stdio.ts`, with only its private registry directory and name in the arguments. A stable `mew_<name>_<hash>` namespace avoids collisions with native server names and sanitized names. Existing native definitions can still load independently; importing does not disable them.

The bridge forwards the complete JSON-RPC stream, including notifications, server requests, tools, resources, and prompts. Local servers use SDK stdio transport; HTTP and SSE use SDK remote transports. Runtime differences in native remote transport and token stores are hidden behind this stdio connection. The bridge does not print authorization URLs or tokens.

An active conversation retains its existing MCP bindings. Starting a new conversation, clearing it, or loading a saved conversation reads the current common list, including within the same supervisor. Reconnecting the current conversation alone does not refresh it. ACP support and the server's existing agent access boundary remain prerequisites; external CLIs launched outside Mew do not automatically receive these definitions.

## Shared authentication

Mew uses the pinned MCP SDK's OAuth discovery, dynamic client registration, PKCE, and token exchange. Credentials live under the account's private MCP directory, separated by configuration identity and effective expanded header/OAuth values. Changing the endpoint, credentials, or other connection settings selects a different credential identity. PKCE verifiers remain in the interactive job's memory; background bridges cannot replace them. Each approval retains its own registered client and saves the matching client/token pair together. Native Claude/Codex OAuth credentials remain owned by those clients; the first common connection may require a new approval. Removing a Mew account deletes its common definitions and credentials so reusing the same email does not inherit them.

Each bridge reads the same account-owned credential cache. A bounded process-shared refresh lock checks the latest saved token before exchanging a refresh token. If another process already rotated it, the waiting process uses the new tokens. Token/client-pair saves and invalidation use the same lock; status and discovery live in separate files so metadata publication cannot restore an older token pair. An epoch invalidates late saves after **Disconnect**, so an older connection cannot restore cleared credentials. Background bridges report that login is needed instead of opening an unattended authorization browser.

Connection status records the latest successful check or authentication requirement; it is not continuous server health monitoring. **Connect** checks the MCP initialization handshake. **Disconnect** cancels a pending job and clears saved credentials. It does not disable the definition, remove native CLI registrations, or revoke a provider grant remotely. An existing request may finish before credential invalidation is observed.

## Connection jobs and API

All endpoints require an authenticated account with the `agent` feature and return `Cache-Control: no-store`. They accept the common server's name, rediscover its private configuration, and never accept credential paths or another account ID.

| Endpoint | Result |
| --- | --- |
| `GET /api/agent/mcp/status?name=...` | `{name, status, error?, streamUrl?}`; status is disconnected, connecting, needs_auth, connected, or error |
| `POST /api/agent/mcp/connect` | `{name}` starts or returns the account's bounded connection job |
| `POST /api/agent/mcp/cancel` | Cancels a pending job while preserving credentials |
| `POST /api/agent/mcp/disconnect` | Cancels work and clears the common connection's saved credentials |

An OAuth job binds a temporary callback listener to `127.0.0.1` with an unpredictable path. It validates state, permits one callback, and opens the authorization URL through the existing account/job-owned host login desktop. The browser UI receives only its authorized stream URL. This lets a Mewlink viewer complete a host-loopback callback without opening a callback on the viewer's own computer. The job checks account identity, live access, configuration identity, cancellation, and its deadline, and closes the callback listener, transport/process, and login desktop when finished.

The host login desktop currently requires Linux/WSL and its Chrome/X11 dependencies. Unsupported hosts and browser setup failures are shown as connection errors. Ordinary unauthenticated remote MCP and local stdio checks do not require that desktop.

## Verification

Isolated tests cover native import preservation, read-only imports, stale revisions, account isolation, injection into Claude/Codex new/load/clear requests, transport forwarding, credential epochs, simultaneous refresh from independent Node processes, OAuth callbacks, cancellation, account/access/configuration changes, and desktop/mobile controls. Tests use fixture MCP servers and authentication responses. They do not prove approval by a real provider, actual Cloudflare permissions, or production rollout. The dated [work record](../work/shared-mcp.md) lists checks actually performed.
