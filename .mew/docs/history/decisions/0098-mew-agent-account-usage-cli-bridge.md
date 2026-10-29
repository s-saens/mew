---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew relays CLI account usage as read-only information. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0098 — mew relays CLI account usage as read-only information"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Superseded by: 0104
- Supersession confirmed: 2026-09-11 — [0104](0104-mew-agent-account-usage-dashboard-link.md). Superseded by the decision to remove temporary CLI queries and the raw-output API. Current account queries follow 0130.
- Decision makers: Song Sanghun (direction), Codex (implementation)
- Related: [0072](0072-mew-agent-gui-authentication.md), [0097](0097-mew-agent-panel-removes-cwd-bar.md)

## Background

Session Info in the agent window shows only the tokens used in the current tab and their equivalent API cost. When using Codex and Claude Code with
a subscription login, users had to check the actual account's remaining limits, reset times, and credits separately on the CLI's status screen.

If Mew reads provider tokens or private CLI session files, it violates the credential ownership boundary in 0072; integrating the OpenAI organization
Usage API would also require storing a new admin API key.

## Options

1. Keep only session token information.
2. Parse local authentication stores and session files.
3. Run a fixed status command in the logged-in CLI in a short-lived terminal and relay only the screen text.
4. Have Mew store provider API keys and call the organization usage API directly.

## Decision

Adopt option 3.

- In the Info popup, users click `/status` for Codex or `/usage` for Claude Code to query usage.
- The server runs only the executables, environments, and slash commands declared in the runtime registry. Browser requests contain only a runtime id and
  cannot send commands, arguments, account information, or API keys.
- The server opens a temporary tmux session, captures its output with limits on control characters and length, and immediately terminates the session. Results are displayed
  only in the browser and are not stored in Mew data, events, or logs.
- To prevent an update notice on the CLI startup screen from blocking the query, send `Esc` before the status command **only in this temporary query session**.
  Update checking and installation policies for normal agent sessions remain unchanged.
- If the CLI does not provide a noninteractive status command or is not logged in, show an error; do not bypass this by parsing authentication files.
- Organization API usage and costs remain a separate feature requiring an admin key and a retention policy. This feature relays only the subscription limits and
  credits that the connected CLI account displays on its own screen.

## Results

Account usage is not confused with current session costs, and Mew does not become a new owner of long-lived credentials or provider billing data.
