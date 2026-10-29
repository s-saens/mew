---
id: "mew-agents-features"
parent: "mew-agents"
title: "Feature-Based Development and Markdown Documents"
status: "changed"
created: "2026-09-18"
updated: "2026-10-24"
status_hash: "701eba69573a58c7cb0cae079dbdcc13ad3125808a1b999accc26f79d331606c"
files: ["src/App.tsx", "src/components/DockWorkspace.tsx", "src/utils/dock-layout.ts", "src/components/feature-development.tsx", "src/components/feature-development.css", "shared/branch-features.ts", "server/branch-features.ts", "server/branch-feature-cli.ts", "server/features.ts", "server/feature-documents.ts", "server/feature-document-tree.ts", "server/document-pages.ts", "server/feature-service.ts", "server/feature-agent-instructions.ts"]
commits: []
description: "Preserves previous contracts and verification records for the feature panel, branch work ledger, feature document API, and execution queue removed on 2026-10-26. Current behavior follows ADR 0065."
상위파일:
  - "../features/terminals-agents-automation/MOC.md"
  - "../features/terminals-agents-automation/_terminals-agents-automation.md"
---

> The feature panel and its dedicated API, CLI, and execution queue were removed on 2026-10-26. This document is a historical record. Follow the [removal decision](../decisions/0065-remove-feature-panel.md).


## Requirements

- Provide the dock's **Features** panel as a task list organized by local Git branch in the current project. Do not display the existing Documents feature document hierarchy in this panel.
- Show each branch's title and task description, checked-out worktree, latest commit, and uncommitted change count together. Do not restrict the list to the `feat/` prefix.
- Save preview ports and paths, verification records, and user verdicts for each branch. Distinguish **Port Settings** from **Open in New Tab**; opening launches the `/포트번호` entry point at the current Mew access address in a new browser tab.
- Distinguish port connectivity from verification records and user verdicts. Do not infer that checks passed or user verification is complete merely because the app is running.
- Do not switch branches, create worktrees, build, start or stop servers, or merge from the panel. Preserve existing agent Git automation settings and execution restrictions.
- Preserve existing feature documents, the document editor, Markdown storage, APIs, CLI, execution queue, and report history. Do not automatically migrate or delete documents or execution records as part of this screen change.

### Related documents

