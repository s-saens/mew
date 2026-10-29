---
title: "Settings shortcut in the Mewpet speech bubble"
description: "Records implementation of the Mewpet settings button at the top of the speech bubble and direct desktop/mobile navigation, isolated UI, type, lint, and documentation check results, and the status not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

A gear button was added beside the close button at the top of the speech bubble to make settings easy to open after clicking Mewpet. Clicking the button closes the speech bubble and opens the Mewpet section in settings. On mobile, it also displays the section content directly, and switches to the Mewpet section even if settings is already open on another section. The [Mewpet assistant feature document](../features/appearance-accounts-operations/mewpet-assistant-conversations-and-controls.md) owns current behavior.

Verification results:

- `node --test server/mewcat-size-ui.test.ts`: passed checks in isolated Chromium on desktop dark and mobile light themes for the settings shortcut, speech bubble closure, switching within already-open settings on mobile, and existing resize, drag, and save behavior.
- `npx tsc -b`: Passed.
- `npx oxlint` on 5 changed code and test files: completed without errors. Existing App and Mewcat warnings remain.
- `npm run check:docs`: checks of 489 descriptions passed. The full link check failed because of 17 existing links pointing to `docs/features/MOC.md` and task documents that had already been deleted before this work. There were no link errors in the two documents changed in this work.
- The app was not built or deployed, and the server was not restarted. Application to the actual instance must be checked after the user builds it.
