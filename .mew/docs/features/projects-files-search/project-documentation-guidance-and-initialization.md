---
id: "mew-projects-agent-context"
parent: "mew-projects"
title: "Project Document Guidance and Initialization"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-07"
status_hash: "492f31ebed338f0e6fed7a6f097c12a72a55ed8cdd0e4c9a40067fe05dbed748"
files: ["src/components/docs-agent-context.tsx", "server/project-setup.ts", "server/project-setup-routes.ts", "server/agent-context.ts", "server/project-agent-settings.ts", "server/agent-guidance.ts", "server/prompts/agent-guidance.txt", "shared/agent-guidance.ts", "shared/agent-build-verification.ts", "src/components/agent-guidance-settings.tsx", "src/components/agent-build-verification-fields.tsx", "src/components/agent-guidance-scope-copy.ts", "src/components/agent-guidance-settings.css", "src/components/agent-guidance-row.tsx"]
commits: []
description: "Defines Mew-wide and project scopes in Default Instructions, focused document structure, code quality, configurable default-on build verification, additional instructions, priority, conflict preservation, and autosave in the compact settings UI. Also covers direct work on main, independent commit preferences, retirement of account branch strategies, wiki description defaults, Documents initialization, and preservation of saved instructions and existing work."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Guide agents to find and read the current project's documents and instructions first.

### Scope

- In Default Instructions next to Skills and MCP in the agent panel, configure commit method, commit language, response language, response length, subagent delegation, debugger use, code quality, document structure, and build verification, and edit the MD directly through View File.
- In **Mew-wide Instructions** and **Current Project** in the same dialog, edit account-wide instructions and the current project's additional instructions and automatic guidance setting.
- Saving Mew-wide settings applies them to the next ACP request in all projects for the signed-in Mew account, without affecting other accounts. Project instructions apply only to that project.
- Edit and preview automatic guidance, entry documents, and additional instructions in Documents settings.
- Provide a project initialization GUI and CLI that create missing documents.

### Boundaries and limitations

- Shared automatic guidance does not replace user requests or project instructions.
- Additional project instructions take priority over conflicting Mew-wide preferences. Build verification is required by default and configurable per account; concrete project commands and restrictions on execution, deployment, and server lifecycle operations remain in the project itself.
- Build verification is guidance, not an execution gate. It does not install or create build tooling, authorize deployment or server operations, or waive applicable tests, lint, documentation checks, and project restrictions.
- Document structure and code quality are independent default-on preferences. Follow project conventions and explicit requests; split documentation and code when it improves understanding, maintenance, selective reading, or testing, without arbitrary size limits, excessive fragmentation, trivial wrappers, or unrelated rewrites. Use paths and descriptions for wiki discovery and paths, headings, or text for other documents. MOC navigation and registration are optional. These preferences do not distribute this source repository's documentation layout, commands, or operational restrictions to other projects.
- The subagent delegation setting does not enable runtime capabilities or enforce blocking; it applies within higher-priority instructions and supported capabilities.
- Ordinary work uses `main` in an existing working folder for every account. Branch strategy and automatic merge settings are removed. Preserve existing work, branches, and worktrees; saving or reading guidance does not execute Git commands. Explicit user requests and repository restrictions still apply.
- Pass guidance on document entry points and the wiki description scope. Do not pass removed RAG search commands.
- Initialization follows the contract to preserve existing documents and user settings.

### Detailed contracts

- [Document Settings and Initialization](../../../../docs/guides/project-setup.md) · [Context Delivery](../../development/agent-sessions.md)

<!-- mew:implementation:start -->
## Implementation details

