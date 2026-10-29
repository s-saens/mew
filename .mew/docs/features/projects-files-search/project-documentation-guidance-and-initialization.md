---
id: "mew-projects-agent-context"
parent: "mew-projects"
title: "Project Document Guidance and Initialization"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-27"
status_hash: "492f31ebed338f0e6fed7a6f097c12a72a55ed8cdd0e4c9a40067fe05dbed748"
files: ["src/components/docs-agent-context.tsx", "server/project-setup.ts", "server/project-setup-routes.ts", "server/agent-context.ts", "server/project-agent-settings.ts", "server/agent-guidance.ts", "server/prompts/agent-guidance.txt", "shared/agent-guidance.ts", "shared/branch-guidance.ts", "shared/branch-guidance-v1.ts", "shared/branch-guidance-v2.ts", "src/components/agent-guidance-settings.tsx", "src/components/agent-guidance-scope-copy.ts", "src/components/agent-guidance-settings.css", "src/components/agent-branch-guidance.tsx", "src/components/agent-guidance-row.tsx"]
commits: []
description: "Mew-wide and project scopes in the Default Instructions dialog, additional instructions, priority and conflict preservation, autosave without a Save button and a compact settings UI, per-account Git automation, English as the default commit language and integration with display and response languages, and the Documents initialization contract. Also explains internal worktrees and preservation of previous settings, direct edits, and uncommitted changes."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Guide agents to find and read the current project's documents and instructions first.

### Scope

- In Default Instructions next to Skills and MCP in the agent panel, configure the Git branch strategy and detailed behavior, commit method, commit language, response language, response length, subagent delegation, and debugger use, and edit the MD directly through View File.
- In **Mew-wide Instructions** and **Current Project** in the same dialog, edit account-wide instructions and the current project's additional instructions and automatic guidance setting.
- Saving Mew-wide settings applies them to the next ACP request in all projects for the signed-in Mew account, without affecting other accounts. Project instructions apply only to that project.
- Edit and preview automatic guidance, entry documents, and additional instructions in Documents settings.
- Provide a project initialization GUI and CLI that create missing documents.

### Boundaries and limitations

- Shared automatic guidance does not replace user requests or project instructions.
- Additional project instructions take priority over conflicting Mew-wide preferences. Keep project operation rules such as building, running, and restarting in the project itself; do not add blanket restrictions to Mew's default template.
- The subagent delegation setting does not enable runtime capabilities or enforce blocking; it applies within higher-priority instructions and supported capabilities.
- Branch and Git automation settings are instructions passed to the AI on the next request. Saving settings alone does not execute Git commands. Manual mode follows existing commit settings; selecting an automatic mode also grants permission to commit, verify, and merge the work within the selected remote and cleanup scope. User requests, project instructions, directly edited constraints, and branch protection remain in effect.
- Pass guidance on document entry points and description-based discovery, without requiring MOC registration for new documents. Do not pass removed RAG search commands.
- Initialization follows the contract to preserve existing documents and user settings.

### Detailed contracts

- [Document Settings and Initialization](../../../../docs/guides/project-setup.md) · [Context Delivery](../../development/agent-sessions.md)

<!-- mew:implementation:start -->
## Implementation details

