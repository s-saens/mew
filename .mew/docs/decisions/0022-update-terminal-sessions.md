---
title: "0022 — Run Updates in Preserved Terminal Sessions"
description: "Decision to run Mew, agent, and tool updates in dedicated tmux sessions and reopen output and completion results through the existing terminal popup. Separates the lifetimes of Mew restarts and browser connections while retaining existing update policies."
created: 2026-10-19
updated: 2026-10-19
---

# 0022 — Run Updates in Preserved Terminal Sessions

Status: Accepted.

## Background

Running updates from the update screen makes step-by-step output difficult to inspect, and restarting Mew disconnects the browser. Users must be able to inspect running output and results after a restart in the same session, as with project command buttons or manually opened terminals.

## Decision

1. Run Mew, standalone agent CLI, and system tool updates in dedicated tmux sessions. Provide Run and View Session actions for each item and reuse the existing terminal popup. Individual updates use per-item sessions; batch execution of system tools uses one session shared by the entire queue.
2. Continue updates even when the screen or popup is closed. Preserve sessions so output can be viewed again after success or failure.
3. Mew update jobs and terminal sessions survive Mew server restarts. Open the same session after the browser reconnects. After confirming success, the user applies the new screen in the browser with the Refresh button; do not refresh automatically.
4. Retain individual agent updates and blocking while agents are running, sequential system tool execution, running Mew after dependency tasks succeed, restarting after a successful build, and the operational boundaries of the prebuilt CLI.

## Rationale and Impact

Apply the familiar run and output inspection behavior of command buttons to updates as well. Separating browser connections from job lifetimes allows users to inspect results and failure causes even after a server restart. [App Updates and Operational Entry Points](../features/appearance-accounts-operations/application-updates-and-operations.md) owns the specific current contract for session storage, rerunning, restoration, and refreshing.
