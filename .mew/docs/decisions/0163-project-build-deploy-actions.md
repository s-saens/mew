---
title: "Project build and deployment actions"
description: "Accepts editable outcome-based Build and Deploy actions alongside command buttons, conservative nonblocking discovery, exit-based results, and a default project-setting skill. ADR 0164 extends output discovery while retaining the Mew Port removal."
created: "2026-11-11"
updated: "2026-11-11"
---

## Status

Accepted for implementation. No deployment, launcher execution, or server lifecycle operation is authorized by this decision.

## Context

Command buttons require users to understand commands and terminal sessions. Builds and deployments need named variants, reliable completion or failure, and direct access to an application or generated file. Setup must work for existing projects and must not become a prerequisite that blocks creating or changing a project.

## Decision

Add Build and Deploy controls alongside existing command buttons. Store stable action IDs, kinds, variants, commands, and optional result URLs and artifact patterns in `.mew/project-actions.json`. Keep the legacy command file and terminal execution behavior independent.

Discover only commands supported by project evidence. Offer read-only defaults when no configuration exists, and merge discoveries only on explicit persistence. Preserve custom edits and explicit empty configurations. Unsupported or damaged configuration exposes a warning and project-bound agent assistance; it does not gate project operations.

Run finite action processes with recorded exit codes and bounded output. Resolve commands on the server by action ID, pin the actual project root, and authorize all result reads. Successful runs expose validated artifact downloads and optional navigation through the existing host Browser. [ADR 0164](0164-build-result-files.md) extends this with conservative output discovery and complete ZIP downloads. This extends result entry without superseding [ADR 0160](0160-remove-mew-port.md): no port proxy, listener discovery, or automatic localhost interception returns.

Register `mew-project-setting` through the existing managed default skill library. It configures essential Mew actions and documentation from the user's concept and defaults to TDD. User requirements and other skills can replace concrete nonessential guidance. Normal disablement, removal, restoration, and project overrides remain effective, including in generated setup prompts.

## Alternatives and rationale

Extending legacy command sessions alone would retain ambiguous completion and mix persistent interactive sessions with finite build results. Replacing command buttons would discard useful custom workflows. Requiring a generic deployment platform or a successful setup transaction would invent project assumptions and block otherwise valid work. The separate action contract supports useful defaults and explicit customization without those dependencies.

## Consequences

The UI can present an outcome without exposing commands during ordinary use. Users and agents share a versioned project-owned configuration. Discovery remains intentionally incomplete; unknown frameworks and deployment targets require agent investigation or manual settings. Run history is bounded and process-local, so durable jobs, detached development-server supervision, and background push remain outside this implementation. The [feature contract](../features/terminals-agents-automation/project-build-deploy-actions.md) owns API and behavior details; the [work record](../work/project-build-deploy-actions.md) owns verification.
