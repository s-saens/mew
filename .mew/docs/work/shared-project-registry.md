---
title: "Shared projects and project setup"
description: "Records shared project registry creation, cloning, discovery, and personal project corrections. Includes the November 6 setup popup, My/All scope selector, and separate shortcut-removal/permanent-deletion work with local verification and runtime-application boundaries alongside earlier inline setup history."
created: "2026-11-02"
updated: "2026-11-06"
---

## Purpose and resulting behavior

Replace path-first project addition with creation by name and an explicit existing-folder linking branch. Keep the instance's available projects separate from each user's ordered shortcuts. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md) owns the resulting behavior, [architecture](../development/architecture.md#shared-project-registry-and-my-projects) owns storage/API and migration, and [ADR 0118](../decisions/0118-shared-project-registry.md) owns the decision.

- Managed creation uses `~/.mew/projects/<name>`, creates `.mew/docs/` inside `.mew/` as the initial Documents location, and defaults Git initialization on. Existing directories are not overwritten.
- `DATA_DIR/projects.yaml` stores the shared catalog and each account's My Projects. Creating or linking registers and pins for the creator; other signed-in accounts can pin the same project independently. Legacy account lists migrate without moving folders or deleting their JSON source.
- The Add Project dialog offers New Project, All Projects, and explicit linking. A new account starts with project onboarding rather than the implicit startup folder. Desktop/mobile selection retains personal ordering, restoration, and shortcut behavior.
- Agent-assisted creation embeds the ordinary AgentPanel and sends one initial discovery prompt for the requested new tab. Runtime selection, permissions, transcripts, recovery, and later use of the conversation remain normal agent behavior.
- Members gain shared discovery, managed creation, linking, registered-root selection, and shared icon access for registered roots. Existing file/feature rules, arbitrary server writes/Git operations, and subproject/worktree checks remain separate.
- Opening an All Projects row changes the active project without adding a shortcut. Add to My Projects remains explicit. Duplicate names have a path detail for disambiguation.
- A missing saved active root falls back to the first existing My Projects directory. If none exists, onboarding is shown while catalog entries and personal shortcuts remain stored. The demo implements the same catalog API in memory with managed folders beneath its virtual workspace.

## Local verification

Final focused runs passed **44 tests**:

| Scope | Result |
| --- | --- |
| Registry service, project/access APIs, account roots, icons, managed-path boundaries, and demo project behavior | 28 passed |
| Actual App project switching and restoration (`server/workspace-switch-ui.test.ts`) | 9 passed |
| Linked-folder dialogs, project switcher/sidebar, new project catalog, and assisted creation UI | 7 passed |

The checks cover legacy migration, shared catalog and independent personal shortcuts, managed name and Git choices, collision and path rejection, canonical linking, guest and member boundaries, missing active roots, registered-root icons, and managed files beneath an explicit ancestor data directory. Browser fixtures cover fresh onboarding, explicit pinning versus opening, duplicate names, creation/open retries, existing folder browsing, ordering, keyboard and touch selection, rapid switching, worktree preservation, and the one-time agent interview prompt with conversation restoration. The new catalog was checked on desktop/mobile in both light and dark themes; the assisted conversation uses the actual AgentPanel with mocked runtime transport and checks that stale prepared tabs do not replace it. Browser captures were reviewed after the duplicate-name text contrast correction.

- `npx tsc -b` and the required `npm run build` passed. Vite reported its existing large-chunk warning; the build completed successfully.
- `npm run lint` passed with warnings and zero errors.
- `npm run check:docs` passed: 644 descriptions, zero metadata errors, and zero link errors. The earlier missing runtime-recovery record belonged to a concurrent change and was resolved before this final check.
- `git diff --check` passed.

A separate broader demo transport run reproduced the existing Mewpet manifest width assertion failure in `src/demo/transport.test.ts`; it is outside the passing focused project runs above. No full-suite success is claimed.

## Application and remaining limits

No deployment, launcher invocation, or server start, stop, or restart was performed. The required build changes local `dist/` assets but does not reload server-side code. The user must apply server changes through their normal operation workflow.

Actual provider authentication and project-generation quality, physical-device interaction, and total production switching latency require separate validation. Discovery and documentation are requested through normal prompts; they are not enforced provider outcomes. Project registration is shared, while personal shortcuts provide convenience rather than private file ownership.


## Inline project setup follow-up — November 3, 2026

### Purpose and resulting behavior

Implement the latest requirements in [the organized task](../../tasks/Done/Improve%20project%20selection%20and%20creation%20UX.md). The open task editor automatically moved its original Korean filename to the English title and then to Done when completion was recorded. The November 2 dialog described above is superseded by the inline panel; its original checks remain historical evidence.

- **Add** reveals Git clone, New project, and Existing project inside the desktop/mobile panel. Name-only creation keeps a default-on Git icon inside the field and a check action. Agent-assisted setup remains a secondary action using the existing conversation panel.
- **All Projects** starts collapsed at the bottom. Opening a shared row and adding its shortcut remain separate actions. The last personal shortcut can be removed while keeping its active project open; shared entries and files are preserved.
- Managed cloning derives its name and uses the existing account credential boundary. GitHub organization/private repositories are listed across pages; public GitHub/GitLab HTTPS URLs need no account connection. First-use onboarding exposes GitHub connection before a project is open.
- Catalog discovery imports managed folders and bounded nested Git/Mew projects. My Projects groups pinned descendants beneath their nearest pinned ancestor; catalog discoveries are not automatically pinned.
- Mobile inline controls have 44px targets. Catalog shortcut refreshes preserve rows and return keyboard focus to the completed project's open action.

The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md), [UI navigation contract](../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files), [architecture](../development/architecture.md#shared-project-registry-and-my-projects), and [ADR 0124](../decisions/0124-managed-clone-and-project-discovery.md) own current behavior and boundaries. The browser demo implements managed cloning as an in-memory example without network/provider access.

### Local verification

The final focused runs passed **43 distinct tests**:

| Scope | Tests |
| --- | --- |
| Managed clone, GitHub repository listing, registry service and authenticated APIs | 19 |
| Inline addition, catalog, project switcher/sidebar, and assisted conversation | 5 |
| Hierarchy utility and virtual demo projects | 7 |
| Actual App switching/onboarding/keyboard and startup download boundaries | 12 |

After the review fixes, the two inline browser tests and actual App keyboard integration passed again. Captures covered 200px/240px sidebars, 390px mobile, both light and dark themes, and the integrated App panel. A fresh review scored the mobile-target and pin-focus fixes resolved. The one mechanical UI detector run reported no findings.

- `npm run build` passed after TypeScript and Vite compilation. A prior attempt was blocked by a concurrently added, unrelated input-focus test's implicit event type; that file was corrected before the successful reruns. The existing large-chunk warning remains.
- `npm run lint` passed with warnings and zero errors. TypeScript also passed through the required build.
- `npm run check:docs` found 673 valid descriptions, but the whole-repository link check reports an existing absolute `/api/asset` reference in the unrelated Image preview and attachment editing task. This task does not change that document. A scoped check using the existing description and link validators passed for all 11 changed documents.
- A broader Git connection run passed 26 of 27 tests. The unchanged branch API test expects a ref without the `hash` returned by the existing implementation; no full-suite success is claimed.
- `git diff --check` passed. No server lifecycle operation, launcher invocation, deployment, or push was performed.

### Application and remaining limits

The build updates local served assets; server-side APIs still require user-owned runtime application. Actual GitHub authorization/private cloning, organization SSO approval, physical-device touch, and external network behavior remain unverified. GitLab account authorization and other Git hosts are outside the current provider support. Browser tests use synthetic projects and mocked provider responses; the Git clone regression preserves actual local Git history and files.


## Add placement correction — November 3, 2026

Move Add immediately below the final My Projects row, and reveal its three options beside the Add trigger on the same row. The personal list and setup share a scrolling region; All Projects remains an independent bottom section. Narrow panels use accessible icon choices with shared tooltips, and wider panels show their labels. Current behavior belongs to the [UI contract](../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files) and [project guide](../../../docs/guides/projects.md).

- Six focused browser checks passed: inline addition, project sidebar, switcher, catalog, and actual App onboarding/keyboard flows. Regression assertions check same-row Add/options, Add directly after the last project, and separation from the bottom catalog.
- Desktop and mobile captures were inspected, including the 200px sidebar. A scoped fresh review found no material issue. The mechanical detector reported no findings.
- Global lint passed with warnings. The full documentation check found valid metadata and the same unrelated image-task asset-link error described above.
- `npm run build` passed after TypeScript and Vite compilation, with the existing large-chunk warning. The initial attempt was blocked by two argument-count errors in concurrently modified `server/shared-mcp.test.ts`; those errors were corrected before the successful rerun. All four changed documentation files passed metadata and local-link checks.

No deployment, launcher, or server lifecycle operation was performed.


## Hierarchy shortcut correction — November 4, 2026

Nested projects were displayed beneath their ancestors while shortcut labels, Alt-number targets, and reorder operations still used positions in the ungrouped saved list. Derive a single displayed hierarchy for all three operations. My Projects now numbers its first nine rows from top to bottom, and sibling reordering starts from that displayed order. The [feature contract](../features/projects-files-search/opening-projects-tabs-and-groups.md#select-and-organize-projects) and [UI contract](../development/ui-project-navigation.md#header-project-switcher) own current behavior. Filesystem ancestry still determines nesting.

- `node --test src/components/project-shortcut-order.test.ts src/utils/project-hierarchy.test.ts`: all five tests passed. Actual component regressions cover shortcut text and accessibility metadata, Alt-number activation, keyboard and pointer-handle reordering, selection while the sidebar is closed, and the nine-row limit. Happy DOM supplies row geometry for drag hit testing; it does not verify browser layout or physical touch.
- `npm run build` passed, including TypeScript; Vite retained its large-chunk warning. `npm run lint` passed with warnings and no errors. The scoped mechanical UI detector reported no findings, and the changed diff passed whitespace checks.
- `npm run check:docs` validated 694 descriptions, then failed on 42 existing missing-target links outside this change. Scoped metadata and link checks for the three changed documents passed.
- `server/project-switcher-ui.test.ts` and `server/project-sidebar-ui.test.ts` could not connect to the user-managed Obscura endpoint. Browser and physical-device verification remain incomplete.

The build updates local `dist/` assets. No deployment, launcher invocation, server lifecycle operation, or push was performed.


## New-account personal shortcuts correction — November 4, 2026

Prevent browser-cached project paths from becoming a new account's personal shortcuts. The former startup flow retained cached paths when the server returned `null`, then saved them into that account. The focused `useRootProjectTabs` hook now starts empty, restores only the account's server list, and waits for a successful read before saving or updating the browser cache. Existing server lists retain their ordering; read failures leave saved lists untouched. The [feature contract](../features/projects-files-search/opening-projects-tabs-and-groups.md#projects-and-my-projects) and [storage contract](../development/architecture.md#shared-project-registry-and-my-projects) own current behavior.

- `node --test src/hooks/use-root-project-tabs.test.ts server/project-registry.test.ts server/project-access-api.test.ts`: all 17 tests passed. React hook regressions cover stale cache isolation before and after a null response, explicit additions, existing and empty lists, failed reads, and disabled project access. API assertions cover fresh owner, manager, and member accounts browsing and opening a shared project without adding it to My Projects.
- `npm run build` passed, including TypeScript; Vite retained its large-chunk warning. `npm run lint` passed with warnings and no errors. `git diff --check` passed.
- `npm run check:docs` validated 697 descriptions and reported 42 existing missing-target links. No new link target is introduced by this correction; the architecture document retains its existing missing parent reference.
- `node --test --test-name-pattern='App first-use onboarding' server/workspace-switch-ui.test.ts` could not connect to the user-managed Obscura endpoint. The passing hook tests use Happy DOM and mocked API responses; browser layout and physical-device verification remain incomplete.

The required build updated local `dist/` assets. No deployment, launcher invocation, or application server lifecycle operation was performed. Previously saved account shortcuts are preserved; this correction does not remove entries already stored by the old behavior.


## Empty personal project panel and unified import — November 4, 2026

### Purpose and resulting behavior

Make an empty My Projects list a clear starting point for adding a project, including when an accessible shared project remains active. Consolidate shared project discovery and server-folder linking under one inline import flow. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md#projects-and-my-projects), [UI navigation contract](../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files), and [project guide](../../../docs/guides/projects.md#프로젝트-탭) own the current behavior. Earlier bottom-catalog descriptions and checks above remain historical.

- Empty My Projects shows the top bar and a project panel filling the remaining area. It hides the Dock, project work panels, header project selector, and header command button. Centered Add a project offers New project, Git clone, and Import project.
- For accounts with personal projects, Add follows the list and reveals those same three choices. Import project reveals From this workspace and Browse path inline. The former bottom All Projects section is removed; workspace is the UI term for the registered shared catalog.
- Workspace import adds the caller's personal shortcut and opens that project. Path import preserves the existing directory and registration behavior. Creation and cloning also pin and open their result. An empty personal list initially shows the centered three choices. X returns one inline level at a time and can collapse those choices to Add.
- Storage, catalog APIs, account roots, permissions, project files, and other accounts' shortcuts retain their existing owners and boundaries. This flow refines ADRs [0118](../decisions/0118-shared-project-registry.md) and [0124](../decisions/0124-managed-clone-and-project-discovery.md) without changing their registry or provider decisions.

### Verification and application

- The focused registry/access, demo, personal-list, hierarchy/shortcut, project-view, and actual-component runs passed 40 tests. `node --test src/hooks/use-mobile-panel-swipe.test.ts` passed one additional regression, for 41 distinct passing tests. The component checks cover all three choices, workspace/path imports, X/Esc/Back and focus restoration, busy-operation guards, provider/catalog errors, validation, and retries without duplicate creation or import. The swipe check covers delayed workspace mounting, listener cleanup, and adding a project after returning to setup.
- Review identified a first-open failure that could unmount setup after registration. App now applies refreshed personal shortcuts only after the chosen project opens successfully, retaining the form and error on failure. The first-open browser fixture includes a failed attempt and retry; its runtime assertion remains blocked below.
- `npm run build` passed, including TypeScript; Vite retained its large-chunk warning. `npm run lint` passed with warnings and no errors. `git diff --check` passed. The scoped Impeccable detector reported no findings.
- `npm run check:docs` validated 698 descriptions and reported the same 42 existing missing-target links. Changed descriptions and new links were also inspected separately; the architecture and public project guide retain their existing missing parent references.
- `node --test --test-name-pattern='App hides project work surfaces' server/workspace-switch-ui.test.ts` compiled its fixture but could not connect to the user-managed Obscura endpoint. Desktop/mobile geometry, browser rendering, and physical-device behavior remain unverified. Happy DOM component/hook tests and policy tests do not establish those visual results.

The build updates local `dist/` assets. No deployment, launcher invocation, application server lifecycle operation, or push was performed.

## Project-add popup — November 6, 2026

### Purpose and resulting behavior

Replace the project panel's labelled Add project row and inline setup with an icon-only plus trigger and a separate themed popup. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md#create-or-link-a-project), [UI navigation contract](../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files), and [project guide](../../../docs/guides/projects.md#프로젝트-탭) own current behavior; earlier inline descriptions above remain historical.

- The plus trigger follows My Projects. Empty-list onboarding shows its heading and plus without automatically opening setup. The trigger and existing project-add shortcut open the same popup, with creation, cloning, workspace import, and nested folder browsing.
- The popup uses `DialogFrame`, visible name/URL labels, text-labelled primary actions, and compact choices with icons and short descriptions. It preserves Git initialization, agent-assisted creation, validation, drafts, and retries without duplicate creation or cloning.
- The back arrow returns one setup step. X, outside press, Esc, and browser Back dismiss the popup; nested dialogs close first. Busy operations stay open. Focus remains inside the popup and returns to the plus after dismissal, including outside presses.
- The desktop dropdown fallback retains its menu while portaled project and folder dialogs receive pointer input. Actual App regressions also cover first-project creation, a missing active project, removal of the last shortcut, and desktop/mobile keyboard entry.

### Verification and application

- `node --test src/components/project-add-inline.test.ts server/project-catalog-panel-ui.test.ts server/project-add-inline-ui.test.ts` passed 12 tests. Component and isolated Chromium checks cover creation, cloning, provider connection, import, errors, retries, dismissal, focus, busy guards, translated choices, and desktop menu/mobile panel nesting. Browser layouts cover 320/390/1100px viewports and 200/240px sidebars in dark and light themes.
- `node --test --test-name-pattern='App (first-use|hides project|offers project|returns to project|keyboard aliases)' server/workspace-switch-ui.test.ts` passed 5 App regressions. The keyboard fixture keeps the actual deferred-dialog helper rather than replacing it with a null stub.
- An additional isolated Chromium review checked creation and long repository lists inside a mobile parent dialog at 320×220, 390×220, 844×390, and 390×844. Popup bounds, fixed headers, body scrolling, 44px touch controls, nested Esc dismissal, and focus restoration passed. Desktop/mobile screenshots were inspected; physical devices were not tested.
- `npm run build` passed, including TypeScript, with Vite's large-chunk warning. `npm run lint` passed with warnings and no errors. Focused lint and `git diff --check` passed.
- `npm run check:docs` validated 742 descriptions and reported 39 existing missing-target links, including `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. The project guide retains its existing missing parent reference; this task introduces no missing target.

The required build updates local `dist/` assets. No deployment, launcher invocation, application server lifecycle operation, or push was performed. Browser APIs in these checks use isolated fixtures; real Git providers and physical-device interaction were not exercised.

### Full-width plus correction — November 6, 2026

Expand the plus trigger to 100% of its available container width and center its icon horizontally and vertically. Remove the onboarding-specific fixed width so the empty-list trigger follows the same rule. Popup behavior and the existing button heights remain unchanged; the [UI navigation contract](../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files) owns the layout.

- `node --test server/project-add-inline-ui.test.ts` passed. Added geometry assertions verify full width and icon centering for ordinary and onboarding triggers across 200/240px desktop panels and 390px mobile, in dark and light themes.
- `npm run build` and `npm run lint` passed with warnings. `git diff --check` passed. `npm run check:docs` validated 742 descriptions and retained the same 39 existing missing-target links.

Verification used isolated Chromium fixtures and the local build; physical devices and application server lifecycle operations were outside this correction.

### Create with agent loading recovery — November 6, 2026

Investigate the reported nonworking Create with agent action. The existing agent conversation passed its normal runtime-selection and first-prompt checks after correcting a stale fixture helper name. The App entry used a deferred component with a null fallback, leaving no visible progress while its dialog downloaded and no dialog-local recovery for import failures.

Use the existing deferred-dialog helper to open a titled loading frame immediately after project creation and switching. Failed imports show an explicit retry, preserving the created project. The [agent session contract](../development/agent-sessions.md#agent-assisted-project-creation) owns loading, runtime selection, and conversation behavior.

- Added an App regression that clicks Create with agent from onboarding, registers and opens the project, holds the dialog import, checks desktop/mobile frame bounds, rejects and retries the import, and verifies the resulting requested conversation and working directory. Registration occurs only once. The old entry failed the loading-frame assertion.
- The final serial browser run passed 8 tests across `server/workspace-switch-ui.test.ts` (6 relevant App cases), `server/project-creation-agent-ui.test.ts`, and `server/deferred-dialog-ui.test.ts`. The latter checks include dismissal during loading, retry, ready-content replacement, first-prompt delivery once, reconnection, and conversation preservation. An earlier parallel run timed out in the first-prompt and keyboard tests; both passed individually and in the final serial run.
- `npm run build` passed, including TypeScript, with the existing large-chunk warning. `npm run lint` and `git diff --check` passed. Documentation validation passed 742 descriptions and retained 39 existing missing-target links.

The live reported environment was not inspected directly. Verification used controlled module delay/failure and mocked provider communication, without a real provider login or model request. The local build updates `dist/`; no deployment or application server lifecycle operation was performed.

### Projects My/All scopes — November 6, 2026

Rename the project panel heading to Projects and place My / All directly beneath it. Extract the explorer's existing Documents / Files control into `ScopeToggle`, so both entry points share the same markup, spacing, colors, selected state, accessible pressed state, and Left/Right/Home/End behavior. Preserve the explorer's owner-only Documents context menu. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md#select-and-organize-projects) and [UI navigation contract](../development/ui-project-navigation.md#header-project-switcher) own current behavior.

My retains personal shortcut hierarchy, ordering, commands, and numbered shortcuts. All lazily loads the existing searchable workspace catalog and explicitly adds a personal shortcut before opening a project. The full-width plus remains below either list. Scope remains local to the mounted selector and starts at My; empty-list onboarding keeps its existing heading and plus popup. Desktop sidebars remain open after selection, while mobile panels close and restore focus. Imports block scope changes and release their busy state even if resizing unmounts the catalog before a failed shortcut save completes.

Local verification passed 26 focused tests:

- The scope, catalog, sidebar, header-menu switching, and action-menu browser tests passed 5 tests. Computed geometry, typography, spacing, colors, pressed state, and focus match the explorer control at 200/360px desktop panel widths and 390/320px mobile viewports in dark/light themes. Checks include search ancestry, import ordering, retry without duplicate pinning, busy dismissal, and a failed save after resizing unmounts the catalog.
- `node --test --test-concurrency=1 server/project-switcher-ui.test.ts server/header-controls-ui.test.ts server/subprojects-ui.test.ts src/components/project-add-inline.test.ts server/project-add-inline-ui.test.ts` passed 14 tests covering existing project navigation, touch, shortcuts, subprojects, and popup creation/import recovery.
- Seven selected cases in `server/workspace-switch-ui.test.ts` passed: assisted creation, first use, empty personal lists, missing active roots, last-shortcut removal, keyboard aliases, and desktop layout restoration. The actual App fixture keeps and styles the extracted ScopeToggle, preserving its explorer keyboard checks. Owner-only Documents context-menu forwarding was also inspected in source review.
- `npm run build` passed, including TypeScript, with the existing large-chunk warning. `npm run lint` and `git diff --check` passed. `npm run check:docs` validated 742 descriptions and retained the same 39 existing missing-target links.

Screenshots of desktop and mobile All were inspected. Browser APIs used isolated fixtures; physical devices and live account persistence were not exercised. The build updated local `dist/` assets without deployment or application server lifecycle operations.

### Project deletion choices — November 6, 2026

#### Purpose and resulting behavior

Separate removing a personal shortcut from deleting the actual shared project. The current project button and My row context menus first show Edit and Delete. Delete reveals Remove from My Projects and the owner-only Delete permanently choice in the same popup. Shortcut removal preserves project files and other accounts' shortcuts. Permanent deletion uses a dedicated `DialogFrame` confirmation with Cancel initially focused, busy dismissal guards, explicit errors, and retry.

The owner-only registry DELETE API deletes a registered real directory, removes its registered descendants and every account's matching shortcut/icon/group references, clears affected active roots, and publishes account-scoped deletion and workspace signals. Version-1 `deletedPaths` tombstones filter exact deleted registrations out of late shortcut saves while preserving unavailable-path recovery and allowing real folders to be registered again. It protects filesystem root, home, instance data/registry storage, the Mew source root, and protected ancestors. App waits for pending shortcut saves, applies the returned personal list, clears tree/icon caches, and restores another existing project or onboarding through the normal workspace flow. Other affected clients wait for their own save queue and reload authoritative personal paths/icons after the deletion signal.

The [feature contract](../features/projects-files-search/opening-projects-tabs-and-groups.md#select-and-organize-projects), [UI navigation contract](../development/ui-project-navigation.md#header-project-switcher), and [registry contract](../development/architecture.md#permanent-project-deletion) own current behavior. [ADR 0151](../decisions/0151-permanent-project-deletion.md) extends the shared-registry decision with the separate destructive operation; earlier removal checks above remain evidence of shortcut-only behavior.

#### Verification and application

The affected checks passed 41 tests: 31 backend, 5 personal-list hook, and 5 isolated browser tests.

- `node --test server/project-registry.test.ts server/project-registry-delete-api.test.ts server/userUiState.test.ts server/account-workspace.test.ts server/project-access-api.test.ts` passed all 31 tests. Coverage includes owner checks, protected roots and symlink changes, recursive folder and shared-ledger cleanup, exact-path tombstones, account-scoped WebSocket signals, corrupt-account-ledger preflight, filesystem failure preservation, and coexistence of managed projects with protected data under `.mew`. Backend scoped lint and diff checks also passed.
- `node --test src/hooks/use-root-project-tabs.test.ts` passed all 5 tests, including deletion-signal reconciliation of paths and icons.
- `server/project-delete-dialog-ui.test.ts` passed its isolated Chromium check at 1100/390/320px in dark and light themes. It covers the inline Delete choices, owner-only permanent action, Cancel focus, cancellation, busy dismissal, and failure/retry.
- A serial browser run passed 4 tests across project switcher, project sidebar, and actual App cases for removing the last shortcut and permanently deleting a project. Screenshots were inspected at 390px dark and 1100px light.
- `npm run build` passed TypeScript and Vite, retaining the existing large-chunk warning. `npm run lint` passed with existing warnings. Scoped `git diff --check` passed, and the changed descriptions were inspected through the repository's description catalog.
- `npm run check:docs` validated 743 descriptions with no metadata errors and reported the same 39 existing missing-target links. This change adds no missing target.

Backend filesystem checks use temporary projects, and browser APIs use isolated fixtures. These checks do not establish physical-device behavior or production application. The build updates local `dist/` assets; no deployment, launcher invocation, or application server lifecycle operation was performed.
