---
title: "Remove built-in Mewpet transition motions"
description: "Records removal of all nine optional transitions from the built-in capybara, preservation of basic motions and custom-skin support, and local regression verification without a build or server restart."
created: "2026-10-31"
updated: "2026-10-31"
---

The built-in capybara now supplies only its seven basic motions. Removed all nine transition entries from its manifest and their runtime WebP files so basic actions use the existing fallbacks without transition playback. Original artwork and generation records remain in `assets/mewpet/capybara/source/`. User-registered skins still support optional transitions. The [Mewpet feature contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#optional-transition-motions-and-automatic-jumps) owns current behavior.

Verification results:

- The new bundled-skin regression failed before the asset change and passed afterward. It checks all seven basic motions, absence of every optional transition, and rejection of transition image requests.
- `node --test server/mewpet-skins.test.ts src/utils/mewcat-sprites.test.ts server/mewpet-motion.test.ts`: 18 tests passed, including custom-skin transition uploads.
- `node --test server/mewcat-skins-ui.test.ts server/mewcat-animation-ui.test.ts server/mewcat-transitions-ui.test.ts`: settings and transition tests passed in isolated Chromium. The animation test initially assumed walking had started after preview playback; removing transition previews shortened that elapsed time. Changed it to wait for the walking state, then reran `node --test server/mewcat-animation-ui.test.ts` successfully. Desktop and mobile checks covered seven-motion previews, skin editing and restoration, optional custom transitions, and direct jump/fall/landing fallbacks. Existing dependency bundling warnings remain.
- `npx tsc -b` and targeted `npx oxlint` on the four changed test files passed.
- `npm run check:docs`: description and local-link checks passed.

The app was not built or deployed, and the running server was not restarted. Existing user-managed skin overrides retain their saved transitions.