- Default Instructions settings in the agent panel read selections from the MD source and save only changed items.
- The Default Instructions dialog uses [the same size as the full settings dialog](../../development/ui-overlays.md#settings-window-layer) through `size="settings"` on the shared `DialogFrame` and follows the Settings popup's surface and navigation structure. The title bar is 36px, the close icon is 14px, and click targets are 24px on desktop and 32px on touch devices. Small headings, left navigation on desktop, and horizontal navigation on mobile distinguish **Mew-wide Instructions** from **Current Project**. Mew-wide settings separate General and Git groups, with labels and dropdowns or inputs on the same row. Long content scrolls within the body. The Git group contains only commit timing and commit language, with no branch strategy, automation, or details controls. Inputs and buttons are compact, with larger click targets on touch devices. View File, save status, and Refresh appear at the bottom; Refresh and Close use icon buttons with accessible names and tooltips.
- Expand the collapsed section to enter and save up to 8,000 characters of additional Mew-wide instructions, changing only the `instructions` settings section in the account MD. Preserve presets, existing freeform instructions, and directly edited content.
- Only the owner can edit the Project tab, which shows the project name and path, whether automatic guidance is enabled, and up to 8,000 characters of additional instructions. It uses the existing `.mew/agent-context.json` and retains the Documents path and entry documents. Turning off automatic guidance disables automatic delivery for both scopes.
- Retry, additional instructions, and project automatic guidance settings have no Save button. Valid values are automatically saved 400ms after the last change, with progress and completion status shown at the bottom. Invalid number inputs are not saved, and an error is displayed. Additional instructions and structured settings remain drafts until autosaved, and input is retained on errors or concurrent-edit conflicts. Reload reads the latest revision and asks for confirmation before discarding unsaved drafts. After switching projects, do not save the previous project's draft to the new project. Scope, saving, and priority follow [Decision 0061](../../decisions/0061-agent-guidance-scopes.md).
- Use View File to edit directly in the existing editor.
- Preserve existing TXT and freeform instructions, and report concurrent-edit conflicts.
- Reread the source text for the account that started the session on the next ACP request in every project. Migrate existing shared source text, model defaults, and runtime settings only once to the first owner account; do not copy them to other accounts.
- Subagent delegation offers Unspecified, Delegate Automatically When Needed, Delegate Only When Requested, and Disabled. Existing instructions do not force a selection; only the wording to pass to supported runtimes is saved.
- Automatic delegation is limited to independent tasks and instructs agents to coordinate shared-file edits, review results, and integrate them.
- Debugger Use offers Enabled and Disabled, with Enabled as the default. For existing instructions without a settings section, supplement English guidance only when reading and preserve the saved source text. Do not overwrite directly edited sections or explicit disabling.
- Enabled instructs agents to use a debugger and inspect variables and call stacks when logs and tests do not sufficiently explain the issue, comply with existing execution and permission restrictions, and clean up temporary connections and processes. Disabled instructs agents to use it only at the user's explicit request; neither value automatically installs or runs a debugger.
- The General group offers **Code quality**, and the collapsed **Documentation** group adds **Document structure** next to writing style. Both use **Apply default guidance** (default) and **Follow project instructions**, save immediately on selection, and apply from the next actual request. Code quality guides single responsibilities, cohesive small modules/components/functions, explicit interfaces and dependency boundaries, appropriate separation of domain logic from UI/I/O, clear naming and control flow, error handling, and reuse. Document structure guides focused files for a topic and reader task, useful separation of independently maintained subjects, canonical sources and links, and descriptions that support selective reading. [Project setup](../../../../docs/guides/project-setup.md#documentation-guidance) owns the documentation options.
+- The new presets use independent `codeQuality` and `documentStructure` settings sections in the account MD through the existing revision API. Existing MD, TXT, and empty sources without a section receive its default only at context-read time, preserving the stored source and revision. Explicit project selections, direct edits, damaged markers, and unrelated settings are retained. Changing either option does not alter test-writing requirements. [Passing project context](../../development/agent-guidance.md#passing-project-context) owns API and preservation details; [Decision 0117](../../decisions/0117-focused-documentation-and-clean-code-guidance.md) records the rationale.
- The General group offers **Build verification** with **Required** (default) and **Follow project instructions**. **Build details**, collapsed by default, contains an optional command, change scope, and failure repair/retry choice. The defaults use the project's documented build command after implementation changes and require repairing failures and rerunning. A blank command follows the documented package manager and uses `npm run build` for an npm build script; projects without a build system are reported as not applicable. A custom command is a single line of up to 1,000 characters. Scope can include all changes, including documentation-only work. Turning off automatic repair still requires reporting the actual failure and incomplete status. Details are disabled in project mode without discarding their values; custom sections require an explicit mode selection before replacement. [Build verification usage](../../../../docs/guides/project-setup.md#build-verification) owns the option descriptions.
- Build values are saved together in the `buildVerification` settings section as v1 metadata and matching generated guidance through the existing revision API. Existing accounts without the section receive defaults only when context is read, preserving source and revision. Direct edits and damaged sections are preserved, and unrelated setting changes do not replace them. The shared contract is in [Passing project context](../../development/agent-guidance.md#passing-project-context); [Decision 0116](../../decisions/0116-configurable-agent-build-verification.md) supersedes only the former restriction on Mew-wide build guidance.

- Ordinary tasks use `main` in the existing checkout. Do not automatically create task branches or worktrees, merge, or delete existing work. When `main` is checked out elsewhere, use that folder; report an unavailable or unsafe checkout. Explicit user instructions and repository restrictions remain authoritative.
- The Git group contains commit timing and commit language. Both remain independently editable; previous automation settings no longer disable the commit selector or suppress standard commit instructions. Pushes require a user request.
- Commit Language defaults to English and also offers Korean, Japanese, Simplified Chinese, **Follow mew Language Settings**, and **Follow Agent Response Settings**. It applies to ordinary agents and Git panel AI commits without changing response language. Resolution and captured AI input follow the [guidance contract](../../development/agent-guidance.md#language-and-response-formatting).
- Omit retired branch sections from requests for every account, including v1/v2/v3 and custom sections, while preserving saved MD/TXT, revisions, and other settings. Remove the branch field from settings snapshots and reject branch-setting writes. Damaged branch sections block delivery with 409 rather than consume adjacent instructions. The [Git working contract](../../development/agent-guidance.md#git-working-behavior) owns compatibility details, and [ADR 0156](../../decisions/0156-single-main-agent-workflow.md) records the reversal of the previous strategy and automation defaults.

- Edit and preview automatic guidance, entry documents, and additional instructions in Documents settings.

- Removed local RAG CLI and settings queries, along with automatic search guidance.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-26: Passed 53 server regression tests for commit language, preservation of existing instructions, account/display languages, and keeping the language fixed during AI commit execution, plus 8 settings UI, context, initialization, and AI panel checks. Verified six options, saving, response-language independence, and menu boundaries in light and dark settings dialogs at 1100, 390, and 320px. Passed type, targeted lint, documentation, static UI, and diff checks. A separate editor UI check also failed on main before the changes due to a timeout waiting for the Open button. No app build or server restart was performed.

- 2026-10-24: Passed 41 regression checks covering global additional instructions, project PATCH permissions, revisions, project binding, preservation of other settings, account and project isolation, context, initialization, existing Git instructions, and UI. In isolated Chromium, verified light and dark screens at 1100, 390, and 320px, the 36px title bar, 14px close icon, compact inputs, Save button contrast, per-scope drafts, conflicts, permission errors, and retry after transient save failures. Passed type, targeted lint, document description, link, static UI, and diff checks. Mew's execution restrictions were recorded only in project settings; no app build or server restart was performed.

- 2026-10-23: Passed 56 regression tests for instructions, ACP context, project initialization, tree, catalog, watching, backlinks, and graph. Verified preservation of saved v1/v2 source text and direct edits, 36 combinations of v2 strategy, automation, and worktree settings, v3 delivery and saving, and template consistency. Passed TypeScript, full lint (existing warnings), document description, link, and diff checks. No app build or server restart was performed.

- 2026-10-22: Passed 20 regression tests for branches, automation, settings UI, existing instructions, and context in the integrated version based on the latest main. Passed type, targeted lint, document description, and link checks. This verification confirms source integration, not application to the running app. After the user builds and restarts, close and reopen existing agent tabs to use the new delivery path.

- 2026-10-22: In isolated Chromium UI tests, verified the shared settings dialog size, labels and inputs on the same row, 32/44px minimum heights, Save button visibility on the default desktop screen, and no horizontal overflow at 1100, 390, and 320px. Passed regression checks for immediate saving of general instructions, Git drafts, directly edited sections, save conflicts, refresh, focus, Esc, and opening files, and reviewed light and dark screenshots. Passed type, targeted lint, document description, link, UI detector, and diff whitespace checks. No app build or server restart was performed.

- 2026-10-22: Verified default automatic local merging, remote operations disallowed by default, application of v1 defaults at request time with source-text preservation, and retention of explicit v2 manual and remote selections through 28 related tests. In isolated Chromium at 1100px and 390px in light and dark themes, checked separation of the Git group's branch, automation, commit, detailed settings, and Save controls from general instructions, along with default selection, saving, rereading, and focus. Passed type, targeted lint, document description, link, UI detector, and diff whitespace checks. No app build, server restart, or remote update was performed.

- 2026-10-22: Passed 28 related tests covering permissions, remote scope, and cleanup for the three Git automation modes, omission of the standard commit section at request time with saved source-text preservation, v1 compatibility, direct edits, damage, and account isolation. In isolated Chromium at 1100px and 390px in light and dark themes, verified mode selection, batch saving, rereading, commit selector disabling, return to manual mode, and existing conflict and focus regressions. Passed type, targeted lint, document description, link, UI detector, and diff whitespace checks. No automatic merge or push in an actual repository, app build, or server restart was performed.

- 2026-10-22: Passed 26 related tests covering branch defaults, strategy-specific instructions, preservation of existing source text and direct edits, account isolation, and delivery in the next context, plus 4 project initialization regression tests. In isolated Chromium at 1100px and 390px in light and dark themes, checked detailed settings, customization, input drafts, save conflicts, and focus, with no automated UI check errors. Passed type, targeted lint, description, and document link checks. The original existing editor integration test failed because `I18nProvider` was missing from the test screen; full verification passed in a temporary copy with only that provider added. The original test was not modified, and no app build or server restart was performed.

- 2026-10-07: Checked per-account isolation of instructions, model defaults, and runtime environment variables; migration of existing shared settings only to the first owner; prevention of repeat migration after initialization; project switching; concurrent execution; retention of the starting account for running ACP sessions; and application on the next request. Passed targeted regression tests for agent, scheduled, and Git AI execution, plus targeted lint, description, and document boundary checks. The full type check failed due to DOM types in a shared UI store and remote connection test errors from other work. No build, production server restart, or commit was performed.

- 2026-10-07: Verified debugger enabled by default, preservation of existing MD/TXT, explicit disabling, direct edits, damaged sections, and application on the next request in two projects. In isolated Chromium, verified saving and reopening Enabled/Disabled settings on desktop and mobile, menu boundaries in both themes, and existing conflict and editor synchronization regressions. Passed type, targeted lint, description, document boundary, and automated UI checks. No app build or server restart was performed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that guidance reflects the current project and Documents path and does not overwrite existing documents.

- 2026-09-28: Checked that the context actually sent through ACP excludes RAG guidance while retaining per-project guidance, queues, and reconnection.

- 2026-09-29: Checked saving the four subagent selections, preservation of other instructions, direct edits, initialization, and context application in two projects. In an isolated ACP session, verified that delegation instructions are delivered on the next request without restarting and hidden from the on-screen transcript. Passed desktop/mobile selection and reopening checks, menu boundary checks in both themes, editor synchronization and conflict regressions, and type, targeted lint, and documentation checks.

<!-- mew:validation:end -->
