---
title: "Remove the square border from installable app icons"
description: "Records the removal of square borders from three sizes of installable PNG icons and application of the default midnight gradient background on 2026-10-28. Describes mark preservation, regression check results, and the scope that has not been deployed."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Removed the outer square border from the app icon installed on the home screen. Preserved the existing background and the internal mark's color, size, position, and stroke width in the 180, 192, and 512px PNGs. The favicon and full loading logo were not changed. The current requirements are owned by the [Installable web app UI contract](../development/ui-contracts.md#installable-web-app-and-startup-guidance).

Applied a transform to the existing paths in `public/favicon.svg` that translates them by 20% of the canvas size and scales them by `크기 × 0.6 / 64`. First reproduced the PNGs with their existing borders using CairoSVG and confirmed pixel matches with the originals at all three sizes, then generated PNGs from the same SVG with only the border excluded.

## Verification and application

- `node --test server/app-install-manifest.test.ts`: 5 checks passed. Checks verify that the outer margins at all three sizes contain only the opaque background color and that the internal mark's size and position are preserved. They also check existing manifest and Apple touch links and PNG dimensions. Confirmed that the pre-change PNGs failed the border check at all three sizes.
- Opened the changed 512px PNG directly and confirmed that the border was removed.
- Compared pixels at all three sizes against the Git originals and confirmed that the internal mark was identical and all changed pixels were the background color.
- `npx tsc -b` and `npx oxlint server/app-install-manifest.test.ts`: passed.
- `npm run check:docs`: 506 descriptions passed without errors. The full link check failed due to 18 existing links to missing documents unrelated to this work. The two changed documents have no link errors.

App builds, deployment, and server starts, stops, and restarts were not performed. The running app requires the user to build and apply the changes, and Mewlink central resources require separate deployment. The update timing for existing installed icons and their actual appearance on Android and iOS home screens were not verified on physical devices.

## Follow-up change: midnight background

Following a request on 2026-10-28, replaced the solid background with the default midnight static gradient. Used the default palette in `shared/theme.ts` and `themeBackgroundImage()` to blend purple and teal into a navy background at 135°. Used the same `inset: -8%` area as the app background and generated PNGs at all three sizes in isolated Chromium without animation. The internal mark's original paths, colors, and transform and the borderless shape are preserved. The solid-background pixel comparison above records verification of the earlier change. Moved the pure function `themeBackgroundImage()` to `shared/theme.ts` and re-exported it from the existing frontend entry point so the icon checks and app use the same background calculation.

- `node --test server/app-install-manifest.test.ts`: 5 checks passed. Verified that the outer margins at all three sizes match the default midnight gradient and are opaque, and that the mark's size and position and installation metadata are preserved. The existing solid-color PNGs failed the new background check at all three sizes.
- `node --test server/app-install-manifest.test.ts src/utils/theme-color.test.ts`: 22 checks passed. Existing theme calculation and application regression checks also passed after moving the shared background function.
- Opened the changed 512px PNG directly and checked the static navy, purple, and teal background and internal mark.
- `npx tsc -b` and `npx oxlint shared/theme.ts src/utils/theme-color.ts server/app-install-manifest.test.ts`: passed.
- `npm run check:docs`: 506 descriptions passed. The full check failed due to 18 existing links to missing documents; link checks for the documents changed in this work passed.

Builds, deployment, and icon updates on actual installed devices were not performed.
