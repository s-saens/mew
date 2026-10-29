---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Switch a tab's runtime using the agent window header icon. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0074 — Switch a tab's runtime using the agent window header icon"
created: 2026-08-22
updated: 2026-08-22
---

- Date: 2026-08-22
- Status: Adopted
- Partially supersedes: [0062](0062-mew-agent-tab-runtime-gate-and-install.md) — Lifts the prohibition on "switching runtimes within a tab." Retains the gate that starts a session in a new tab only after a runtime is selected
- Decision maker: Song Sanghoon (directive)
- Related: [ADR 0046](0046-mew-agent-panel-tabs-one-session-per-tab.md), [ADR 0060](0060-mew-shared-agent-runtime-registry.md)

## Background

With 0062 blocking runtime switching within a tab, users "must open a new tab to switch to another agent." But because each
tab is a session, new tabs keep accumulating alongside the ongoing conversation. This wasted many tabs for users continuing
questions on the same topic across agents.

## Decision

- The runtime icon at the far left of the session window header is a **button**. Clicking
  it opens a dropdown using the same registry and installation flow as the new-tab runtime list (`RuntimePicker`), with icons,
  names, installation status, and `사용`/`설치` buttons. Fetch the list again through `GET /api/agent-runtimes` each time it opens.
- Choosing another runtime from the dropdown **changes that tab's `runtime`** without creating a new tab. The WS connection
  effect reruns because it depends on `runtime` and connects to a new session, while the old session remains in the server supervisor
  process (ADR 0048; it can be revisited through rewind). Clear the conversation rendered so far from the screen.
- Installation also happens within the dropdown, using the same fixed installation command path in the server registry from 0062. Switch to
  that runtime when installation finishes.
- New tabs still do not create a WS connection or process before a runtime is selected (retains 0062 §1).

## Rationale

Reenable switching while preserving "one tab = one session" (0046). Unlike tab creation, switching happens only when the user explicitly
clicks, so the problem 0062 sought to prevent—"creating a tab automatically starts a process"—does not recur. The
0060 boundary that assigns the registry and installation detection to the server also remains unchanged.

## Results

- The header icon's `title` says "Agent: X — Click to switch."
- Immediately after switching, the model and permission mode selectors wait for the new session's `models` and `modes`
  events. If saved defaults exist (ADR 0063), the server applies them automatically after `session/new`.
