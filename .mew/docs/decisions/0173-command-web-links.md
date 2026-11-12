---
title: "Open web addresses reported by project commands"
description: "Adds project-scoped links to local web addresses reported by running command sessions, using the existing host Browser without restoring Mew Port or host-wide listener discovery."
created: "2026-11-12"
updated: "2026-11-12"
---

## Status

Accepted. Extends [ADR 0160](0160-remove-mew-port.md) only with command-output links; its removal of the port proxy, listener discovery, and separate preview permission remains in force.

## Context

A web development command commonly prints a local address when it starts. Users need a direct way to open that address from the project command menu, without learning ports or copying terminal output. Mew's host Browser already provides an independently authorized navigation path.

## Decision

Inspect bounded recent output from each running project command session for supported local HTTP(S) addresses. Offer the extracted addresses alongside that command and open a selection in the existing host Browser, subject to its permission and navigation guards. Do not infer an address from a package script or claim that a reported address is reachable. Capture failure must not prevent command use.

The [command contract](../features/terminals-agents-automation/project-command-buttons.md) owns details, including scope and limitations; the [work record](../work/project-delivery-pipelines.md) records local verification.

## Alternatives and rationale

Restoring host-wide port scanning or the former Mew Port proxy adds a separate discovery or routing boundary and can attribute another project's listener to this command. Requiring every project to configure a URL manually leaves a common development path undiscoverable. The session's output supplies project-scoped evidence while leaving actual connection and authorization to the existing Browser.

## Consequences

Commands that do not print a supported local URL cannot be detected this way. A session can retain old output after a process exits, and an advertised address does not prove that a web server is ready or still running. Browser permission and Mew's own blocked ports continue to apply. Applying the server change to a running instance requires a user-owned restart.
