---
title: "Agent settings keyboard shortcuts"
description: "Records the 2026-10-30 Enter focus return and Ctrl/Cmd+Enter submission from agent settings, isolated browser regression coverage, verification results, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

Model, reasoning, and permission selectors now return focus to the composer on Enter and invoke its existing submit action on Ctrl+Enter or Cmd+Enter. This removes the extra Tab or pointer action after choosing settings. The current contract is in [agent input](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#detailed-behavior).

`HeaderSelect` accepts callbacks for returning to the input and submitting. An open list confirms its highlighted option on Enter; submission uses the already selected settings and closes the list. Composition and repeated Enter events do not invoke these actions. Arrow selection, Space and pointer opening, and Shift+Tab navigation remain available. `AgentPanel` connects all three selectors to the existing composer actions, preserving submission guards and context handling.

Verification:

- Before implementation, the added browser regression failed because Enter did not return focus to the composer.
- `node --test server/agent-control-latency-ui.test.ts server/agent-command-ui.test.ts`: The settings regression passed in isolated Chromium at 1100px and 390px. It covers Enter from all three settings, Shift+Tab navigation, Ctrl+Enter submission from each setting, Cmd+Enter from model search, selected settings in sent prompts, list closure, IME events, key repeat, empty input, and existing delayed-response behavior. The separate CLI test failed at its existing attachment destination assertion: it expects `.mew/assets`, while the implementation uses `.mew/temp/assets`. That test was not changed.
- Targeted Oxlint completed without errors; existing React warnings remain. The Impeccable detector reported no findings in either changed component.
- `npx tsc -b` and `npm run check:docs`: Passed.

No app build, deployment, server startup, or restart was performed. Physical mobile keyboards and actual provider connections were not tested.
