---
title: "Explorer file-type icons"
description: "Records the 2026-10-30 Material Icon Theme implementation and follow-up unification of generic file, loading, and open/closed folder artwork, with local regression checks and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and results

Added file-type icons so users can distinguish files in Documents, Files, search results, Add Project, and the server file explorer. Filename associations match the longest path suffix first, including the basename, before extensions. Compound extensions take precedence over shorter suffixes, and unrecognized names and extensions receive a generic file icon. Matching ignores case and accepts Windows paths. Folder, project, and Map Of Contents icons remain.

Pinned Material Icon Theme 5.40.0 under MIT as a development dependency. `tools/generate-file-icons.mjs` lowercases upstream mapping keys and produces the complete filename and extension maps, light variants, artwork JSON with 636 original SVG strings, and a distributed license copy. The shared `FileTypeIcon` lazy-loads `FileTypeIconImage` with its artwork JSON and renders decorative images from cached SVG data URLs without an external CDN. A Page icon fills the same space while the artwork module loads. The browser does not import the icon package or `chroma-js`; artwork JSON also preserves isolated UI fixture compatibility.

The [feature document](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns the current contract; [ADR 0089](../decisions/0089-file-type-icons.md) records the icon-pack choice.

## Verification and application

- `node --test src/utils/file-icons.test.ts server/file-type-icons-ui.test.ts server/explorer-performance-ui.test.ts server/sidebar-touch-ui.test.ts`: 7 passed, with no failures or skipped tests. Unit checks cover association precedence, paths, case, fallback, and theme variants.
- Isolated browser checks verified Files, Documents, filename search, and the shared browser at 1100px and 390px in light and dark themes. Checked image decoding, 16px dimensions, decorative and non-draggable images, icon updates after renaming, and file selection. Existing large-tree virtualization, lazy loading, touch-menu, and drag regressions passed. These checks used isolated fixtures, not the running server or a physical device.
- `npx tsc -b`, `node tools/generate-file-icons.mjs --check`, and `npm run lint` passed. Lint reported pre-existing warnings.
- `npm run check:docs` checked 555 descriptions with no description or local-link errors. The Impeccable detector returned no findings; desktop light and mobile dark captures were reviewed.
- No app build, deployment, launcher execution, or server restart was performed. The user must build and apply the change before checking the running instance.
- Actual-server, physical-device, and production application checks remain pending.

## Unified generic file and folder icons

Replaced the separate outline folder icons in the Files tree and shared browser with Material Icon Theme's `folder` and `folder-open` artwork at 16px. The same pack's generic `file` artwork renders extensionless names such as `mew` and unknown extensions. The three default SVGs are generated into a small synchronous module, so default files and folders do not wait for the larger artwork module. The associated-file loading fallback now uses the same generic artwork. Custom project and Map Of Contents icons retain their existing behavior. [ADR 0091](../decisions/0091-unified-explorer-icons.md) records this extension of the original decision.

- `node --test src/utils/file-icons.test.ts server/file-type-icons-ui.test.ts`: 6 passed. Verified exact upstream default SVGs, extensionless `mew`, decorative 16px images, and open/closed folder state changes in Files and the shared browser at 1100px and 390px in both themes. Desktop light and mobile dark captures were reviewed.
- Existing `server/explorer-performance-ui.test.ts` and `server/sidebar-touch-ui.test.ts` passed. `server/sidebar-sticky-ui.test.ts` failed its ancestor-guide pixel comparison, including on a rerun. An isolated temporary fixture loading the pre-change icon modules from Git HEAD reproduced the same assertion failure; the temporary fixture was removed. This existing check remains unresolved outside the icon change.
- `npx tsc -b`, `npm run lint` (existing warnings), `node tools/generate-file-icons.mjs --check`, and the changed-file diff whitespace check passed. `npm run check:docs` checked 562 descriptions with no description or local-link errors. The Impeccable detector reported no findings.
- No app build, deployment, launcher execution, or server restart was performed. User build and application remain required; actual-server and physical-device checks remain pending.
