---
title: "Agent composer Build and Deploy implementation"
description: "Records the November 6 composer Build/Deploy toggles, per-message execution snapshots, guidance preservation, and removal of build settings controls. Covers 52 passing focused tests, successful build and lint, and existing documentation-link failures; deployment and server lifecycle operations are outside this work."
created: "2026-11-06"
updated: "2026-11-06"
---

## Purpose

Make build verification and deployment intent visible in the composer action row while composing an agent request, preserve that intent for delayed messages, and remove the former build selector and details from Default Instructions.

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

## Application and remaining limits

No deployment, launcher execution, or server start, stop, or restart is part of this work. Local verification does not establish execution against real provider accounts or production deployment. Build and Deploy are agent instructions; they do not guarantee operation execution or grant permissions.
