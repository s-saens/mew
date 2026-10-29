---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Continue mew agent authentication in the GUI. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0072 — Continue mew agent authentication in the GUI"
created: 2026-08-21
updated: 2026-09-11
---

- Date: 2026-08-21
- Status: Adopted
- Follow-up decision: [0110](0110-mew-declarative-agent-authentication-jobs.md) — Extend single terminal auth into declarative multiple authentication jobs
- Follow-up decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Placement of Claude and Gemini interactive authentication
- Follow-up decision: [0121](0121-mew-codex-oauth-through-scoped-server-browser.md) — Codex device-code default
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Open an external tab for ACP URL authentication
- Partially supersedes: 0044 — Enables only the authentication capability within the scope that previously left `clientCapabilities` empty. Continues not advertising `fs` and preserves CLI tool parity.
- Decision makers: Song Sanghun (direction), Codex (implementation)
- Related: [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md), [ADR 0061](0061-mew-claude-acp-official-org-migration.md), [ADR 0062](0062-mew-agent-tab-runtime-gate-and-install.md)

## Background

Successful runtime installation means only that the executable exists, not that authentication with a provider account such as Claude, Codex, or
Gemini is complete.
Previously, if `session/new` returned an authentication error immediately after ACP `initialize`, the agent window closed the connection as fatal, requiring the user to log
in through a server terminal outside Mew and reopen the tab. When the server and browser are on different devices, having the server
open an OAuth browser directly also does not display it on the user's screen.

ACP adapters advertise standard authentication, API keys, URL elicitation, and terminal auth as distinct methods. Mew needs a boundary that preserves
these differences while avoiding unnecessary exposure of secrets and execution commands to the browser.
There are also cases such as Hermes and Kimi, which use newer terminal auth fields that Mew's direct SDK version 0.14 strips out; Cursor,
which only provides login command instructions; and cases where the ACP process itself exits before authentication. Assuming
ACP initialized successfully is insufficient to recover all registered runtimes.

## Options

1. Direct users to log in through a separate terminal after installation — Simple to implement, but interrupts the flow within the agent window and is difficult over remote connections.
2. Build Mew's own OAuth server and token store — Provides a consistent UI, but duplicates each provider's authentication implementation and takes on ownership of long-term credentials.
3. Relay authentication methods advertised by ACP through the agent window — The adapter owns provider authentication, and Mew only connects state and user actions.
4. Prioritize ACP authentication and use fixed terminal auth from the runtime registry as the shared recovery path — preserving standard flows while
   accommodating pre-ACP failures and differences between SDK generations.

## Decision

Adopt option 4.

### State and sessions

- Store the `authMethods` returned by `initialize` in the session. If the subsequent `session/new` returns an authentication-required error, transition to the
  `auth` state without closing the process or ACP connection.
- After successful ACP standard/API-key login, call `session/new` again on the same connection, and proceed to the conversation, history, and
  input UI only if it succeeds. If credentials expire during a conversation and cause the same error, return to the login state.
- If ACP exits before `initialize` or fails to run, keep the tab supervisor process and Unix socket alive. The supervisor sends one terminal auth
  method from the runtime registry and the startup error in the `auth` state, then spawns and initializes a new ACP process after receiving
  completion confirmation. Child process termination immediately becomes a handshake failure instead of relying on the SDK's stdio EOF handling.
- Send only the method's id, name, description, and type to the browser. Do not put API keys or terminal execution specs in events or replay buffers.

### Authentication methods

- Run standard ACP methods through `authenticate`. When URL elicitation arrives, display the full URL and host, and open a new tab only
  after the user clicks **Open Login Page**, then respond with `accept`. Allow HTTPS only, with an exception
  for development loopback HTTP.
- Accept the API key once through a password input and include it only in `_meta["api-key"]` of the ACP request. Do not store it in Mew storage,
  logs, or events. The runtime registry owns the wire shape. Codex runtimes require `{apiKey: 값}`, while Gemini ACP requires
  the string itself, so do not apply the same payload to every runtime.
