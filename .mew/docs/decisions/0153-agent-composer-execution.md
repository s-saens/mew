---
title: "Per-message composer Build and Deploy controls"
description: "Places build execution choices in the agent composer action row and snapshots Build/Deploy options per message. Partially supersedes ADR 0116's settings UI placement while preserving account sources, advanced values, and project restrictions."
created: "2026-11-06"
updated: "2026-11-06"
---

## Status

Accepted. Partially supersedes [ADR 0116](0116-configurable-agent-build-verification.md): replace its Default Instructions build selector and Build details with composer controls. Preserve its backend settings, account-source compatibility, honest verification reporting, and project-owned execution restrictions.

## Context

Build verification applies to individual requests, but its selector was inside account-wide Default Instructions. Users need to choose build and deployment behavior while composing a request, see the current state, and preserve that choice when execution is delayed. A later toggle change must not silently change queued or scheduled work. Existing account guidance also contains commands, scope, failure handling, custom instructions, and damaged sections that an upgrade must preserve.

## Decision

Place icon-only Build and Deploy toggles in the agent composer action row, with Build on and Deploy off by default. Use translated accessible names and shared tooltips, pressed-state semantics, and on/off feedback. Keep preferences in browser-local storage scoped by account, project, and tab, using a dedicated execution-options key. Refresh restores the tab's choices without coupling independent tabs.

Capture `execution: { build, deploy }` with every submitted message, including startup-pending input, queues, and schedules. Carry that snapshot through execution; editing a queued message uses its own options and restores the separate new-message options afterward. Older requests without options retain their existing build behavior and exclude automatic deployment by default.

Build on requires generated build verification for the request, retaining the saved command, scope, and failure handling even if the saved generated mode is `project`. Build off suppresses only Mew's generated default build requirement. Neither changes custom or damaged sections, original account text or revision, project-mandated checks, or explicit user instructions. Remove the build selector and Build details from Default Instructions; retain the existing settings API and source editing through View file. Generated sections require matching metadata and prose; hand-edited sections that no longer match remain custom and are preserved.

Deploy on requests the project's documented deployment after completing the work when project restrictions and existing permissions allow it. Deploy off excludes automatic deployment unless explicitly requested by the user. Missing deployment guidance and blocked execution must be reported. Explicit execution options are still passed when automatic project guidance is disabled, while account guidance and its advanced build details are omitted. They grant no permissions and do not override deployment, launcher, or server-lifecycle restrictions.

## Alternatives and rationale

Keeping build choices only in account-wide settings hides a frequent per-request choice and cannot capture differing queue or schedule intent. Moving all advanced fields into the composer would add controls unrelated to most requests. Compact toggles provide the immediate choice while the existing source and API retain advanced configuration.

Rewriting account files when toggles change would change revisions and risk replacing custom guidance. Applying an execution snapshot only while constructing effective context preserves the source and lets delayed requests retain their original intent. Reading current composer state at execution time would make accepted messages change unexpectedly.

A runtime build/deploy gate would require a separate execution and permission model. This decision provides agent guidance and visible request state without claiming that Mew executes or verifies those operations itself.

## Consequences

Build and deployment intent are visible while composing and remain stable across delayed execution. Tabs can keep different preferences in the same project. Account-wide build values remain compatible, though changing advanced values now requires View file or the existing API. Project-mandated checks continue when Build is off; Deploy on cannot enable operations prohibited by the project.

The [guidance contract](../development/agent-guidance.md#per-message-execution-options) owns delivery and preservation. The [input feature](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#build-and-deploy-controls) owns UI behavior, [project setup](../../../docs/guides/project-setup.md#build-verification) owns usage, and the [work record](../work/agent-composer-execution.md) owns local verification and application limits.
