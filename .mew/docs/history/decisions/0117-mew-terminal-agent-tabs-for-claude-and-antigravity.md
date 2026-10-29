---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Claude Code and Antigravity run as tmux TUIs in agent tabs. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0117 — Claude Code and Antigravity run as tmux TUIs in agent tabs"
created: 2026-09-07
updated: 2026-09-11
---

- Date: 2026-09-07
- Status: Adopted
- Follow-up decision: [0119](0119-mew-unified-terminal-agent-panel.md) — Separate terminal panel and placement of normal shell tabs
- Follow-up decision: [0142](0142-mew-claude-acp-and-cli-authentication.md) — Restore interactive ACP for Claude and official CLI authentication; retain the Antigravity and Gemini scope
- Follow-up decision: [0143](0143-mew-antigravity-official-acp.md) — Switch Antigravity to official ACP; retain the Gemini removal boundary
- Partially supersedes: [0034](0034-mew-agent-panel-acp-reintroduction.md) — Exclude Claude Code and Antigravity from the requirement that all agent windows use an ACP chat UI
- Partially supersedes: [0060](0060-mew-shared-agent-runtime-registry.md) — Expand the execution surface of interactive agent tabs from ACP alone to `acp | terminal`
- Partially supersedes: [0061](0061-mew-claude-acp-official-org-migration.md) — Claude Code interactive tabs run the official CLI directly instead of the ACP adapter; retain ACP execution for scheduled jobs
- Partially supersedes: [0116](0116-mew-oauth-agent-logins-use-external-browser.md) — Remove Claude's separate browser authentication job and place authentication within the official TUI; remove Gemini's personal OAuth path along with the runtime
- Decision makers: Song Sanghun (direction), Codex (design and implementation)

## Background

Starting 2026-06-18, Google discontinued Gemini CLI requests from personal, AI Pro, and Ultra accounts and moved the personal terminal
experience to Antigravity CLI. Mew's Gemini runtime offered the discontinued `oauth-personal` path as the default login, so even successful browser
authorization ended in an end-of-support error. Enterprise, Google Cloud, and API key usage remained available, but there is
no concrete demand within Mew's current personal-use operating scope.

Claude Code and Antigravity are themselves official interactive TUI products. Recreating them in a third-party ACP chat view requires continually translating
the official CLIs' sessions, slash commands, authentication, and new features. Third-party ACP connections for Antigravity are not adopted
as part of the current product boundary; only direct use of the official `agy` TUI in a terminal is supported.

The official basis is the installation and execution contracts in [Gemini CLI personal
account discontinuation](https://github.com/google-gemini/gemini-cli/discussions/28017) and [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli).

## Options

1. Keep Gemini for Enterprise/API key use only and connect Claude and Antigravity through ACP — Current personal users would continue to see a dead Gemini path, and a separate UI would have to keep up with official TUI features.
2. Run Claude and Antigravity manually only in the normal terminal panel — The policy is safe, but separates them from agent selection and tab restoration.
3. Split agent tab execution surfaces by runtime and run both official CLIs directly in dedicated tmux sessions — Preserves the agent entry point without modifying the TUI.

## Decision

Adopt option 3.

- Remove Gemini CLI from the server and client runtime registries, installation and authentication UI, and documentation. Mew
  does not arbitrarily delete an already globally installed `gemini` binary or user credentials. Do not reintroduce it until an actual need
  for Enterprise/API key support arises.
- The interactive surface for `claude` and the new `antigravity` runtime is `terminal`. Opening an agent tab creates a dedicated tmux session for that
  tab in the cwd and runs the official `claude` and `agy` commands, respectively.
- The tab body for terminal runtimes uses the existing `TmuxTerminal` from `@mew/tmux-term` as-is. It does not overlay a separate chat toolbar, message bubbles, model or permission
  selectors, or authentication center. Display, input, mobile keys, scrolling, and reconnection therefore behave
  the same as in regular terminal tabs.
- Closing an agent tab terminates its tmux session and CLI. Closing only the agent panel or disconnecting the browser leaves
  tmux running, and reopening the same saved tab reconnects to it.
- The server generates dedicated session names from the runtime and tab id and hides them from the regular terminal tab list. The browser does not
  determine execution commands or session names; the start API uses only fixed commands from the registry and a validated cwd.
- For Antigravity, register only the official installation script and `agy`. Do not advertise it as an ACP spawn spec, agent set, or scheduled
  execution target.
- Claude's interactive tabs use the official TUI, while the existing one-shot ACP runner for scheduled jobs is retained. This decision
  changes the tab surface operated by humans; it does not also replace the unattended job protocol.
- Existing Gemini tabs saved in the account or browser are removed during restoration. Past ACP session files for those tabs are not automatically
  deleted.

## Rationale

tmux provides the actual TTY, persistent sessions, and keyboard input that both official CLIs expect. Reusing the existing terminal renderer means
Mew does not have to reimplement protocols and screens when the CLIs change their models, commands, or login flows. Dedicated session
creation also preserves the existing security boundary, which accepts no commands over HTTP other than a runtime ID.

Mew does not uninstall Gemini globally because users may have installed it separately for Enterprise/API key use, and removing
a Mew runtime does not authorize deleting tools or credentials in the user's home directory.

## Results

- Claude and Antigravity tabs do not provide ACP history, scheduled messages, or agent set presets. They use each official TUI's
  own sessions and commands.
- The executable and additional arguments in Claude's runtime settings apply to the interactive CLI. The fixed execution contract for the ACP adapter used
  by scheduled tasks is maintained separately.
- Extending terminal-only runtimes to unattended scheduled tasks requires reviewing the official headless contract, authentication, and exit conditions, then
  writing a separate decision.
