---
title: "Project build/deploy actions and default setup skill"
description: "Records implementation of named project actions and the setup skill, followed by automatic web build result files, complete ZIP downloads, and result-interface improvements. Distinguishes local verification from runtime application and deployment."
created: "2026-11-11"
updated: "2026-11-11"
---

## Purpose and resulting behavior

Add outcome-based Build and Deploy controls so everyday use does not require knowing commands. Preserve existing command buttons, allow manual and agent edits, and make partial setup failures recoverable without blocking the project. The [feature contract](../features/terminals-agents-automation/project-build-deploy-actions.md), [user guide](../../../docs/guides/commands.md#build-and-deploy-a-project), and [ADR 0163](../decisions/0163-project-build-deploy-actions.md) own current behavior and rationale.

The implementation adds conservative script discovery, separate project action settings, finite runs with exit-based results, completion/failure notices, host Browser links, and validated artifact downloads. The bundled `mew-project-setting` skill configures these controls and project documentation from user requirements, with replaceable TDD defaults. New and existing project setup reuse the normal project-bound agent conversation; generated prompts respect disabled or removed skills.

## Local verification

- Tests were written before implementation for the action behavior, setup prompts, and skill integration. The initial missing implementation or expected assertion failures were confirmed before making them pass.
- The setup-prompt utility tests pass. The existing project-creation browser regression also passes for desktop and mobile, covering the pinned working directory, one bootstrap message, reconnect, closing, and session restoration.
- The focused skill/library/harness/documentation tests pass (29 tests), and release packaging tests pass (7 tests), including the new bundled resource files. Scoped lint and whitespace checks passed for that integration.
- `npm run browsers:check` reports Playwright Chromium and Google Chrome ready.

The final combined non-browser run passed **69 tests**, covering action service/routes, client state, setup prompts, skill/library/harness integration, documentation skills, release resource packaging, and legacy command settings/scope. Client regressions cover pinned roots across project/account changes, retained completion results, permanent polling failure, missing runs, preserved execution errors, and stale-read/save ordering.

The new Chromium action fixture passed at 320px and 1100px in light and dark themes. It covers adding, changing, deleting, discovering, running, save-error draft retention, retry, canonical agent setup, Browser navigation, artifact scope, and completion notices after the originating controls unmount. The real account-level notice host is used; the agent setup request and action APIs are mocked. Screenshots of results and editing were inspected locally.

Focused legacy command menu, command workspace, metadata recovery, header switching, sidebar, shared action-menu, subproject, and project-creation browser regressions passed. The existing command menu now waits for a pending Stop request before consuming keyboard autofocus; a browser debugger confirmed the disabled-row cause, and a deliberately held response makes its regression deterministic. Temporary debugger instrumentation was removed. Three related project-panel test expectations were updated to the existing production title; product copy did not change.

- `npm run build` passed after the final source changes, including TypeScript and Vite. The existing large-chunk warning remains.
- `npm run lint` passed with warnings and no errors. Scoped lint and `git diff --check` also passed.
- `npm run check:docs` validated **789 descriptions with zero metadata errors**, then reported **39 existing link errors outside the changed documents**, including the deleted decision README and old MOC/task targets. The changed documents have **zero local-link errors**. The old parent link in the changed command guide was repaired.

Broader browser checks retain two separate failures: the image-preview backdrop assertion in `server/overlay-layers-ui.test.ts` also fails with the HEAD command-menu implementation substituted; the workspace-mode case in `server/workspace-switch-ui.test.ts` encounters an automatic Mewcat popup intercepting a mobile dock tap. The latter fixture replaces command controls with a simple button, and its other 15 workspace cases passed. Existing image and notification work was preserved. No full-suite pass is claimed.

## Application and remaining limits

All verification is local. No deployment, launcher execution, server start/stop/restart, or push was performed. The required build updates served frontend assets; new backend APIs and defaults still require user-owned runtime application.

Automatic detection covers explicit supported scripts and Android wrapper projects; unknown frameworks, credentials, and deployment targets need user or agent setup. A configured Browser address does not prove service readiness. Finite action processes do not supervise interactive development servers. Recent run history and output are bounded in server memory; background push and durable job recovery are outside this implementation. Browser fixtures use synthetic projects and mocked actions; actual hosting-provider deployment and physical-device APK installation are not verified.

## Follow-up: build result files and presentation

The original Node discovery provided build commands without output paths, so a successful result could show only its log. This follow-up discovers new or changed files from supported Vite and Create React App default output directories, retains explicit output patterns and Android APK support, and offers a complete bounded ZIP when all eligible output files are new or changed. The result interface presents available files, paths for duplicate names, archive access, run status, and guidance when no result is found. The [current contract](../features/terminals-agents-automation/project-build-deploy-actions.md#runs-and-results) owns limits and authorization; [ADR 0164](../decisions/0164-build-result-files.md) records the choice.

Configured HTTP(S) addresses still open in the host Browser when permitted. A downloaded web build is not automatically served or visually previewed; existing raw-file and Browser security boundaries prevent treating a static output folder as an executable app. Custom output locations and unsupported build systems may need explicit output patterns or agent setup. Run history and the archive manifest remain process-local. Individual downloads read the current file at the recorded path; ZIP requests also reject changed file metadata instead of silently including a different build. The metadata check is not a content hash or immutable snapshot.

### Follow-up local verification

`npm run build` passed, including TypeScript project builds; Vite reported its existing large-chunk warning. `npm run lint` passed with existing warnings. The focused backend and command-button suites passed 30 tests, including 511 ZIP entries, Unicode paths, CRC checks, Python `zipfile` validation, workspace authorization, scan limits, and changed or replaced result files. The scoped client, action state, and browser UI suites passed 16 tests. The result dialog was also inspected in light and dark themes at desktop and 320 px widths using the browser fixture.

`npm run check:docs` checked 790 descriptions without errors but failed on 39 existing missing links elsewhere in the working tree. A targeted link check found no errors in the five changed documents. These checks and the build are local; no deployment, launcher execution, server lifecycle operation, or push was performed. The user must apply the backend changes to a running instance.