- For terminal auth, retain the fixed command advertised by the adapter's `_meta["terminal-auth"]` only in the server session. When a manager or owner runs it
  in Mew's tmux popup, atomically record only the actual command's exit code in `<DATA_DIR>/agent-auth`. The GUI monitors the status even after the popup closes, and discards
  the existing ACP process and initializes a new one only when the code is `0`. On failure, cancellation, or forced termination,
  do not restart; retain the terminal and error state. Do not create a race in which the user's manual completion
  button kills a device-code command that is still polling. Follow the ACP contract requiring the connection to be reestablished after the
  separate terminal process exits, and also prevent a running adapter from caching settings and missing the login
  result. HTTP requests accept only runtime, tab, and method IDs, not arbitrary commands or arguments.
- Give Codex child processes `NO_BROWSER=1` by default to hide server-side localhost browser login and use the
  ACP URL elicitation-based device-code method. If the operator has already set `NO_BROWSER`, honor that value.

### Recovery commands in the runtime registry

| Runtime | terminal auth | Notes |
| --- | --- | --- |
| Claude Code | Adapter `--cli` | Prefer a more specific terminal method if the adapter advertises one |
| Codex | Bundled `codex login --device-auth` | API key and ACP device-code remain available |
| Hermes | `hermes acp --setup` | Replaces the `hermes-setup` terminal method stripped by the SDK |
| Kimi Code | `kimi login` | RFC 8628 device-code flow |
| Gemini CLI | `gemini --skip-trust` + `NO_BROWSER=true` | Select Google/Vertex/gateway in the terminal; enter the Gemini API key in the GUI |
| OpenClaw | `openclaw onboard --tui` | Validates provider authentication and gateway configuration together |
| OpenCode | `opencode auth login` | Login with provider selection |
| Cursor CLI | `agent login` + `NO_OPEN_BROWSER=1` | Replaces the `cursor_login` instructional method with terminal auth |

### Capabilities and compatibility boundaries

- The client advertises only `auth.terminal`, `elicitation.url`, and `_meta["terminal-auth"]` for compatibility. It continues not to advertise `fs`, preserving
  CLI Read, Write, and Edit parity under ADR 0044.
- Receive URL elicitation methods unknown to the current direct SDK dependency, 0.14, through the ACP extension method channel. Do not upgrade the entire SDK and migrate the
  model and mode contracts at the same time. Handle a later SDK migration through a separate decision and regression validation.
- For runtimes whose modern terminal auth `type` and `args` cannot be preserved by SDK 0.14, substitute the corresponding method ID in the
  registry. If no ACP method normalizes to terminal auth, append one common recovery method.

### Verified upstream contracts

- For ACP terminal auth, the client runs a separate interactive process
  and reinitializes the ACP connection after it exits: [ACP Authentication](https://agentclientprotocol.com/protocol/v1/authentication)
- Gemini's official ACP entry point is `gemini --acp`, and authentication supports
  Google login, Gemini API key, Vertex AI, and
  other options: [ACP mode](https://geminicli.com/docs/cli/acp-mode/), [Authentication](https://geminicli.com/docs/get-started/authentication/)
- Each CLI's login
  entry point follows its provider's
  documentation: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Kimi
  CLI](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-command.md), [OpenCode
  CLI](https://opencode.ai/docs/cli/), [OpenClaw onboard](https://docs.openclaw.ai/cli/onboard),
  [Cursor authentication](https://docs.cursor.com/en/cli/reference/authentication)

## Rationale

- Responsibility for issuing, refreshing, and storing authentication tokens remains with each CLI/ACP adapter, so provider-specific implementations are not duplicated in Mew.
- Requiring an explicit click from the connected user instead of automatically launching a server browser makes the login location clear even in remote deployments.
- Restricting terminal commands to specs advertised by the server or declared in the registry preserves the existing owner/manager shell boundary
  without creating an HTTP command injection surface.

## Results

- For all 8 registered runtimes that are unauthenticated immediately after installation, users can log in, complete initial setup, and start a new session within the
  agent tab. They do not need to leave for a separate server terminal even if ACP cannot start before authentication.
- Long-term credentials remain in each CLI's existing storage. Mew does not persist API keys entered by users.
