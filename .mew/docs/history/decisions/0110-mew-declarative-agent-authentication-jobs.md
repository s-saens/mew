---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Unify mew agent authentication as declarative jobs in the registry. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning documents for the current contract."
title: "0110 — Unify mew agent authentication as declarative jobs in the registry"
created: 2026-09-04
updated: 2026-09-11
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0116](0116-mew-oauth-agent-logins-use-external-browser.md) — Claude and Gemini authentication placement
- Follow-up decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Separate Claude authentication and Gemini runtime
- Follow-up decision: [0121](0121-mew-codex-oauth-through-scoped-server-browser.md) — Codex device-code command
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Reserve an external tab for browser authentication
- Partially supersedes: [0072](0072-mew-agent-gui-authentication.md) — Expand one terminal auth per runtime into authentication jobs with multiple fixed methods and execution surfaces
- Partially supersedes: [0109](0109-mew-agent-authentication-and-loopback-browser.md) — Correct the generalization of Gemini headless authentication as device-code authentication, and limit automatic browser handoff to CLIs that directly output URLs
- Decision makers: Song Sanghun (direction), Codex (design and implementation)

## Background

Mew gained a path for opening Kimi Code's device-code URL in an external browser, but surface selection and the URL allowlist
were hardcoded in a `kimi` branch and a single `browserLogin`. Adding similar support for Codex and Cursor required updating the UI, API, and runtime table
together each time, and multiple login methods for one runtime, such as Kimi's `.com` and `.ai` alternatives, also required
separate UI. Failures showed only an exit code, losing provider output that explained retryable failures.

In practice, however, runtimes have two types of authentication contracts.

- Codex, Kimi, and Cursor: A fixed CLI outputs an HTTPS URL and polls for browser approval.
- Claude, Hermes, Gemini, OpenClaw, OpenCode, and Prime: these interactive flows require selecting an account, provider, key, or model, or pasting
  a code first, so they need a full terminal. The official Gemini documentation says to use an API key or Vertex AI environment
  credentials for initial headless authentication.

## Options

1. Continue branching by runtime name in the client — fast, but every additional method and output change requires a UI change.
2. Have Mew implement provider OAuth clients and token stores — unnecessarily takes on responsibility for token ownership, refresh, and revocation.
3. Have the runtime registry declare fixed commands and the `browser | terminal` surface, with shared authentication jobs relaying status.

## Decision

Adopt option 3.

### Declarative authentication methods

- `RuntimeAuthentication.methods()` returns multiple fixed methods for a runtime. Each method has an id, name, description,
  server-only spawn spec, `browser | terminal` surface, and an HTTPS host allowlist when the surface is browser.
- Only the id, name, description, and surface are sent to the browser. Commands, arguments, environment variables, and host allowlists remain on the server,
  and arbitrary commands or URLs are not accepted through HTTP requests.
- When ACP has initialized, its advertised agent/API-key/terminal methods take priority. If terminal information is lost or ACP itself exits
  before authentication, all registry methods are shown as recovery paths.
- Methods that advertise the same authentication through both ACP and a separate CLI, or whose execution information
  is lost by an older SDK, are replaced with a single registry job using `replaceMethodIds`. Codex `chat-gpt-device-code`, Kimi `login`, Cursor
  `cursor_login`, and Hermes `hermes-setup` use this path.

### Shared authentication jobs

- The job key is a hash of the runtime, tab, and method id, and the job uses a tmux session and a state file with 0600 permissions. Retrying a completed
  session discards the existing pane and expired URL and creates a new job.
- The browser surface reserves a blank top-level tab immediately on click, then navigates that tab when a URL that passes the allowlist appears in CLI output. If
  a one-time code is provided separately, Mew displays it as well, but does not store it on disk, in events, or in transcripts.
- The terminal surface opens the existing Mew tmux popup, preserving provider selection, secret entry, and manual code pasting.
- On failure, display the exit code and the last error line from the CLI. Send it over HTTP only after removing URLs, token/key/secret/code patterns,
  and one-time codes, and limiting its length.
- On exit 0, close tmux and reinitialize ACP. Do not automatically restart on failure or interruption.

### Runtime placement

| Runtime | Mew surface | Official CLI contract |
| --- | --- | --- |
| Codex | browser | `codex login --device-auth`, `auth.openai.com` |
| Kimi Code | 2 browser methods | `kimi login` (`.com`), `kimi login --region global` (`.ai`) |
| Cursor CLI | browser | `agent login` + `NO_OPEN_BROWSER=1`, `cursor.com` |
| Claude Code | terminal | ACP adapter `--cli`; preserves subscription/Console selection and manual code |
| Hermes | terminal | `hermes acp --setup`; provider, OAuth, API key, and model selection |
| Gemini CLI | terminal | `gemini --skip-trust`; Google/API key/Vertex selection; initial headless authentication uses the env contract |
| OpenClaw | terminal | `openclaw onboard --tui`; provider authentication and live completion verification |
| OpenCode | terminal | `opencode auth login`; provider selection flow |
| Prime Agent | terminal | TUI `/login`; provider selection flow |

## Rationale

As long as the provider CLI continues to own token issuance, refresh, and storage, Mew handles only state orchestration.
Selecting the surface through method metadata rather than the runtime name means new runtimes, regions, and authentication methods
need only be added to the registry. The security boundary remains owner/manager access, fixed commands, HTTPS host allowlists, and no persistence of secrets.

## Results

- The UI has no knowledge of runtime names and opens an external browser or Mew terminal using only `surface`.
- For Codex, Kimi, and Cursor, link preparation, external browser navigation, completion detection, and ACP reconnection become a single flow.
- Interactive runtimes use the same authentication job status while preserving their official selection and input UX.
- New browser-based authentication must register a fixed command and a minimal host allowlist and add output parser regression tests.
