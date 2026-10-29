---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: OAuth agent login in mew prioritizes an external browser. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0116 — OAuth agent login in mew prioritizes an external browser"
created: 2026-09-05
updated: 2026-09-11
---

- Date: 2026-09-05
- Status: Adopted
- Follow-up decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Separate browser authentication for Claude and the Gemini runtime
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — OAuth external device tab; retain CLI token ownership and no secret storage
- Partially supersedes: [0110](0110-mew-declarative-agent-authentication-jobs.md) — Replace the arrangement that fixes Claude Code and Gemini CLI to the terminal surface with an external browser and one-time code return flow.
- Decision makers: Song Sanghun (direction), Codex (design and implementation)

## Background

[ADR 0110](0110-mew-declarative-agent-authentication-jobs.md) classified only Codex, Kimi, and Cursor, which output URLs directly, as browser-based, leaving Claude
Code and Gemini CLI terminal-based. However, Claude Code now allows account type selection
in the command through `claude auth login --claudeai|--console`, and Gemini CLI provides a Google OAuth URL and manual authorization
code input with `NO_BROWSER=true`. Both flows can skip the provider-selection TUI, so there
is no need to expose the entire Mew terminal for login.

After authentication completes, Gemini CLI's manual OAuth flow enters the regular TUI without terminating the process. Therefore, waiting only for the command's exit
code prevents the agent connection from resuming even after authentication has completed.

## Options

1. Keep Claude and Gemini on terminal — Preserves the implementation, but the UX for the same OAuth task differs by runtime.
2. Have Mew directly implement the provider OAuth client and token exchange — Duplicates the provider CLI's token responsibilities and security boundaries.
3. Run the provider CLI as a fixed browser job and return an authorization code to the running TTY only when needed.

## Decision

Adopt option 3.

- Declare Claude subscriptions, Anthropic Console, Codex, Gemini Google, Kimi `.com` and `.ai`, and Cursor OAuth as browser surfaces. Clicking opens
  a regular top-level browser on the connected device; neither Mew's internal browser nor an iframe is used.
- For Claude, directly run the official CLI bundled by the adapter with `--cli auth login --claudeai` or `--cli auth login --console`. For
  Gemini, select only `oauth-personal` through a separate system settings file and run manual
  authorization with `NO_BROWSER=true`.
- For Claude and Gemini, whose provider pages display authorization codes, provide a password-style input field in the authentication
  center. The server verifies that the request is from an owner or manager, that it targets a browser job in the registry, and that the method declares
  code input, then passes a single line of up to 4096 characters with no control characters to the tmux pane as literal input and sends Enter.
- Do not store authorization codes in state files, logs, agent events, or transcripts. Send only the fixed method id and whether input is required
  to the browser; execution commands, allowlists, and completion file paths remain on the server.
- Gemini uses changes to the default credential file `~/.gemini/oauth_creds.json` before and after the authentication job starts as the completion signal. It does not read
  the file contents. Once a change is confirmed, it closes the remaining TUI tmux session and calls authenticate with
  the registry-fixed `oauth-personal` on the already running ACP. ACP verifies the cached credentials, records the selected method in user settings, and creates
  a session on the same connection. The method id sent by the browser is not used directly as the ACP id.
- The shared configuration entry points for Hermes, OpenClaw, OpenCode, and Prime retain the
  terminal surface, since a runtime login is not fixed to a specific OAuth flow and provider, key, and model selection comes first. Non-OAuth methods such as API key,
  Vertex, and gateway also retain their existing ACP/UI paths.
- browser URLs must pass a minimal per-runtime HTTPS host allowlist. Claude
  allows only `claude.com` and `platform.claude.com`; Gemini allows only `accounts.google.com`.

The official contracts are based on [Claude Code authentication](https://docs.anthropic.com/en/docs/claude-code/getting-started),
[Gemini CLI authentication](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx), and
[Codex authentication](https://learn.chatgpt.com/docs/auth).

## Rationale

Mew does not own the OAuth client or refresh token exchange and uses the provider CLI's authentication implementation as-is. At the same time, users do not need to
leave the agent conversation view to operate a terminal TUI. The code submission API accepts no arbitrary commands and passes a single line
only to an already running, fixed authentication job, so it does not expand the existing owner and manager shell boundary.

## Results

- All registered runtimes whose OAuth type can be determined in the command use the same external browser UX.
- Gemini authentication completion is also detected through credential file changes, rather than CLI termination alone. Separate operational configurations that
  do not use the default file, such as encrypted credential storage, may require a terminal fallback because the CLI does not exit on its own.
- Because Gemini's ACP authentication confirmation step also updates user settings, subsequent sessions select Google OAuth, while
  ACP's API key, Vertex, and gateway methods remain separate options.
