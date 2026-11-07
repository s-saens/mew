---
title: "Close host listener processes from the port picker"
description: "Requires localhost-app and terminal permissions for process shutdown from port rows. Records server-resolved listener ownership, process identity and Mew protection, confirmation, bounded termination, and operational limits."
created: "2026-11-07"
updated: "2026-11-07"
status: accepted
---

## Context

The port picker discovers services independently of Mew command sessions. Users need to stop these services from their rows. Removing a row or closing its preview does not stop the listener, and one process can own several ports. Localhost-app access alone currently grants viewing and proxy access, without authority to terminate host processes.

## Decision

Add **Close port** to app-row context menus and require both `portPreview` and `terminal`. The shared menu supports mouse, touch, and keyboard access. Confirm the process-wide effect before sending `POST /api/dom-browser/ports/:port/close`.

Resolve the live listener owner on the server using OS socket/process metadata. Accept only a port number. Recheck permissions, listener ownership, process identity, and protected ports before each signal. Protect PID 1, Mew, its ancestors, and any process that also owns a protected port. Reject incomplete ownership. Request SIGTERM without forced escalation, bound discovery and completion checks, and refresh actual listeners after every result. Windows uses Node's immediate process termination semantics.

## Alternatives and rationale

| Alternative | Reason for the choice |
| --- | --- |
| Hide the row or close only its preview | Leaves the requested service listening. |
| Stop only Mew command sessions | Excludes independently started services already shown in the picker. |
| Grant shutdown through `portPreview` alone | Widens a viewing capability into host-process authority. Existing terminal permission matches this authority. |
| Accept a PID from the browser | Makes stale UI metadata authoritative and permits arbitrary process targets. |
| Escalate automatically to SIGKILL | Bypasses application cleanup. Report the remaining listener and let the user investigate. |

## Consequences

Stopping a process can close its other ports and interrupt other users. Confirmation names that scope; the action is governed by the server OS user's permissions rather than project file ACLs. Supervisors may restart a service, and independent forwarding rules remain configured. A signal already sent cannot be undone by cancellation or a later permission change. A failure may follow partial termination, so the refreshed list remains authoritative.

The new API requires user application to the running Mew server. Isolated tests and a UI build do not establish physical-device, external-network, or actual macOS/Windows termination behavior. The [port shutdown contract](../development/port-preview.md#close-a-listening-port) owns the API details; the [work record](../work/localhost-browser-port-picker.md#2026-11-07--close-listener-processes-from-the-port-list) records actual verification and the separately authorized browser-lab shutdown.
