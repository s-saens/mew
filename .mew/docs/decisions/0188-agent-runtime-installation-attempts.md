---
title: "Acknowledge runtime installation attempts before execution completes"
description: "Accepts background runtime installation with an attempt-specific status API and retained read-only output. Records transport deadlines, compatible synchronous calls, and the distinction between installation output and existing update sessions."
created: "2026-11-18"
updated: "2026-11-18"
---

# Acknowledge runtime installation attempts before execution completes

Status: Accepted.

## Context

The agent panel starts fixed host commands to install runtimes. A remote browser could time out after 30 seconds while the installer ran for up to ten minutes. The picker could report a failure even if the executable became available later. The user also needs to open the output while an attempt is running and inspect its result afterward.

## Decision

Return an attempt ID as soon as the server accepts a background installation. The client reads progress and the outcome for that ID. Retain the latest attempt per runtime and keep the existing synchronous response for callers that request it. The runtime picker opens a read-only terminal output popup for installation and attaches to the existing update session for updates. Apply the existing agent and terminal permissions to their respective output paths.

## Alternatives and rationale

Extending each transport deadline would hold a request open for the full installation and still lose its response on disconnect. Running installers in interactive sessions would require terminal access for a path already supported by agent permission. Short status requests and a read-only output view address the browser timeout using the existing installation state.

## Consequences

Closing the popup leaves the installation running, and reopening the picker can recover its latest output. Starting a new attempt replaces the previous attempt for that runtime. Installation state is held in server memory. Update sessions retain their existing lifecycle and access rules. The [runtime feature contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) owns the current behavior.
