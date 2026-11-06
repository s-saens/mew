---
title: "Agent composer Build and Deploy implementation"
description: "Records the November 6 composer Build/Deploy toggles, per-message execution snapshots, guidance preservation, removal of build settings controls, and follow-up fixes for Dock toast visibility, mobile keyboard reopening, and placement beside CLI mode. Covers local regression tests, successful builds and lint, and existing documentation-link failures; deployment and server lifecycle operations are outside this work."
created: "2026-11-06"
updated: "2026-11-07"
---

## Purpose

Make build verification and deployment intent visible beside CLI command mode while composing an agent request, preserve that intent for delayed messages, and remove the former build selector and details from Default Instructions.

## Resulting behavior

The composer defaults to Build on and Deploy off, uses translated icon tooltips and accessible pressed states, and confirms changes with on/off toasts. Preferences survive refresh locally for the same account, project, and agent tab. Message execution snapshots accompany immediate requests, startup-pending input, queues, and schedules; queue edits use the saved options independently of the new-message draft.

Effective guidance changes without rewriting the original account source or revision. Build on applies generated required guidance using existing advanced values; Build off removes only the generated default requirement. Custom and damaged sections, mandatory project checks, and explicit instructions remain intact. Deploy follows documented project procedures only within existing permissions and restrictions. The settings UI no longer exposes the build mode or details; the source remains editable through View file and the backend settings API remains available. Metadata-only edits become custom guidance unless the generated prose is updated to match. Explicit message execution choices continue to be passed when automatic project guidance is disabled, without account-level advanced details.

