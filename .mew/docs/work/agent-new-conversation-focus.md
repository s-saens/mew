---
title: "New agent conversation input focus"
description: "Records new-conversation input autofocus and the extension to observed keyboard use on mobile, including runtime touch selection and Ctrl/Cmd+P search focus. Includes isolated regression/build/lint results, unrelated search-tree and documentation failures, and physical-device limitations."
created: "2026-10-27"
updated: "2026-11-03"
---

Improved the behavior that required clicking the input again after selecting a runtime. The current behavior is defined in [agent set and tab creation](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).

## 2026-10-27 — Initial conversation focus

`AgentPanel` remembers the newly created tab ID and sends an automatic focus request to the active conversation's input. Runtime and agent set creation flows share this behavior and use the existing shared environment detection. Restoring saved tabs and switching to existing tabs are excluded from these requests.

Verification results:

- `node --test server/agent-new-tab-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px with light and dark themes. Verified desktop input focus after runtime selection by number key or click, draft input before runtime connection, suppression of automatic focus on mobile, and focus preservation when restoring saved tabs or switching to existing tabs. Existing regressions for new tabs, closing, restoration, and ordering also passed.
- `npx tsc -b`: Passed.
- `npx oxlint src/components/AgentPanel.tsx server/agent-new-tab-ui.test.ts`: Completed without errors. Existing React-related warnings remain.
- Impeccable check: No findings in the modified `AgentPanel.tsx`.
- `npm run check:docs`: Description checks passed, but the command failed on 17 links to previously deleted files (`docs/features/MOC.md` and task documents) unrelated to this work.

No app build or server application was performed. Actual provider connections and physical keyboard connection or disconnection were not verified. Shared detection uses browser viewport and pointer characteristics.

## 2026-11-03 — Keyboard use on touch devices

The shared [input-focus policy](../development/ui-editor-input.md#mobile-input-focus) now allows autofocus after keyboard use in a touch/mobile window. Application startup installs a capture listener before rendering, so the first Ctrl/Cmd+P or runtime number selection can focus its input. Touch presses retain the observed capability, allowing runtime cards to be tapped before typing. Touch-only opening remains unfocused. [ADR 0125](../decisions/0125-touch-keyboard-autofocus.md) records the shared policy change and detection limits.

Local verification:

- `node --test server/agent-new-tab-ui.test.ts`: passed the actual AgentPanel regression in desktop and mobile touch viewports, both themes. Number selection and subsequent runtime touch selection focus the composer; drafts can be typed before connection. Existing tab restoration and switching assertions passed.
- `node --test server/input-focus-ui.test.ts`: passed isolated regressions for desktop defaults, narrow/wide touch-only suppression, the first Ctrl/Cmd+P and existing query selection, content search, keyboard use followed by touch opening, deferred composer input, software/IME/synthetic exclusions, and tracking cleanup/reload.
- `node --test server/search-panel-ui.test.ts src/components/mention-composer-loading.browser.test.ts`: the deferred-composer test passed. The broader explorer test timed out waiting for `button[data-path="a1/b1"]` at `server/search-panel-ui.test.ts:237`. An isolated temporary copy using the original HEAD autofocus helper failed identically; the temporary fixture was removed.
- `npm run build`: passed, including TypeScript checks; Vite reported large-chunk warnings.
- `npm run lint`: passed with existing React warnings. Scoped `npx oxlint` over the focus helper, startup, and both changed regression files also passed without diagnostics.
- Impeccable detector over the changed focus helper and startup file: no findings.
- `npm run check:docs`: descriptions passed. Link validation failed on the existing API asset link in `.mew/tasks/Image preview and attachment editing.md`, outside this task.

The build refreshed `dist/`. No deployment, launcher, or server lifecycle operation was performed. Chromium emulates touch and trusted key events; physical Android/iOS keyboards, provider connections, and actual attachment/disconnection remain unverified. Keyboard-use inference cannot detect an unused keyboard immediately on connection, and some virtual keyboards can emit physical-style codes, as permitted by the [UI Events specification](https://www.w3.org/TR/uievents/#code-virtual-keyboards).
