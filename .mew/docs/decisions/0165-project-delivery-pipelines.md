---
title: "Outcome-oriented project delivery pipelines"
description: "Accepts a results-and-publishing UI backed by durable sequential pipelines and scoped external CI/CD adapters. Records credential ownership, explicit dispatch, uncertain-run recovery, and boundaries for future runners and triggers."
created: "2026-11-11"
updated: "2026-11-11"
---

## Status

Accepted for implementation. Extends [ADR 0163](0163-project-build-deploy-actions.md) and [ADR 0164](0164-build-result-files.md). Preserves [ADR 0160](0160-remove-mew-port.md).

## Context

Named build/deploy commands and downloads help users perform individual actions, but people unfamiliar with development still need to discover how to inspect or publish their project. A visual pipeline also needs actual execution records and vendor status rather than decorative progress over a shell command.

## Decision

Present results and publishing as project outcomes. Back them with editable, ordered pipelines referencing existing actions or typed provider connections. Keep detailed commands and connection fields in settings. Review the destination before dispatching a publish operation, retain exact remote execution IDs, and preserve bounded run history in private installation data.

Snapshot the chosen configuration, reserve the project during execution, stop after failed or uncertain work, and preserve interrupted history without automatic replay. Bind encrypted external credentials to account and project; do not add tokens to shared project files or return them in state. Use GitHub Actions, Git-connected Cloudflare Pages, and Google Cloud Build as the initial adapters.

The [delivery design](../development/project-delivery.md) owns the architecture, user flow, acceptance criteria, and staged capability boundaries. Existing actions remain separately usable. This decision does not restore automatic port exposure or promise static app execution.

## Alternatives and rationale

A full Jenkins-compatible runner and graph editor would expose infrastructure choices before users can inspect their work. A provider-only dashboard would not cover local APK builds or existing commands. Decorating single-command logs would lack durable orchestration and honest external status. Sequential pipelines over reusable local actions and remote adapters provide a concrete path from existing features to reliable publishing.

MCP-only deployment would depend on the tools and conversational execution available in a session. Typed adapters give repeatable dispatch and explicit status contracts while agents and MCP remain available for setup and investigation.

## Consequences

The common screen can stay small while providers evolve independently. Local execution still uses the trusted host working folder, and remote execution requires provider-specific authorization. Full OAuth onboarding, automated Git/webhook triggers, parallel graphs, isolated runners, and static previews remain separately scoped work. Failed or ambiguous dispatch requires user recovery; a reconnect cannot repeat a release.
