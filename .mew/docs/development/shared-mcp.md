---
title: "Mew common MCP connections"
description: "Defines installation-wide common MCP registration and imports, stdio forwarding into ACP runtimes, shared OAuth storage and refresh coordination, connection jobs, host-browser approval, conversation-free startup diagnostics, permissions, and verification boundaries."
created: "2026-11-02"
updated: "2026-11-04"
---

Mew common MCP lets an owner register and authorize a server once for all accounts with agent access on the same Mew installation. [The user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) owns everyday controls. [ADR 0127](../decisions/0127-installation-wide-mcp.md) records installation-wide sharing and supersedes the account-private ownership in [ADR 0120](../decisions/0120-shared-mcp.md).

## Definitions and ownership

`DATA_DIR/mcp/servers.json` contains `{ "mcpServers": { "name": configuration } }`. The directory uses mode 0700 and new/replaced files use 0600 on POSIX. All account contexts and standalone runners select this same registry. API requests cannot supply another registry or a file path. Definitions and authentication are private server data shared by the installation; they are not written into project files or native CLI configuration.

Existing account-private registries and credentials remain at their original paths and are not automatically merged, exposed, or used as a fallback. An owner must explicitly register or import a definition into the installation registry. This preserves the previous private data without silently broadening its audience.

Definitions support a local `command`, string-array `args`, optional absolute `cwd`, and string-map `env`, or a remote HTTPS URL with `type: "http"` or `"sse"`, optional string-map `headers` and `env`, and optional OAuth `scope`, `client_id`, and `client_secret`. HTTP is allowed only on loopback. `enabled: false` prevents injection and connection checks. URL credentials, fragments, malformed headers, and unsupported provider-specific execution or tool-filter settings are rejected. Environment references use `${NAME}` and fail explicitly when the required variable is missing. Raw definitions and credentials remain out of inventory summaries and browser persistence.

The source manager converts supported Claude, Codex, OpenCode, and other discovered definitions to this format when **Import to Mew** is selected. For local imports it captures the source project working folder. It copies only referenced source-runtime environment values into the installation common definition, so a token configured only for Claude or Codex remains available in the other runtimes. Unrelated runtime environment values are excluded, and unresolved references fail before writing. It preserves the original configuration and never imports another CLI's private OAuth tokens. Native source editing and import conflict rules follow [the harness contract](agent-harness.md). Unsupported fields require the user to create an explicit common definition rather than silently losing behavior.

## Runtime application

`AgentSession` reads the installation's enabled definitions for each session/new and session/load request and combines them with existing debugger or Mewpet MCP bindings. Each definition becomes a local stdio binding to `shared-mcp-stdio.ts`, with only its private registry directory and name in the arguments. A stable `mew_<name>_<hash>` namespace avoids collisions with native server names and sanitized names. Existing native definitions can still load independently; importing does not disable them.

The bridge forwards the complete JSON-RPC stream, including notifications, server requests, tools, resources, and prompts. Local servers use SDK stdio transport; HTTP and SSE use SDK remote transports. Runtime differences in native remote transport and token stores are hidden behind this stdio connection. The bridge does not print authorization URLs or tokens.

An active conversation retains its existing MCP bindings. Starting a new conversation, clearing it, or loading a saved conversation reads the current common list, including within the same supervisor. Reconnecting the current conversation alone does not refresh it. ACP support and the server's existing agent access boundary remain prerequisites; external CLIs launched outside Mew do not automatically receive these definitions.

## Shared authentication

Mew uses the pinned MCP SDK's OAuth discovery, dynamic client registration, PKCE, and token exchange. Credentials live under the installation's private MCP directory, separated by configuration identity and effective expanded header/OAuth values. Changing the endpoint, credentials, or other connection settings selects a different credential identity. PKCE verifiers remain in the interactive job's memory; background bridges cannot replace them. Each approval retains its own registered client and saves the matching client/token pair together. Native Claude/Codex OAuth credentials remain owned by those clients; the first common connection may require a new approval. Removing a Mew account cancels its pending authorization jobs and removes its legacy private MCP directory, but preserves the installation registry and credentials for other accounts.

Each bridge reads the same installation credential cache. A bounded process-shared refresh lock checks the latest saved token before exchanging a refresh token. If another process already rotated it, the waiting process uses the new tokens. Token/client-pair saves and invalidation use the same lock; status and discovery live in separate files so metadata publication cannot restore an older token pair. An epoch invalidates late saves after **Disconnect**, so an older connection cannot restore cleared credentials. Background bridges report that login is needed instead of opening an unattended authorization browser.

Codex ACP MCP startup diagnostics do not create assistant reply bubbles. The [conversation display contract](conversation-storage.md#display-tool-events) preserves their original records while excluding them from rendered turns. This does not suppress real MCP tool activity or change connection management.

Connection status records the latest successful check or authentication requirement; it is not continuous server health monitoring. **Connect** checks the MCP initialization handshake. **Disconnect** cancels a pending job and clears saved credentials. It does not disable the definition, remove native CLI registrations, or revoke a provider grant remotely. An existing request may finish before credential invalidation is observed.

## Connection jobs and API

All endpoints require an authenticated account with the `agent` feature and return `Cache-Control: no-store`. Inventory, status, and runtime use are available to every such account. Reading raw common definitions, changing definitions, importing, and starting/cancelling/disconnecting authentication additionally require the owner role. Endpoints accept the common server's name, rediscover the installation configuration, and never accept credential paths or another account ID.

| Endpoint | Result |
| --- | --- |
| `GET /api/agent/mcp/status?name=...` | `{name, status, error?, streamUrl?, ownsJob?}`; status is disconnected, connecting, needs_auth, connected, or error |
| `POST /api/agent/mcp/connect` | `{name}` starts or returns the installation's bounded connection job for that server |
| `POST /api/agent/mcp/cancel` | Cancels a pending job while preserving credentials |
| `POST /api/agent/mcp/disconnect` | Cancels work and clears the common connection's saved credentials |

Only one connection job may run for a registry/server name across all accounts. Status can report that shared work, but the login stream remains visible only to the initiating account. `ownsJob` identifies that account so closing an observer's management panel does not automatically cancel another account's approval. A second account cannot take over or open its login desktop. Another owner may explicitly cancel or disconnect the shared connection.

An OAuth job binds a temporary callback listener to `127.0.0.1` with an unpredictable path. It validates state, permits one callback, and opens the authorization URL through the existing account/job-owned host login desktop. The browser UI receives only its authorized stream URL. This lets a Mewlink viewer complete a host-loopback callback without opening a callback on the viewer's own computer. The job checks account identity, live access, configuration identity, cancellation, and its deadline, and closes the callback listener, transport/process, and login desktop when finished.

The host login desktop currently requires Linux/WSL and its Chrome/X11 dependencies. Unsupported hosts and browser setup failures are shown as connection errors. Ordinary unauthenticated remote MCP and local stdio checks do not require that desktop.

## Verification

Isolated tests cover native import preservation, read-only imports, stale revisions, installation sharing, owner-only management, preserved private registries, injection into Claude/Codex new/load/clear requests, transport forwarding, credential epochs, simultaneous refresh from independent Node processes, OAuth callbacks, cancellation, account/access/configuration changes, and desktop/mobile controls. Tests use fixture MCP servers and authentication responses. They do not prove approval by a real provider, actual Cloudflare permissions, or production rollout. The dated [work record](../work/shared-mcp.md) lists checks actually performed.
