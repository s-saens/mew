---
title: "Project agent context implementation plan"
created: 2026-09-16
updated: 2026-09-16
description: "Records the GUI and CLI implementation sequence for Documents linking, nondestructive initialization, and automatic agent guidance; the UI direction; and completion of implementation and verification for sessions, queues, and scheduled execution."
상위파일: "_work.md"
---

Decision: [ADR 0155](../history/decisions/0155-mew-project-agent-context.md).

## Plan

1. Create a shared module for project settings and safe document initialization. Verify preservation of existing files, path boundaries, and idempotency.
2. Pass automatic guidance at ACP execution points. Verify saving and restoring session links, new conversations, queues, and scheduled execution.
3. Add linking, initialization, and previews to the Documents settings dialog, and provide a CLI that calls the same module.
4. Run behavioral tests, type checks, lint, and documentation checks, and update usage instructions. The user performs builds, deployments, and server restarts.

## UI direction

Keep the colors and controls of the existing Documents settings dialog. The sequence is linked path → automatic guidance and additional instructions → optional initialization → change preview → apply. Use internal scrolling on small screens, and clearly identify errors and files to be created or preserved.

## Completed scope

- Implemented saving and restoring per-session Documents links and passing shared guidance with every ACP request. New conversations apply the changed path, and queues and scheduled execution use the same path.
- Added a shared module for project settings and nondestructive initialization, a CLI that defaults to read-only previews, and a Documents settings GUI.
- The GUI uses tokens and DialogFrame from the existing settings dialog. Verified preview invalidation after input changes, applying changes, Esc, and screen overflow on desktop and 390px mobile screens.
- Updated [usage and supported scope](../../../docs/guides/project-setup.md) and the [development contract](../development/agent-sessions.md).

## Verification

Passed 64 relevant tests (56 for agents, queues, sessions, workspaces, and scheduling; 8 new tests for settings, context, API, and browser), `npx tsc -b`, `npm run lint`, and central documentation allowlist and link checks. Existing lint warnings remain. The full `npm test` still has failures in DB permission integration tests and existing sidebar tooltip tests, which also reproduce in separate reruns. This work did not change those features.

No build, deployment, or server restart was performed. For updating an older standalone supervisor, follow the update section in the usage instructions.
