---
title: "Agent conversation bottom button"
created: "2026-11-05"
updated: "2026-11-05"
description: "Records the agent bottom button's popup surface, white arrow, 30px fade boundary, and placement above sticky answer controls. Covers isolated desktop/mobile regression checks, build and lint results, and broader verification limits."
---

The bottom button previously used an inverse white background, read a mutable scroll-following ref during rendering, and could be covered by an expanded answer's sticky collapse footer. The change gives it the shared popup background and blur, a white arrow, reactive visibility, and a separate layer above the answer controls. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#bottom-navigation) owns the current behavior.

Visibility follows the measured remaining scroll distance: more than 30px shows the button; 30px or less hides it. Scroll events and resize observations update the state. The button stays mounted while opacity transitions in either direction, and hidden buttons are inert. Reduced motion disables the transition. Automatic following of incoming messages retains its existing threshold.

Local verification:

- `node --test server/agent-scroll-to-bottom-ui.test.ts`: All three tests passed in isolated Chromium at 1100px and 390px. Covers the 29/30/31px boundary, intermediate opacity in both fade directions, pointer and accessibility exclusion when hidden, clicking to reach the bottom, reduced motion, and click priority over an overlapping sticky collapse footer. Midnight, Rose, Dark, and Light backgrounds and blur match a shared popup reference, and the arrow stays white. Desktop and mobile fixture screenshots were inspected.
- `npm run build`: Passed TypeScript checks and the production build. The existing large-chunk warning remains.
- `npm run lint`: Completed with warnings in existing code.
- The broader `server/agent-history-ui.test.ts` run timed out waiting for the cached `Saved queue task` after navigation. An isolated comparison using the `HEAD` version of `AgentPanel.tsx` reproduced the same timeout at the same assertion. The temporary comparison files were removed.
- `npm run check:docs`: All 715 descriptions passed; the link checker reported 42 existing missing MOC and decision README targets. The changed documents' descriptions, local links, and referenced headings passed direct checks.

The browser fixture mocks agent sockets and APIs. Physical devices were not tested. The required build refreshed `dist/`; no deployment, launcher, or server lifecycle operation was performed.