- Default Instructions settings in the agent panel read selections from the MD source and save only changed items.
- The Default Instructions dialog uses [the same size as the full settings dialog](../../development/ui-contracts.md#settings-window-layer) through `size="settings"` on the shared `DialogFrame` and follows the Settings popup's surface and navigation structure. The title bar is 36px, the close icon is 14px, and click targets are 24px on desktop and 32px on touch devices. Small headings, left navigation on desktop, and horizontal navigation on mobile distinguish **Mew-wide Instructions** from **Current Project**. Mew-wide settings separate General and Git groups, with labels and dropdowns or inputs on the same row. Long content scrolls within the body. Branch strategy descriptions appear in **Branch Details**, collapsed by default, while Git automation and commit descriptions appear below their respective rows. Inputs and buttons are compact, with larger click targets on touch devices. View File, save status, and Refresh appear at the bottom; Refresh and Close use icon buttons with accessible names and tooltips.
- Expand the collapsed section to enter and save up to 8,000 characters of additional Mew-wide instructions, changing only the `instructions` settings section in the account MD. Preserve presets, existing freeform instructions, and directly edited content.
- Only the owner can edit the Project tab, which shows the project name and path, whether automatic guidance is enabled, and up to 8,000 characters of additional instructions. It uses the existing `.mew/agent-context.json` and retains the Documents path and entry documents. Turning off automatic guidance disables automatic delivery for both scopes.
- Retry, Git, additional instructions, and project automatic guidance settings have no Save button. Valid values are automatically saved 400ms after the last change, with progress and completion status shown at the bottom. Invalid number or branch inputs are not saved, and an error is displayed. Additional instructions for each scope remain drafts until autosaved, and input is retained on errors or concurrent-edit conflicts. Reload reads the latest revision and asks for confirmation before discarding unsaved drafts. After switching projects, do not save the previous project's draft to the new project. Scope, saving, and priority follow [Decision 0061](../../decisions/0061-agent-guidance-scopes.md).
- Use View File to edit directly in the existing editor.
- Preserve existing TXT and freeform instructions, and report concurrent-edit conflicts.
- Reread the source text for the account that started the session on the next ACP request in every project. Migrate existing shared source text, model defaults, and runtime settings only once to the first owner account; do not copy them to other accounts.
- Subagent delegation offers Unspecified, Delegate Automatically When Needed, Delegate Only When Requested, and Disabled. Existing instructions do not force a selection; only the wording to pass to supported runtimes is saved.
- Automatic delegation is limited to independent tasks and instructs agents to coordinate shared-file edits, review results, and integrate them.
- Debugger Use offers Enabled and Disabled, with Enabled as the default. For existing instructions without a settings section, supplement English guidance only when reading and preserve the saved source text. Do not overwrite directly edited sections or explicit disabling.
- Enabled instructs agents to use a debugger and inspect variables and call stacks when logs and tests do not sufficiently explain the issue, comply with existing execution and permission restrictions, and clean up temporary connections and processes. Disabled instructs agents to use it only at the user's explicit request; neither value automatically installs or runs a debugger.

- Branch Strategy defaults to GitHub Flow and also offers Git Flow, Trunk-Based, and Follow Project Instructions. GitHub Flow creates a short-lived work branch from the integration branch and integrates it after review and verification, reusing an appropriate existing work branch when available. Git Flow separates development and release branches, while Trunk-Based guides rapid integration of small changes.
- Group branch strategy, automation scope, commit method, commit language, detailed settings, and the Save button under Git, separate from general instructions such as response language, response length, delegation, and debugger use. Git Automation offers Use Existing Commit Settings, Automate Through Local Merge, and Automate Through Remote Updates. The default is Automate Through Local Merge, which excludes remote updates. Automatic modes instruct agents to finish committing, verifying, reviewing the diff, and integrating the current work without asking again at each Git step. Only remote mode permits fetching from the existing upstream, normal pushes, or the existing PR workflow; it does not bypass protection rules, required reviews, or CI.
- Commit Language defaults to English and also offers Korean, Japanese, Simplified Chinese, **Follow mew Language Settings**, and **Follow Agent Response Settings**. It saves immediately in the Git group and remains selectable in automatic modes. It applies to commit titles and bodies from general agents and Git panel AI commits, without changing the response language. If the existing MD lacks this section, supplement English only when reading, preserving direct edits, damaged sections, and the revision. Display locale and response language resolution and fixed AI input follow the [session contract](../../development/agent-sessions.md#passing-project-context).
- In automatic modes, omit the standard commit section only from requests to avoid conflicts with commit timing and push restrictions. Retain the saved source text and manual commit selection, and do not remove directly edited commit constraints. Disable the standard commit selector in automatic modes and reapply the saved value when returning to manual mode.
- Automatic modes with cleanup enabled also permit deleting local branches and temporary worktrees integrated as part of the current task. After a squash, verify that the actual changes were integrated rather than relying on ancestry alone; preserve uncommitted or unique changes, worktrees for other tasks or active sessions, and remote branches. Report the specific cause if failed checks, ambiguous targets, or preservation of existing changes prevent progress.
- Branch Details, collapsed by default, covers automatic detection or explicit specification of the default branch, the Git Flow development branch, work branch prefixes, worktree usage for task folders, approved merge methods, and local branch cleanup after integration. Place **Branch Details** and **Save Git Settings** on the same row, with expanded inputs spanning the full body width. Save the branch strategy and detailed values together through **Save Git Settings**; other general instructions continue to save immediately. Usage and defaults follow [Branch Instruction Settings](../../../../docs/guides/project-setup.md#git-branch-guidance).
- Automatic worktree mode recommends a separate task folder when a shared checkout or existing changes pose a conflict risk. Preserve existing uncommitted and staged changes, and do not automatically stash or reset them. Do not assume existing uncommitted changes automatically move to a new worktree. Skip branch instructions outside a Git repository.
- Guide new worktrees to use `.worktrees/<브랜치 슬러그>` in the primary checkout. Replace `/` in branch names with `-`, and locate the primary checkout through the shared Git directory and worktree registry to prevent nested creation. Before creation, check that `/.worktrees/` is ignored in the primary checkout, and give precedence to explicit user or project paths. Move existing worktrees only when requested, using `git worktree move` after checking process and session path dependencies. Follow [Decision 0054](../../decisions/0054-internal-worktrees.md).
- For existing MD and TXT files without a branch settings section, supplement default instructions only when reading. Compare v1 and v2 sections exactly against fixed legacy renderers to recognize valid selections and preserve the saved source text, strategy, and detailed values. Read v1 with local merge as the default, and retain explicit manual or remote selections in v2. In actual requests, replace valid v1 and v2 sections with the current v3 generated text, and use v3 format when explicitly saving. Retain freeform instructions and directly edited sections, displaying them as **Directly Edited Instructions** in the GUI. If Follow Project Instructions is explicitly selected, do not add automation instructions either.
- The rationale for the default strategy is in [Decision 0045](../../decisions/0045-agent-branch-guidance.md); permissions for the selected automation and preservation of previous settings are in [Decision 0046](../../decisions/0046-agent-git-automation.md).

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