Current contracts are in [agent guidance](../development/agent-guidance.md#per-message-execution-options), [composer input](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#build-and-deploy-controls), and [project setup](../../../docs/guides/project-setup.md#build-verification). [ADR 0153](../decisions/0153-agent-composer-execution.md) records the decision and its limited supersession of ADR 0116.

## Verification

- `npm run build`: passed, including TypeScript project checks and the Vite production bundle. Vite retained its large-chunk warning.
- `MEW_DATA_DIR=/tmp/mew-test-data node --test server/agent-execution-options.test.ts server/agent-build-verification.test.ts server/agent-guidance.test.ts server/agent-context.test.ts server/agentWs.test.ts server/agentScheduledPrompts.test.ts`: 43 tests passed. Coverage includes strict option validation, generated/custom/damaged guidance, unchanged account sources and revisions, captured queue choices, disabled automatic context, and restored schedule dispatch.
- `node --test server/agent-build-verification-ui.test.ts server/agent-guidance-ui.test.ts server/agent-control-latency-ui.test.ts`: eight tests passed; the instructions fixture failed on obsolete build-field references, corrected before the separate successful rerun below. Isolated Chromium checked 1100/390/320px composer controls in light and dark themes, icon-only buttons, pointer and keyboard toggling, toast feedback, captured prompt settings, refresh restoration, queue editing, viewport bounds, and removal of build controls from the instructions dialog. Existing delayed-response model and permission checks also passed.
- `node --test server/agent-guidance-ui.test.ts`: one test passed after updating the fixture and layout expectations for the removed build fields. It retained desktop/mobile layout, autosave, focus, and conflict checks. The first runs exposed those obsolete test references; the final rerun passed.
- `npm run lint`: completed successfully with warnings.
- `npm run check:docs`: all 750 descriptions passed. The link phase reported 39 missing targets in unchanged documents, including `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`.
- The repository link checker filtered to all seven changed Markdown files: zero errors. Changed heading targets were inspected directly.
- `git diff --check`: passed.

## Follow-up: toast visibility above Dock

The Build/Deploy toast originally rendered inside the composer stacking context. Its local z-index could not rise above Dock, and transformed or clipped panel ancestors could constrain its position. Shared `Toast` now portals to `document.body` at the existing notice layer, following the [overlay contract](../development/ui-overlays.md#shared-layer-order). Pointer pass-through, live announcement, and dismissal timing remain unchanged.

The regression fixture adds a transformed, clipped panel and an overlapping Dock surface. Before the fix, all six desktop/mobile and light/dark cases failed the paint-order assertion. After the fix, `node --test server/agent-build-verification-ui.test.ts` passed all seven reported tests across 1100/390/320px light/dark scenes, including the existing composer behavior checks. The fixture now includes shared dialog-frame styles so its synthetic stacking context does not invalidate unrelated dialog interaction checks.

`npm run build` passed, including TypeScript checks; `npm run lint` completed with warnings. `npm run check:docs` again passed all 750 descriptions and failed on the same 39 existing missing links. The two changed documents had no local-link errors, and `git diff --check` passed. This was local browser and build verification without deployment or server lifecycle operations.

## Follow-up: preserve mobile keyboard visibility

A dismissed mobile keyboard can leave the composer focused. Build/Deploy previously preserved that stale editing focus on touch, allowing the browser to reopen the keyboard. The toggles now use the existing mobile-keyboard visibility signal: a touch releases stale editing focus only while the keyboard is closed, and keeps existing editing focus while it is open. Toggling never requests editor focus. Mouse and keyboard activation keep their existing behavior.

The regression covers both toggles with blurred input, retained focus after keyboard dismissal, and an open keyboard signaled through the visual viewport, along with desktop focus preservation and native-focus request recording. Before the fix, the four mobile light/dark cases failed the stale-focus assertion; desktop cases passed. `node --test server/agent-build-verification-ui.test.ts server/agent-execution-keyboard-ui.test.ts` passed all 14 reported tests after the fix. The focused fixture also covers textarea/contenteditable inputs, one change per activation, and Space-key accessibility.

`npm run build` passed in the primary checkout, including TypeScript and Vite. An earlier isolated build in `.worktrees/verify-agent-toggle-keyboard` also passed while concurrent API/project-board changes temporarily blocked primary-checkout verification. The unrelated intermediate errors were resolved outside this task; those files are excluded from this change. `npm run lint` completed with warnings; targeted lint for the changed component and tests passed without warnings. `npm run check:docs` passed all 750 descriptions and reported the same 39 existing missing links; the two changed documents had no local-link errors. `git diff --check` passed.

Headless Chromium cannot display an OS keyboard, so the tests verify real touch activation, focus requests, and viewport signals; physical-device keyboard animation remains unverified. No deployment or server lifecycle operation was performed.

## Follow-up: placement beside CLI mode

Move Build and Deploy immediately to the right of the CLI command-mode toggle, before Model, in the composer settings row. The floating bottom actions now begin with Clear. Preserve the existing execution snapshots, queue editing, toast portal, disabled state in CLI mode, and mobile keyboard behavior.

The composer regression checks CLI → Build → Deploy → Model geometry, shared row alignment and non-overlapping controls at 1100/390/320px, and removal from the floating action group. `node --test server/agent-build-verification-ui.test.ts server/agent-execution-keyboard-ui.test.ts` passed all 14 reported tests, including existing focus, toast, and captured-option checks. `npm run lint` completed with warnings. Documentation metadata passed for all 750 documents; the full link check retained the 39 existing missing targets, while the four changed documents had no link errors. `git diff --check` passed.

`npm run build` passed in the isolated `.worktrees/verify-agent-toggle-keyboard` checkout using the committed base plus this task's changes. Primary-checkout build verification remains incomplete: concurrent workspace changes first produced unused imports in `src/App.tsx`, then unsupported constructor parameter-property syntax in `src/workspace/workspace-presence.ts`. Those files are outside this task and remain untouched. No isolated assets were copied into the running instance, and no deployment or server lifecycle operation was performed.

## Application and remaining limits

No deployment, launcher execution, or server start, stop, or restart is part of this work. Local verification does not establish execution against real provider accounts or production deployment. Build and Deploy are agent instructions; they do not guarantee operation execution or grant permissions.
