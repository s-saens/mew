---
title: "New agent conversation input focus"
description: "Records the implementation of automatic focus on new conversation input after runtime or agent set selection, isolated browser, type, and lint check results, existing documentation link errors, and the scope not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

Improved the behavior that required clicking the input again after selecting a runtime. The current behavior is defined in [agent set and tab creation](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).

`AgentPanel` remembers the newly created tab ID and sends an automatic focus request to the active conversation's input. Runtime and agent set creation flows share this behavior and use the existing shared environment detection. Restoring saved tabs and switching to existing tabs are excluded from these requests.

Verification results:

- `node --test server/agent-new-tab-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px with light and dark themes. Verified desktop input focus after runtime selection by number key or click, draft input before runtime connection, suppression of automatic focus on mobile, and focus preservation when restoring saved tabs or switching to existing tabs. Existing regressions for new tabs, closing, restoration, and ordering also passed.
- `npx tsc -b`: Passed.
- `npx oxlint src/components/AgentPanel.tsx server/agent-new-tab-ui.test.ts`: Completed without errors. Existing React-related warnings remain.
- Impeccable check: No findings in the modified `AgentPanel.tsx`.
- `npm run check:docs`: Description checks passed, but the command failed on 17 links to previously deleted files (`docs/features/MOC.md` and task documents) unrelated to this work.

No app build or server application was performed. Actual provider connections and physical keyboard connection or disconnection were not verified. Shared detection uses browser viewport and pointer characteristics.