- [How to check work branches and use previews](../../../docs/guides/projects.md#기능-패널에서-작업-브랜치-확인)
- [localhost app preview](../development/port-preview.md)
- [Saving and managing document pages](../development/document-pages.md)

## Detailed behavior

The current screen follows [Decision 0049 — Branch-specific tasks and previews](../decisions/0049-branch-feature-previews.md). Markdown feature documents and the existing execution service follow the preservation scope in [ADR 0159 — Execution](decisions/0159-mew-feature-driven-development.md), [ADR 0161 — Markdown canonical source](decisions/0161-mew-feature-markdown-source.md), and [Agent sessions](../development/agent-sessions.md).

### Usage flow

1. Open a project and press the **Features** button in the desktop or mobile dock. The default **Work Branches** list excludes the base branch; view all local branches under **All**. You can search by title, branch name, or task description.
2. Check the branch, worktree, change count, and latest commit in the task row. Expand settings to save the task title, description, verification records, and preview port and path.
3. Run the app separately in that worktree, save the port and path through **Port Settings**, then try it yourself with **Open in New Tab**. Settings focuses the port input directly, and can focus it again even while the same settings are open. Show the open button beside the port, path, and connection status, and edit a registered port through a separate settings icon. The open button does not run or build the app.
4. Record the review result as **Pending** (`pending`), **Verified** (`verified`), or **Needs Fix** (`needs-fix`). Saving a verdict does not perform a Git merge or change the agent's Git settings.

### Branch and worktree status

- Read actual local branches and worktrees registered with Git without connecting to a Git remote repository. Distinguish the base branch from the branch checked out in the current project, and provide the hash, title, and timestamp of each branch's latest commit.
- Read staged, unstaged, and untracked file counts from checked-out worktrees. Uncommitted status cannot be calculated for branches without a worktree; do not classify them as clean working directories.
- Save task titles, descriptions, verification, verdicts, and preview settings by branch name in `mew-branch-features.json` in the Git common directory. Other worktrees in the same repository read the same settings, and this file does not modify project source or the existing `docs/features/`.
- If this is not a Git repository, explain that status instead of showing an empty branch list. Access requires agent and Git features and full-project read permission; saving requires full edit permission. Do not expose other worktree information or the branch ledger to accounts restricted to a subset of files.

### Previews and verification

- A preview consists of a port and an optional subpath. Distinguish between port not configured, reachable, unreachable, and unknown (`unknown`). Check TCP connectivity to the host's IPv4 and IPv6 loopback addresses, each with a 250ms limit, only for queries with **localhost App Access** permission. Do not connect to ports when permission is absent or when only saving or performing CLI operations. Do not check HTTP response content, test results, or whether the running process was started from that branch.
- When the user presses the button, append the port and path to the current Mew address and open a new tab. Reuse existing authentication, permissions, and isolated origins for domains, Tailscale, and Mewlink; do not save arbitrary external URLs or open them automatically. If **localhost App Access** permission or a public access address is missing, disable opening and display the reason. Provide a retry button if the access address lookup fails. Users with preview permission can open previews even when task settings are read-only.
- When no port is configured, provide **Port Settings** without showing a new-window icon. If the port does not respond, show guidance to run the app and check the registered port, and retain the open link so users can reconnect.
- For each branch, run the app from its worktree on a different port. Prepare database, upload, and configuration separation in the app's runtime environment; this panel does not replicate or isolate data or manage processes.
- Verification records are text in which the user or agent records commands actually run and their results. Records alone do not automatically produce a successful check result or user verdict.
- User verdicts are tied to the commit and worktree change state. If the commit or uncommitted file state changes, the verdict is displayed as **Pending confirmation** so that previous results are not read as approval of the latest code. Validation records remain as supporting text and are not treated as results rerun against the latest code.
- When saving a verdict in the UI, send the `revision` received when editing began as `expectedRevision`. If the code state has changed in the meantime, reject the save with 409 and do not apply confirmation results written for the previous code to the new code.
- If a verdict save is rejected because the code changed, use **Recheck against the latest state** to load the latest baseline. Preserve existing input, review the latest code, and then apply the verdict with **Save**. Reloading the baseline alone does not automatically save the verdict.

### API, CLI, and UI boundaries

Use `GET /api/features/branches` and `PATCH /api/features/branches` for retrieval and saving. Pass the current project's `workspace`; this ledger is separate from the existing `/api/features` document and execution API. The panel refreshes every 8 seconds while visible, and retrieval, project switching, or save failures must not overwrite input being drafted. Git branch names are separate from title aliases and are not renamed in this UI.

Agents can record the state and preview settings of their working worktree as shown below. If `--cwd` is omitted, use the current folder; if `branch` is omitted from the JSON, use that folder's current branch. Change only the supplied fields among `title`, `notes`, `validation`, `review`, `previewPort`, and `previewPath`; `previewPort: null` disables the preview.

```bash
printf '%s' '{"notes":"로그인 구현","previewPort":5101,"previewPath":"/","validation":"node --test server/example.test.ts 통과"}' \
  | node /path/to/mew/server/branch-feature-cli.ts --cwd /path/to/worktree
```

The paths, ports, and check results above are usage examples. Record only ports that are actually running and checks that were performed; the CLI does not launch the app or perform checks for you.

The project's agent guidance tells agents to use this CLI to record the title and work details when starting implementation and actual validation results when finishing. `--cwd` points to the worktree of the actual working branch, rather than the project where the request originated. Record preview ports only for apps that are already running or have separate authorization to run. This guidance does not grant additional permission to run builds or servers, and agents do not assign `verified` on the user's behalf. Branch verdicts do not change the selected automatic Git processing or block or execute merges.

The feature UI retains the existing `kind="features"` work panel and 36px title bar, dock, docking, resizing, and mobile layout. The work list and expanded settings display without horizontal overflow even on narrow screens, and familiar actions use icon buttons with accessible names and shared tooltips. Selection controls use the shared `SelectField`.

Unsaved settings are stored in the same browser tab's `sessionStorage`, separated by account, connected instance, and project. Switching to another project and back or refreshing the page restores the branch, input, and editing baseline; these are cleared after a successful save or an explicit discard of the draft. Drafts are not applied to other accounts, instances, or projects. If browser storage is blocked, drafts remain only in the current page's memory, so recovery after a refresh is not guaranteed. Values with an invalid storage format or exceeding field limits are not restored.

## Preserved Markdown feature document and execution contracts

The documents, queues, reports, and status hashes below are contracts of the existing API and CLI. They are not linked to or automatically migrated to the new branch work list or per-branch user verdicts. The feature panel does not use this API to request, stop, or retry work.

### Execution and restoration

- The following are the existing API, CLI, and execution service contracts. The feature panel does not request, stop, or retry work.
- Run one request at a time through a per-project FIFO queue. Other project queues are independent. Block duplicate requests while an explicit redelegation of the same feature is queued or running. Accept up to 50 queued and running requests combined and 2,000 feature items.
- Requests capture the set's runtime, model, and role, along with its project and Documents connections. Editing the set or switching projects does not change accepted requests. Immediately before execution, recheck the requesting account's permissions to modify all agents and project files.
- Use the existing independent supervisor for the `feature_<request UUID>` tab. Send the prompt after confirming session readiness and model application. Login and approval waits appear in the history and are handled through **Open conversation**. Opening the conversation connects to the same tab without sending an additional implementation prompt.
- Save `dispatchedAt` immediately before delivery. Restoration connects only to the existing supervisor, and requests with a recorded intent to send are not automatically resent. Requests not yet sent may be delivered after the session is ready. If restoration is impossible or the send boundary is uncertain, the user checks the conversation and submits another request.
- Closing the browser or switching projects leaves work running. **Stop** removes the request from the queue or sends an execution cancellation and blocks the next request until completion is confirmed. Cancellation before sending completes immediately. Server shutdown closes only the monitoring connection and does not kill the supervisor.
- Both a valid report and a normal turn end are required for the `implemented` status. If a report is missing, termination is abnormal, or restoration is impossible, provide the failure reason and a way to submit another request. Do not infer success for work whose supervisor has also disappeared.

### Shared agent interface and storage

`server/feature-agent-instructions.ts` attaches the same classification, implementation, and result reporting instructions to every set. Sets are execution presets and do not own the ledger or classification rules. Agents use the absolute-path commands included in the instructions.

```text
node <feature-cli.ts> <feature store directory> <workspace> <request UUID> list
node <feature-cli.ts> <feature store directory> <workspace> <request UUID> assign
node <feature-cli.ts> <feature store directory> <workspace> <request UUID> report
```

`assign` and `report` each accept one JSON object on standard input. `assign` checks the new/update/child classification, full requirements, classification reason, and target ID/version. `report` accepts the implementation description, validation, project-relative files, repository-relative paths, and actual commit hashes. Reject path escapes, symlinks pointing outside, nonexistent files, and false commits. Link deleted files only when their deletion is confirmed in the linked commit. Results without commits are also valid, and automatic commits are not instructed.

### Markdown canonical source and execution records

The canonical source for features is **Markdown under `features/` in the Documents folder configured for the current project**. If the default Documents folder is `docs`, use `docs/features/`. Read ordinary Markdown files without frontmatter or dedicated delimiters as well.

An item without children is `이름.md`; an item with children is `이름/_이름.md`. When the first child document is created or moved in, move the existing parent body to the representative file. When the last actual child is deleted or moved out, convert the parent to a single file and remove the empty folder. If attachments or hidden files remain, preserve the folder as in Documents. Renaming a parent changes the folder, representative file, and child paths together. Use the operations in the [Documents page contract](../development/document-pages.md); creation and title/parent changes through the feature API and CLI use the same structure and link adjustments.

For example, adding `비밀번호 재설정` to `로그인.md` produces `로그인/_로그인.md` and `로그인/비밀번호 재설정.md`. Display spaces, Korean characters, and letter case in filenames unchanged as titles. New names from the API and CLI receive the same filename sanitization as tasks, and duplicate names are rejected as conflicts without overwriting existing files.

| Location | Managed content |
| --- | --- |
| File and folder paths | Title and parent hierarchy. `title` and `parent` metadata are not the basis for reading them |
| Optional frontmatter | Existing fixed `id`, status, dates, content verification hash, related files and commits, and user-added metadata |
| Markdown body | Free-form document content such as feature descriptions, requirements, implementation, and validation |
| `DATA_DIR/features/<sha256(workspace)>.json` | Storage format 2: execution queue, sets, conversations, per-request result history, and save recovery information |

When a feature document is opened in the Hotview editor, frontmatter `files` values appear as small 12px file links styled like links in the body. Each link opens a file relative to the project root rather than the feature document folder. `commits` uses the same tag component as existing selection values, showing the first 7 characters of the hash and providing the repository, full hash, and commit subject in a tooltip. Long paths and multiple tags wrap on narrow screens. Display alone does not change the YAML, and editing array values with the edit button preserves the string array for `files` and the array of objects with `repository`, `hash`, and `subject` for `commits`. Save on Enter or focus change, cancel on Esc, and do not save invalid arrays. In read-only mode, file links can be opened without an edit button. Explicitly specified property types or values in other formats follow the existing display and editing behavior.

Preserve existing `id` values to link execution history. If omitted, generate an ID from the current relative path; an external rename may therefore produce a new ID. When the API or CLI saves or moves a document, record a fixed ID. Preserve and update existing `title` and `parent` as compatibility metadata, but prioritize actual filenames and folder relationships. If an ID is present, it must contain 1–128 letters, digits, underscores, or hyphens. Dates are ISO strings; use file timestamps when omitted. Related files and commits retain the existing path and hash format checks, and their actual existence is also verified when results are reported.

Persistent statuses are `changed`, `implemented`, `verified`, and `needs-fix`. Calculate `implementing` only when the server execution and document version match, and do not store it in the file. `status_hash` ties the status to the title, body requirements, and actual parent ID. If the hash is missing or the content, title, or parent differs, read the status as `changed` without automatically rewriting the original verdict. When the user assigns a verdict, record the current hash with it. The file version includes the path and full content, so external renames also prevent previous execution results from overwriting it.

Record API and CLI results using the existing `## 구현 내용` and `## 검증` headings and `mew:implementation` and `mew:validation` delimiters. Reading allows blank lines and notes between delimiters and headings, and delimiter examples in code blocks remain ordinary body content. Do not reject the entire list because of incomplete delimiters or repeated result headings. Preserve ordinary Markdown that does not use dedicated sections as well. The feature API and CLI preserve user-added frontmatter, comments, and existing results.

When new results complete for the current version, update the implementation and validation descriptions and merge related files and commits. If the document is edited during execution, keep the previous execution results only in request history without overwriting the latest document. Do not duplicate directly edited feature documents into separate specification documents. Keep installation, operations, shared guidance, and ADRs in their existing owning documents. Do not automatically convert or delete all existing docs.

#### External editing and Git

- The document editor, general-purpose editors, and shared CLI use the same files. Documents are read on retrieval, so external additions, edits, renames, and deletions appear on the next refresh. Read externally added files as `changed` according to the status hash rules without automatically running an agent.
- Check concurrent edits using an opaque version derived from the entire file content. Do not interpret version magnitude as chronological order. The feature API and CLI reject saves as conflicts if the version differs from the expected version. The current branch work panel does not call this document editing API.
- Root-level `features/MOC.md` and `README.md` and hidden files are not read as features. MOC and _MOC in internal folders are read as the corresponding parent item only when no representative exists. Parent files with the same name in the old format are also supported. Duplicate IDs, invalid YAML, and symbolic links are reported as errors and are not overwritten. Limits are 512KB per document, a folder depth of 16, and 2,000 features. API input limits remain 40,000 characters each for requirements and implementation descriptions, and 20,000 characters for validation.
- When mew saves a feature document, it also updates the managed block in `features/MOC.md` and the entry link in the Documents `MOC.md`. Preserve the rest of the user-written index content. If a rename or deletion was performed only externally, manually correct MOC links under the ordinary document rules until the next mew document save.
- Sharing Documents and the project's Documents settings through Git allows a fresh clone to read features, hierarchy, results, and user verdicts. Running status, conversations, and request history remain in server data and do not follow the clone. Do not create automatic Git commits.

#### Legacy data migration and recovery

After the changes are applied to the server, detect and migrate legacy format 1 JSON during feature retrieval or CLI access with modification permission, or during execution service recovery. Write existing IDs, hierarchy, statuses, and completed results to Markdown, preserving queue version links and execution history. Keep the original in `<sha256(workspace)>.json.v1-backup` beside the same server file. If Markdown with the same ID already exists, stop migration without overwriting it because the original must be checked. Do not migrate on read-only retrieval alone.

The API and CLI use the same interprocess lock. First record the plan for creation, source deletion, link updates, and MOC writes needed to move documents in the server JSON's `pendingWrites`, then clear the plan after completing atomic replacement of each file. If execution stops midway, recognize changes already applied and recover the remaining writes. If external edits are detected, preserve the affected file and plan and display an error. Full transaction isolation from external editors that do not use the lock is not guaranteed.

Before resolving recovery conflicts, separately back up the indicated documents and execution JSON. Compare the affected paths and planned content (`content`) in `pendingWrites` with the external changes. Restoring the expected previous content (the SHA-256 in `before`) or matching the planned content allows recovery to proceed on the next retrieval or CLI access. Merge the preserved external changes back in after recovery. Do not delete `pendingWrites` or server files without identifying the cause. Do not edit JSON directly for ordinary edits, and include both the project's Documents and the server features directory in backups.

The API provides retrieval, request, editing, verdict, and cancellation routes under `/api/features`. The optional `edit` in `POST /requests` is the full `{title, content, parentId, summary, validation}` specification and is sent with `targetId` and `expectedVersion`. Saving and queue creation are handled under the same interprocess lock and `pendingWrites` recovery unit, and the saved document version fixes the request's target version. If existing queue, version, hierarchy, or size validation fails, change neither the specification nor the request. The server captures the document versions before and after editing and the original version in execution history, and compares the bodies of retransmissions with the same request ID. Reapplying the same content after a response failure uses the same ID, preventing duplicate execution. If the current project differs from the request workspace, return 409. Retrieval requires the agent capability and permission to read all files; changes require permission to modify all files. Do not expose the ledger to accounts with partial file restrictions. Apply existing file API permissions to opening files and Git permissions to commit details. Use the CLI within the same OS trust boundary as the agent shell.

### Existing document and execution validation and current limitations

`server/feature-documents.test.ts` checks Markdown round trips, external edits, cloning, migration, and recovery conflicts; `server/features.test.ts` checks lifecycle, concurrent modifications, hierarchy, paths/Git, and the existing CLI; `server/feature-service.test.ts` checks queues, login/model waits, cancellation, permissions, and restoration. `server/feature-host.test.ts` uses an actual independent supervisor and an ACP test agent to verify model application, CLI reporting, and restoration of the same conversation. The earlier UI validation records below describe results for the document hierarchy panel at that time and are not validation evidence for the new branch panel. They do not guarantee implementation quality from actual paid AI or behavior on physical mobile devices.

Update the existing document and execution API and the new branch list separately. The user performs builds and applies changes to the server according to the [Execution and validation rules](../development/getting-started.md).

<!-- mew:implementation:start -->
## Implementation details

### 2026-10-22 Per-branch work and previews

- Changed the feature panel to a work list organized by actual local branches and worktrees and connected the existing `/포트번호` preview. Work details, validation, and user verdicts are stored in the Git common directory, while the existing Markdown documents and execution API are preserved.
- Applied user verdicts tied to code state and conflict checks, and restored unsaved settings in tab sessions separated by account and project. After a save conflict, users can load the latest baseline and continue their draft.

### Previous document hierarchy panel

The records below cover the document hierarchy panel implementation through 2026-10-06.

- `FeatureTreeNode` uses the same 14px hierarchy spacing as the sidebar, with a 1px vertical line 2px left of center and 4px bullets. Per-node stacking isolation keeps ancestor lines visible above descendant sticky rows, and measuring actual parent row heights keeps sticky positions aligned without gaps even after save errors or width changes. Existing title editing, document opening, and state restoration are retained.

- Read titles and parent relationships from filenames and folders, without displaying parent representative files again as separate children.
- File-based item creation, renaming, and parent moves preserve body content, relative links, and execution version links. Duplicate names and external changes are not overwritten.
- Removed panel body sections and the commit details popup, simplifying the panel to a tree of titles and children only. Document opening and existing UI state restoration are retained.
- Changed titles to directly editable input fields and made source documents open only through the document icon. Saving a title checks the version from when input began, while file and folder renaming and link adjustments reuse the existing API. Failed saves preserve input, and periodic retrieval does not overwrite it.
- Applied a dedicated appearance to the sort selector to remove the large input field border, and reduced spacing in the toolbar, buttons, and selection rows. Reuses the shared selector's accessibility, selection persistence, and overlay behavior.
- Move existing feature documents to filenames matching their titles and the parent representative structure, adjusting document maps and incoming links.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-22: Verified local branches, worktrees, CLI, permissions, port status, and verdict versions with `server/branch-features.test.ts`, and desktop/mobile previews, saving, draft preservation on failure, per-project restoration, and 409 recovery with `server/feature-ui.test.ts` in isolated Chromium. Preview URL and demo/theme panel regression checks also passed. The 3 checks in `src/utils/branch-feature-draft.test.ts` for account, project, and instance isolation, stored value validation, and preservation on storage failure, along with document checks, passed. Builds, application to the production server, and verification of actual user app behavior were not performed.

### Previous document hierarchy panel validation

The records below describe results for the document hierarchy panel at that time.

- 2026-10-06: Verified three-level sticky parent rows, gap-free layout, ancestor line pixels, and bullets on desktop and mobile in both themes with `server/feature-tree-ui.test.ts`. Layout of rows expanded by save errors, releasing sticky positioning at the end of child lists, collapsing, and document opening also passed. Existing `server/feature-ui.test.ts`, TypeScript, targeted lint, and document allowlist checks also passed. The workspace link check failed because 3 untracked task documents outside this work were not linked from MOCs. Builds and application to the server were not performed.

- 2026-10-06: Verified desktop/mobile inline title editing, saving on Enter and focus change, cancellation with Esc, input preservation during retrieval, preservation of input and source text on external change conflicts, file and child path renaming, and read-only accounts in isolated Chromium. TypeScript, targeted lint, and document allowlist checks passed. The workspace link check failed because 2 existing untracked task documents were not linked from MOCs. Builds and application to the server were not performed.

- 2026-10-06: After polishing sorting, used `server/feature-ui.test.ts` to verify desktop dark mode with 28px buttons, a 160px menu, and 28px rows; value preservation during keyboard navigation, focus retention on Esc, and sort restoration; and mobile light mode at 320px with 32px buttons, 36px rows, touch selection, and viewport boundaries. TypeScript, full lint (only existing warnings remained), document allowlist, and workspace link checks passed. Builds and application to the server were not performed.

- 2026-10-06: Passed 36 feature, document page, execution service, independent supervisor, and desktop dark/mobile light UI checks, along with TypeScript, full lint, and document allowlist checks. The full document link check still has only 1 missing MOC link for the existing untracked `docs/하이.md`. Builds and application to the server were not performed.

### Earlier UI and execution validation records

- 2026-10-04: Verified immediate display of requirements and child features, removal of per-group collapse buttons, collapsing and expanding child features themselves, and requirements displayed with 12px text, secondary color, and mobile layout in isolated Chromium. Passed 5 related UI and Markdown tests, type checks, targeted lint, and document link checks.

- 2026-10-04: Verified read-only UI, no calls to change APIs or agent set retrieval, opening documents, files, commits, and conversations, collapsing and expanding, UI state restoration, and mobile behavior in isolated Chromium. Type, lint, and document checks passed. The workspace switching integration check failed with a timeout at the `extra.md` selection step before entering the feature panel.

- Verify that the same feature icon used in the dock appears before the title in desktop and mobile title bars.

- Verified inline requirements/implementation editing and work submission, set selection, conflicts, retries after failure, draft preservation, related evidence, child features, mobile behavior, and permissions through server, Markdown, queue, independent supervisor, and isolated Chromium UI tests.
- Implementation quality from actual paid AI requires separate user verification.
- 2026-09-25: Unit-test Markdown rendering, source range preservation, and hiding duplicate navigation information, and verify direct title editing, collapsing via icons, draft protection, link opening, read-only behavior, and mobile touch behavior in isolated Chromium.

- 2026-09-29: Verified the 36px title bar, desktop dragging by the handle, width resizing with the mouse, height resizing with the keyboard, draft preservation while moving, hidden handles on mobile, and layout restoration after closing, switching to mobile, and refreshing after a successful save in isolated Chromium. Passed `feature-ui.test.ts`, `workspace-switch-ui.test.ts`, `dockWorkspaceUi.test.ts`, `dock-maximize-ui.test.ts`, docking unit tests, and type, targeted lint, and document checks.

<!-- mew:validation:end -->
