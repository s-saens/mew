---
title: "Treat Build and Deploy selections as request authorization"
description: "Makes composer Build/Deploy selections explicit instructions for the current request, overriding older saved build/deploy requirements and prohibitions while preserving source files, verification, target/credential checks, and separate server lifecycle limits."
created: "2026-11-11"
updated: "2026-11-11"
---

# Treat Build and Deploy selections as request authorization

Status: Accepted. Supersedes the execution-priority portion of [ADR 0153](0153-agent-composer-execution.md), the unconditional project build requirement in [ADR 0104](0104-required-agent-build-verification.md), and the agent deployment prohibition retained by [ADR 0167](0167-homepage-and-mewlink-subdomain.md). Existing UI placement, snapshots, source preservation, verification reporting, and origin/security decisions remain in force.

## Context

The user enabled Deploy while requesting the public homepage, but the generated context said the selection could not override project deployment bans. This repository also repeated an unconditional ban in AGENTS, additional project guidance, README, and execution documentation. The agent therefore prepared the homepage without publishing it. Build off had the same priority problem: it suppressed the Mew default while still requiring a saved project build.

The user explicitly requested correcting both choices, updating the conflicting instructions, and deploying the completed homepage.

## Decision

Treat the message's captured Build/Deploy values as explicit user instructions for that request. Deliver them after saved project guidance and state that they override older saved requirements or prohibitions for the corresponding operations. A latest explicit user request takes precedence. Keep this scoped to build/deploy; it does not override higher-priority runtime restrictions or unrelated project contracts.

- Build on runs the documented project build after implementation changes, retaining recognized command, scope, and failure-handling details. Build off skips the project build despite an older requirement and omits the generated verification block from effective context.
- Deploy on authorizes the task's documented deployment after applicable checks, using the verified destination and available credentials. Do not ask again merely because older saved guidance prohibited deployment. Deploy off excludes deployment unless a latest explicit request directs it.
- Preserve tests, type checks, lint, documentation checks, credential handling, destination scope, and honest result verification. Missing workflows, credentials, or provider permission remain blockers. Do not promise that a toggle grants provider or operating-system permission.
- Neither selection authorizes running the Mew launcher or starting, stopping, or restarting servers. Those remain separate operations requiring an explicit request.
- Preserve saved account text, custom/damaged sections, revisions, queue/schedule snapshots, and independent tab preferences. Only effective request text changes. Requests without choices retain their previous build/default-no-deploy behavior.

Replace this repository's conflicting blanket instructions with this contract. A repository's documented command and operational safeguards still determine how an authorized task runs.

## Alternatives and rationale

Keeping the controls as suggestions makes an enabled Deploy button ineffective whenever an older blanket ban remains. Automatically rewriting every saved instruction would destroy user text and revisions. Explicit request precedence in the generated context gives the controls their expected effect while keeping source preservation and a clear boundary around other operations.

A new runtime execution gate is outside this correction. These controls convey task authorization to an agent; the existing tools and providers continue to enforce their own permissions.

## Consequences

The selected task can build and deploy without redundant confirmation. Build off also has a clear effect in projects with mandatory saved build defaults. Operators still select the target and provide credentials through established private configuration. Existing host processes need their normal, separately authorized application procedure to load server-code changes; editing context files alone does not reload modules.

The [guidance contract](../development/agent-guidance.md#per-message-execution-options), [usage guide](../../../docs/guides/project-setup.md#build-verification), and [repository execution rules](../development/getting-started.md#execution-and-verification) own current behavior. The [work record](../work/request-build-deploy-authorization.md) records actual checks and rollout.
