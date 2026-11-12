---
title: "Unify project actions in the command menu"
description: "Places results/publishing and Build/Deploy entries inside the existing project command menu. Supersedes ADR 0163's separate entry placement while retaining its execution and configuration contracts."
created: "2026-11-12"
updated: "2026-11-12"
---

## Status

Accepted. Supersedes only the separate entry placement in [ADR 0163](0163-project-build-deploy-actions.md) and extends the results screen in [ADR 0165](0165-project-delivery-pipelines.md).

## Context

The project header and sidebar showed Results & release, Build, Deploy, and the command triangle as separate controls. This crowded project rows and gave users multiple entry points for related work.

## Decision

Use the existing project command triangle as the single entry. Its menu lists Results & release, Build, and Deploy above the saved commands. Selecting an entry closes the dropdown and opens the corresponding existing dialog in the same project scope. Keep the command and action configurations and their execution behavior separate. Preserve shortcuts, notifications, command reordering, and recovery when command metadata is unavailable.

The [command menu contract](../features/terminals-agents-automation/project-command-buttons.md) owns interaction details. The [work record](../work/project-delivery-pipelines.md#unified-command-menu) records local verification.

## Alternatives and rationale

Keeping four controls leaves project rows crowded. Replacing their underlying execution models would change terminal sessions, completion tracking, and provider authorization without solving the entry-point problem. A single menu preserves those capabilities while making them discoverable from one familiar control.

## Consequences

Build, Deploy, and Results & release require one additional menu selection. They remain independently usable when command metadata fails, and their existing dialogs continue to present their own settings and results. The menu must remain usable with keyboard, touch, small viewports, and inactive project rows.
