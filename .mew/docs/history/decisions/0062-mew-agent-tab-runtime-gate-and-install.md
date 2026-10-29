---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Mew agent tabs start a session only after a runtime is selected. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0062 — Mew agent tabs start a session only after a runtime is selected"
created: 2026-08-20
updated: 2026-09-11
---

- Date: 2026-08-20
- Status: Adopted
- Subsequent decision: [0074](0074-mew-agent-header-runtime-switch.md) — Prohibit runtime changes within a tab
- Subsequent decision: [0096](0096-mew-agent-tabs-created-after-selection.md) — Create an unselected tab before selection
- Subsequent decision: [0101](0101-mew-runtime-lifecycle-controls.md) — The lifecycle UI that previously offered installation only
- Decision maker: Song Sanghoon (directive)
- Related: [ADR 0046](0046-mew-agent-panel-tabs-one-session-per-tab.md), [ADR 0060](0060-mew-shared-agent-runtime-registry.md)

## Background

An empty tab under ADR 0046 immediately launches the last-used runtime and shows its history. A child process starts even though
no runtime was selected when the tab was created, and an uninstalled runtime is revealed only by a handshake
failure after selection. Closing all tabs immediately creates another empty tab, so a state with “0 tabs” cannot be
represented either.

## Decision

### 1. Treat 0 tabs and a tab with no runtime selected as separate states

- Closing the last tab leaves 0 tabs. Only the `새 탭` button in the center of the panel remains.
- A new tab created with `+` or the center button has no `runtime` value. It displays the runtime list first.
- Before a runtime is selected, there is no WS connection, ACP child process, history query, or input field.
- The runtime is a tab property and is persisted alongside it in `mew:agent-tabs`. Legacy tabs are promoted once using `mew:agent-runtime` to preserve existing
  conversation connections.

This decision replaces ADR 0046's rules to “immediately create an empty tab when the last tab is closed” and “switch runtimes
within a tab.” The rules that one tab equals one session and closing a tab ends its session remain in place.

### 2. The server runtime registry handles installation detection and installation

- `server/agentRuntimes.ts` contains executable detection and fixed installation commands alongside the spawn specs. Commands are not duplicated
  in the UI.
- Only managers and owners can use the installation API. These roles already have access to terminals and unattended shells.
- Requests accept only a runtime ID, with no commands, arguments, or URLs. Only official installation paths fixed in the registry are
  executed.
- As soon as installation finishes, the executable is checked again. The corresponding tile changes to the `사용` state without a refresh.

## Results

- A new tab does not create a process before the user specifies which agent to use.
- Installation failures remain on the runtime selection screen along with the tail of the output. Successful installation does not mean login
  or credential setup is complete; the runtime's authentication flow may continue in the first session.
