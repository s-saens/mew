---
id: "mew-git-workbench"
parent: "mew-git"
title: "Current project Git operations panel"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-03"
status_hash: "ad2d450aae96362a9d082f3989ccd04643632b17559700c16044ef32ca54d690"
files: ["src/components/GitWorkbench.tsx", "src/utils/git-graph.ts", "src/utils/git-graph-branches.ts", "src/components/git-diff-editor.tsx", "src/components/git-changes-menu.tsx", "src/utils/git-diff-tabs.ts", "src/components/git-branch-picker.tsx", "src/components/git-panel.tsx", "src/components/github-account.tsx", "server/github-auth.ts", "server/github-auth-routes.ts", "src/components/git-ai-commit-dialog.tsx", "server/gitWorkbench.ts", "server/git-ai-commit.ts", "server/git-commit-analysis.ts", "server/git-commit-packets.ts", "server/git-diff-codec.ts", "server/git-change-intent.ts", "server/git-change-intent-cli.ts", "server/git-ai-commit-runner.ts", "server/git-ai-commit-routes.ts"]
commits: []
description: "Project changes, commit history and graph, diffs, branch operations, worktree switching, and Pull/Push. Defines selected-change commits and discard, plus account approval, scope, and JSON recovery for AI commits by work unit."
상위파일:
  - "MOC.md"
  - "_git-history.md"
---

## Requirements

- Commit history displays only commits reachable from the current checkout's `HEAD`. It excludes unmerged commits found only on other branches, tags, or remote-tracking refs. Branch switching, separate worktrees, and detached HEAD also use the history of that checkout; branches with no commits yet display an empty list.

- The Git changes list selects by default only files whose contents match what was saved through Mew from the current connection IP. Changes from other IPs or with an unknown origin must be selected manually.

- Review changes and commits in the current project's repository and perform Git operations.

### Scope

- The default shortcut for opening/closing the Git panel is `Ctrl/Cmd+G`. User reassigned combinations in shortcut settings are preserved.

- Provides a commit graph, changed files, diffs, and commits of the checked files' working-tree contents.
- Hovering over graph lines or dots shows the associated actual branch names in the shared tooltip; clicking or pressing Enter/Space switches branches. If multiple branches overlap, a menu opens to select by name. Selecting the current branch performs no additional Git operations; tags, deleted branches, and lines without an associated ref have no switch action. Clicking a commit title retains the existing detail view.
- The log retains its current HEAD scope and passes the full ref, name, type, and hash of local and remote branches pointing to the same hash for each commit through `branches`. `repositoryBranches` also includes ref hashes. The graph associates names along first-parent paths and uses the corresponding parent paths for merge lines, preventing column reuse or search from incorrectly associating another branch. Switching uses the existing branch API; for a branch in another worktree, it switches only the working root of the same project. On failure, the error, current branch, and uncommitted changes are preserved.

#### Search and selection

- Changes search instantly filters paths case-insensitively. Plain input matches substrings; `*` matches 0 or more characters, including separators, and `?` one character. Wildcards match a whole relative path or filename. Search renamed files by both current and previous paths. Examples: `*.tsx`, `src/*`, `file-?.ts`.
- The search field aligns the search icon, input, result count, and clear button within the existing header height and uses a theme-colored focus border. Narrow panels hide the search icon and result count to preserve room for input and action buttons. X or Esc while typing clears the search; no matches produce a separate empty-results state.
- Search preserves existing selections and the commit draft. Select/deselect all and drag selection apply only to visible search results, preserving selections of hidden files. The header's selection count, commit, AI commit, and discard changes actions use the existing full selection, including hidden selections. Search persists through round trips to diffs, automatic refreshes, and closing/reopening the panel, and resets when switching projects or repositories.
- Commit History has the same header search field and controls: count, X/Esc clear, and empty-results state. Search only loaded commits' titles, authors, full hashes, and branch/tag refs, case-insensitively. Plain input matches substrings; `*` means 0 or more characters and `?` one Unicode character, matching a whole field. Examples: `*검색*`, `abc*`, `패널 작업 ?`.
- Retain original graph positions/colors/dots but hide connecting lines during search, avoiding relationships across omitted commits. Preserve the query through details/diffs, refresh, and reopening; reset on project/repository changes. Keep it independent of Changes search, selections, and drafts; never search the server's full history.
- Changed-file markers use green for additions/new files (`A`/`?`), red for deletions (`D`), yellow for modifications/type changes (`M`/`T`), purple for renames/copies (`R`/`C`), and red for conflicts (`U`). Combined statuses apply colors to each character while preserving the status characters and raw-status tooltip.
- A single file click highlights **general selection**, independently of checkbox **commit selection**; it neither opens a diff nor changes commit inclusion.

| General-selection input | Result |
| --- | --- |
| Ctrl/Cmd+click | Toggle that row |
| Shift+click | Select visible results from the last anchor through the clicked row |
| Ctrl/Cmd+Shift | Add that range to the existing selection |
- Right-clicking a normally selected row opens a menu for the entire normal selection. Right-clicking a row outside the normal selection selects only that file normally and opens the menu. **Include in Commit** and **Exclude from Commit** change only those files' commit selection; **Discard** discards changes after confirming the list of normally selected files. Close the menu with Esc, mobile Back, or an outside click, and navigate with the arrow keys or Home/End. Shift+F10 or the Menu key also opens it.
#### Diffs and discard

- Double-clicking a changed file, clicking its right chevron, or pressing Enter on its file button opens the diff in a **read-only tab in the editor panel**. The Git panel's list, search, selection, draft, and scroll position are preserved. Reopening the same repository, file, and diff source activates the same tab in the current editor pane, distinct from regular file tabs and diffs from other commits. File diffs in past commit details also appear in editor tabs.
- The diff header displays the filename in small text, and its document icon opens the current file in a separate editor tab. The open button is disabled for deleted files.
- Opening a diff on mobile brings the editor to the front while preserving the Git list or commit details. Going back returns to the previous Git screen. The Back button in Git commit details and priority dismissal of open popups use the existing navigation history.
- On the initial load, only uncommitted changed files whose current contents match the save record for the current IP are selected by default.
- Put Discard Selected Changes left of Commit; disable it with no selection or during processing. Confirmation lists files, irreversibility, and new-file deletion. Only after confirmation, restore selected staged/unstaged changes to HEAD and delete selected new files. Preserve unselected changes and the commit draft.
#### Commit and branch actions

- Hide the commit title and description fields by default and show them at the bottom when the commit icon at the far right of the changes bar is clicked. The input area contains title and description fields and a paper airplane send icon to the right of the title. The send button, the same commit icon, or Enter in the title field creates a manual commit; the robot icon opens AI auto-commit.
- When a touch or mouse drag starts in the file checkbox area, select every item crossed if the starting item is unselected, or deselect them all if it is already selected. Crossing the same item again preserves its state; a single tap, click, or keyboard action toggles selection.
- While dragging checkboxes, hovering near the top or bottom edge of the changes list scrolls automatically and continues selecting or deselecting newly revealed items. Releasing or canceling stops scrolling.
- While the panel is visible, automatically refresh commit history, branch information, the uncommitted changes list, and open working-tree diffs when external edits or Git operations change them.
- In AI auto-commit, select an existing agent set or create one, then use a dedicated task with the Mew commit skill to divide selected changes into work units and create actual commits.
- For large changes, index the full diff locally, then construct commits based on evidence from the changes and batch the original content of uncertain portions for additional analysis. Actual commits use the complete original content.
- Provide progress logs, cancellation, and reconnection.
- Provide branch and tag creation, detached checkout, cherry-pick, and revert.
- Remove the Git icon and title from the title bar and always display the branch dropdown in the left title position. Use it to view the current branch and search for, select, and switch to local or remote branches. Do not repeat the current branch name to the right of the commit history search field.
- In the same dropdown, specify a name and base (current HEAD, local or remote branch, tag, or commit hash) to create and switch to a new branch.
- The origin button in the title bar opens the remote repository in a new tab. Display the GitHub icon for GitHub and an external link icon for other hosts.
- Use the downward-arrow Pull and upward-arrow Push buttons in the title bar to synchronize the current branch with its upstream.
- Briefly display the actual Git progress stage and percentage inside the remote operation button, show `완료` briefly after success, then restore the default icon.
- Provide GitHub OAuth connection, account display, authorization codes, external and internal authorization, cancellation, and disconnection for each Mew account.
- Include a default OAuth app so installers can connect without registering an app, and also support a custom Client ID.
- When disconnected, commit, AI commit, and Pull/Push open the login dialog and execute only the original request once after login succeeds. Preserve the draft if login is canceled.

### Boundaries and limitations

- Do not display a list of child repositories.
- Open a child project's Git panel from that project's tab.
- Running AI auto-commit authorizes actual split commits of the selected files.
- AI auto-commit does not include changes outside the selection or push.
- AI auto-commit requires both Git and agent feature permissions.
- If the selected local branch is checked out in another worktree, use owner permissions to switch only the same project's working root to that absolute path. Preserve the project name, panel layout, editor panes and tabs, and agent and terminal tabs, and reload the explorer, open file contents, and Git from the target worktree. Display open files missing from the target as read-only errors and do not save them as new files. Do not rename or move folders, and preserve the current folder's branch and uncommitted changes on both sides. Existing sessions retain their cwd, and new sessions start in the selected working root.
- Allow worktree switch requests only for registered worktrees sharing the current working root's Git common directory. If the source root has changed, the target is missing, or validation or opening fails, display an error and preserve the current screen. If there is no other worktree, switch branches in the current folder as before.
- Complete autosaves and in-progress saves of open files before creating or switching branches. Abort the switch if saving fails, and do not apply late-arriving file saves from the previous root to the target root. Follow [Worktree Switching Within the Same Project](../../development/ui-project-navigation.md#switching-worktrees-within-the-same-project) for the shared API, cache, and restoration contract.
- The branch selection list displays local `main` and `master` first, other local branches next, and remote branches last, sorted by name within each group. Do not provide delete buttons for local `main` and `master` or any remote branches. Use the X to the right of other local branches to confirm the name and delete the branch; disable the current branch's X. Select rows using search and the Up/Down keys, access the delete button with the Right key, and return to the search field with the Left key. Focus Cancel in the deletion confirmation, and preserve the confirmation screen and error on failure.
- Local deletion also follows existing Git permission and project scope checks. The server rejects protected branches, remotes, tags, nonexistent refs, branches in use in the current folder or another worktree, and branches with commits not merged into the current HEAD. Reject branches not integrated into HEAD even if upstream contains the same commits; do not force-delete, delete worktrees, or modify remotes. On success, refresh the list and preserve the current branch, uncommitted changes, and commit draft.
- Creating or switching branches requires Git permission and access to all project files. These are local operations and do not require a GitHub connection or fetch. Do not force-switch, automatically stash, or discard changes. If Git refuses the switch, preserve the work and inputs and display an error.
- Pull/Push requires Git permission, access to all project files, and a remote-tracking branch. Pull allows only fast-forward updates, and Push sends only the current branch without force-overwriting.

### Detailed contracts

- [Project and File Usage](../../../../docs/guides/projects.md)

<!-- mew:implementation:start -->
## Implementation details

### Graphs, navigation, and discard

- `src/utils/git-graph.ts` maintains active columns by parent hash. New branches start in empty columns without shifting other branches' columns or colors. Draw lines above the current commit only when an actual preceding connection exists, and draw each passing line only once across the entire row. At merges, connect to the existing parent column and reuse vacated columns. During search, display only dots as before.

- App manages the current Git screen for each root project and connects it to the shared screen registration contract in `useWorkspacePanelDismissals`. `src/utils/git-workbench-navigation.ts` creates screen identifiers for the list, commit hash, and diff source and path. Navigation history stores only restoration callbacks for lightweight screen state, and diff content is reread through existing requests. When history is exhausted or on desktop, retain the existing navigation to the parent level.

- Apply colors by status letter in the shared changed-file list in `GitWorkbench.tsx`. Existing theme-specific semantic color tokens preserve type distinctions regardless of light or dark theme or the user's accent color.

- `POST /api/git/discard` validates Git, file write, and full-project access permissions and the current workspace. Check selected paths and the current changes list first, and also restore the original files for renames. Support discarding new files before the first commit, and reject folders, submodules, and paths beneath symbolic links. Run without a GitHub connection or remote operations. The shared dangerous-action confirmation dialog initially focuses Cancel and sends no request on Cancel or Esc.

- Handle drag selection through pointer capture in the checkbox area. After movement of at least 5px, lock the opposite of the starting row's selection state for the entire drag and apply it between the starting and current rows. Prevent the final click from toggling the checkbox again or opening a diff. Touches starting outside checkboxes retain list scrolling. Within 40px of a list edge, scroll each frame in proportion to the pointer position and apply the same selection state to newly revealed rows. Cancel the animation frame on completion, cancellation, list changes, disabling, or unmounting.

- Convert the origin fetch URL from the repository query into an HTTP(S) link without credentials and display it to the right of Pull and Push. Convert SSH, SCP, and Git addresses to HTTPS and remove the `.git` suffix. Hide the button if origin is missing or cannot be converted to a web address. It can open in a new tab without a GitHub connection.

### Branch selector

- `GitWorkbench.tsx` portals the branch dropdown into `git-panel.tsx`'s left title slot, showing the current branch or detached HEAD. Opening queries local/cached-remote branches and tags for base selection. Search is case-insensitive; arrows/Enter navigate, and Esc/Back closes only the top popup.

| Dropdown geometry | Value |
| --- | --- |
| Maximum width | 280px |
| Search/list padding | 6px / 4px |
| Row height | 28px desktop; 40px touch |

Clamp to mobile viewport bounds and ellipsize long names. Share hamburger background/border/opacity/blur without a separate shadow; `data-inline-listbox` prevents double background/blur. Mark the current branch with a left check/accent and the navigated row with a rounded background. Keep search/New Branch visible while the list scrolls; use the shared compact base selector on creation.
- The new branch form accepts a name and a base through the shared searchable `SelectField`. A commit hash can also be entered directly. Switch immediately after creation. Selecting a remote branch directly creates and switches to a local branch that tracks it; creating a branch with a new name and only a base does not automatically set an upstream. Preserve the commit draft and selection of remaining changed files.

### Panel controls and manual commits

- The author field in commit history occupies only the width of the name, with a maximum width and ellipsis applied only to long names. The row's right padding is 8px.
- Changed-file status marks (M, A, D, etc.) use the character width plus 4px padding on each side, without a fixed width. Reduce the gap between the checkbox and mark to 10px in the main list and 14px in the detail list, approximately 2/3 of the previous spacing.

- Display `변경사항` as the changes bar title, remove the manual refresh button, and retain existing automatic refresh. At the far right of the bar, display the Git commit icon button followed by the AI auto-commit robot icon button. Standardize the title field and button height at 28px; both buttons are 28×28px squares with 14px icons. Keep the same sizes on mobile. On hover, immediately show the existing translated text as a tooltip and retain accessible names.
- In a 36px top bar matching other panel tab bars, display the branch selector on the left and operation, account, and close buttons on the right, with the shared drag handle on desktop. Do not display a fixed Git icon or title.
- Keep the top bar visible in detail, diff, loading, and no-repository states, with the body starting below it.
- Provide the GitHub login button and connected account information to the left of the close button in the panel header, and do not provide child repository selection.
- Display Pull and Push buttons at a default size of 24×24px with 14px icons. Maintain a height of 24px during operations, with progress text at 10px and 4px horizontal padding.
- Keep the branch selector on the left regardless of panel width and truncate long names with an ellipsis within the remaining space.
- Display Pull and Push icon buttons, in that order, to the left of the GitHub account. Prevent duplicate requests during execution, refresh the list after completion, and preserve the commit draft and file selection. Display failures in the panel's existing error area.
- Show actual stages such as `Push 중…`, `압축 42%`, and `전송 68%` on one line in the active remote button. At 100% transfer, show `확인 중…` until Git exits successfully; then show a check and `완료` for 3 seconds before restoring the icon.
- Add no global toast/log panel. Preserve branch-control space in narrow panels, ellipsizing account/branch names to avoid progress overlap. Never mark failures/disconnects complete, rerun automatically, or apply stale events after project switching/unmount.
- Initially show history and changed files with checkboxes at 50:50, with composition hidden. Preserve user divider adjustments; reset to 50:50 on project/repository changes. First Commit click opens bottom title/description fields and focuses title. Composition defaults to about 1/3 of changes height; lists retain their adjusted ratio/minimums.

| Manual-commit action/state | Behavior |
| --- | --- |
| Send right of title, Commit again, or Enter in title | Require a title and selected files |
| Send during processing | Disable; retain icon-only appearance, shared tooltip, and translated accessible name |
| Success | Clear draft and hide fields |
| Failure/login cancellation | Preserve draft and keep fields open |
| X right of Send | Hide fields without losing draft; focus Commit in Changes; reopening resumes editing |

The X remains 28×28px with a 14px icon, shared tooltip, accessible name, and disabled processing state. Robot opens existing AI auto-commit without opening manual fields.
- The composition area has 8px inner padding and 6px spacing between fields and buttons. Its minimum height is 128px, and the description field uses the remaining height.
- The composition area displays title and description fields and a 28×28px send button with a 14px paper airplane icon to the right of the title. Its background uses the terminal and agent body's `surface-deep` color, and its fields use the agent input's `surface` color. It follows light and dark themes, and its height can be adjusted by dragging its top border with a mouse or touch. Use the same border highlighting and 12px interaction area as the agent input, and also support arrow keys and Home/End.
- Display `선택 파일 수 / 전체 변경 파일 수` to the right of the Select All checkbox and to the left of the `변경사항` title. Preserve the numbers even at narrow widths and truncate the title with an ellipsis. Remove the selected count below the commit composition fields.
- Each list scrolls independently, and its height ratio can be adjusted by dragging the divider or using the keyboard. When the commit fields are closed, the changes area's minimum height is 78px (a 36px title bar plus 1.5 file rows at 28px each). Calculate the split limit based on panel height so the area can shrink to this height. When the fields are open, retain the existing 224px minimum height.
- Display commit time using only the largest applicable unit among minutes, hours, and days.
- Removed the duplicate project root text and empty top bar.
- The diff header filename is 10px (reduced by 4px from 14px), and a 28×28px document icon button on the same line opens the file in the current project. Use the existing file-opening flow to bring the editor to the front on mobile while preserving Git panel state. Disable the open button for deleted files.
- Preserve normal selection and commit selection separately in the main list, open diffs in editor tabs, and commit selected files from the Git composition area. Do not send virtual diff paths to file content, rules, autosave, collaboration, or presence APIs. Share the editor tab restoration, closing, reordering, and split lifecycle with regular tabs.
- Preserve the staging state of unchecked files.
- On initial panel entry or project switching, select only changed files saved from the current IP. Subsequent refreshes and automatic updates preserve the user's selection.
### Automatic refresh

- While Git is visible, query history, branches, and changes every 2 seconds after completion. Independently, the visible editor's active working-tree diff queries every 2 seconds, even with Git hidden; vanished changes show an empty state.
- Keep unchanged history/branch state. Always requery open diffs because content can change without a status change. Preserve drafts, remaining normal/commit selections, and scroll; never auto-select new files.
- Pause queries when Git is closed, another mobile panel is selected, another desktop panel is maximized, or the browser is hidden. Requery on visibility/window return. Never duplicate slow requests or accept stale replies after closing, navigation, or manual refresh. Automatic failures retain content, show an error, and retry on the next query.
### AI commit execution

- AI auto-commit analyzes only selected files, fixes the agent set's runtime, model, and roles for the task, and creates a plan by work unit in dedicated tmux and ACP sessions; Mew then executes multiple commits.
- For malformed plan, intermediate-analysis, or original-content-request JSON, ask to repair only that response up to 2 times and show recovery progress. Handle code fences/comments/trailing commas directly; do not guess missing syntax locally. Recovered replies still need file/fragment omission, duplicate, and scope checks. Failed recovery shows Korean guidance, makes no commit, and preserves staging.
- Losslessly compress the fixed-snapshot full diff with 3 context lines, sharing repeated lines, prefixes/suffixes, and identical changes without dropping fragments. A single packet needs 1 plan; multiple packets are fully analyzed in parallel pairs before planning.
- Use intent records only when old/new objects match; never skip full-diff analysis. Size, excerpts, or the former maximum of 3 attempts cannot skip content. Check selected-file coverage/duplicates and post-analysis changes; retain only actual uncertainties with reasons.
- Support model ID formats from older Codex sets in the current connector, and record the stage and detailed error in status and progress logs on failure.
- Follow the [Execution and Storage Contract](../../development/agent-sessions.md#git-ai-commit-jobs).
### Account connection

- The GitHub login popup uses a default maximum width of 384px, 12px horizontal padding, and 6–8px spacing between groups. Provide Close, Copy Code, External Authorization, Refresh, Cancel, and Disconnect as 28px icon buttons with translated accessible names and tooltips. Retain short labels for starting login and internal authorization, and indicate successful code copying with a check icon and an accessible status. Preserve the internal authorization screen, errors, cancellation, and reconnection behavior.
- GitHub OAuth device authorization and tokens belong to each Mew account, which starts disconnected. Do not import OS authentication.
- Apply the commit author, committer, and remote credentials per execution. Follow the [Git Connection Contract](../../development/git-connections.md) for provider extensions, fixing connections for AI tasks, and token storage.
- Follow [GitHub Login](../../../../docs/guides/projects.md#github-login) for usage, permissions, installation, and limitations.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->

- 2026-10-22 integration validation: The integrated version incorporating graph and branch display changes alongside comment shortcuts passed 5 graph and search unit tests, 4 Git panel and desktop keyboard Chromium tests, and type, documentation, and lint checks. The error-text expectation failure from the graph work below was corrected in the branch display changes, and the integrated regression tests also passed. Existing lint warnings remain.

- 2026-10-22: Passed 5 graph and search unit tests and TypeScript and documentation checks. Targeted lint reported 5 existing React warnings with no errors. Verified new-branch columns, starting points, passing lines, merge coordinates, and hidden connecting lines during search in Chromium. The full panel regression failed while waiting for the `Temporary Git read failure` text; the same failure was confirmed in the code before the changes. No build, server restart, or application to the production UI was performed.

- 2026-10-22: Removed the duplicate branch display in the commit history search field and verified that external branch changes appear in the top selector. Passed desktop and mobile light and dark screen checks, Git panel Chromium regression (`node --test --test-force-exit server/git-panel-ui.test.ts`), targeted lint, documentation checks, and UI detector. Aligned the regression test's expected error message with the live fixture's actual response. No build or server restart was performed.

- 2026-10-07: Verified in isolated Chromium the Git panel's normal selection, Ctrl/Cmd/Shift ranges, separation of commit selection, right-click inclusion/exclusion, confirmation/cancellation/execution of Discard for normally selected files, preservation of search/draft/scroll position, actual editor diff tabs, read-only behavior, exclusion from file/rules APIs, restoration, automatic refresh, suspension of queries while hidden, mobile Back navigation, and past-commit diffs. Passed 20 tests covering the Git panel, AI commits, server, paths, and translations, along with frontend type checks, targeted lint, UI detector, documentation description checks, and boundary checks, and inspected desktop and mobile screens. The full `tsc -b` failed due to unrelated errors in `agent-account-settings.test.ts` and `remote-access.test.ts`. No build or server restart was performed.

- 2026-10-06: Unit tests verified partial matching, case sensitivity, wildcards, and pre-rename paths in changed-file searches. Git panel Chromium regression tests verified result counts, selecting/deselecting all search results only, preserving hidden selections, navigating to and from diff, empty results, Esc/X reset, and input and action button placement at 320px. Desktop/mobile captures, type checks, targeted lint, UI detector, document description checks, and boundary checks passed. No build or server restart was performed.

- 2026-10-06: A total of 13 server, translation, permission, and Git panel Chromium checks passed. Verified preservation of staged changes outside the selection; reverting deletions, renames, new files, and changes before the first commit; rejection of invalid paths, folders, and unselected original paths; workspace and permission blocking; no requests before confirmation; cancellation; Esc; selection retention after failure; and list refresh after success. Desktop/mobile confirmation dialog captures, type checks, targeted lint, UI detector, and document boundary/link checks also passed.
## Verification

- 2026-10-26: Passed 17 unit/server checks covering branch-ref- and hash-based graph name tracking, merges, column reuse, truncated history, current HEAD queries, and existing Git operations, plus 1 Git panel Chromium checks. Verified graph-line hover tooltips, node-click failures and retries, Enter/Space, no action for the current branch, duplicate-name selection, remote switching, and navigation to worktree projects. Reviewed desktop tooltip and mobile selection-menu captures; type checks, targeted lint (existing warnings), static UI checks, and diff checks also passed. Document description checks passed, but the full link check failed due to 1 missing document link in an existing task. No app build or server application was performed.

- 2026-10-26: Passed 12 regression checks for branch sorting, local deletion, and existing Git history/operations, plus 1 Git panel Chromium checks. On 1440 and 320px light/dark screens, verified that protected branches and remotes have no X, search and keyboard access, deletion confirmation/cancellation/error retry, and preservation of the current branch and drafts. The server rejected deletion of active worktrees, branches with commits not merged into HEAD, and branches with unintegrated commits that match only their upstream. Type checks, targeted lint (existing warnings), static UI checks, and diff checks passed. Document description checks passed, but the full link check failed due to 1 missing document link in the existing task list. No app build or server restart was performed.

- 2026-10-06: Passed 13 Git panel Chromium, panel-close hook, and mobile panel-stack checks for navigation history that includes screens. TypeScript, targeted lint, UI detector, and document link checks also passed. The separate `workspace-switch-ui.test.ts` failed while waiting to select `Select extra.md` on mobile; the same failure was reproduced on the pre-change `f5663ee`.

- Acceptance criteria: On mobile, opening an editor diff tab from the Git list or commit details and going back displays the previous Git screen. General selection and commit-target selection do not affect each other, and open popups close before screen navigation. Changes to hidden Git screens and reselecting the same screen do not add history entries; changing projects or switching to desktop clears the history.

- 2026-10-06: After applying status-marker colors, Git panel Chromium regression tests, TypeScript, targeted lint, UI detector, and document link checks passed. Generated desktop/mobile captures in both themes and inspected the light desktop and dark mobile screens. All four marker colors have a contrast ratio of at least 4.5:1 against badge backgrounds in both themes.

- 2026-10-05: Existing Git panel and AI commit regression tests in isolated Chromium verified that commit fields are hidden by default, the two icons are placed in the changes bar, the title receives focus automatically, the top button and Enter perform manual commits, fields hide after success, AI commits do not open the fields, and drafts are preserved. Desktop/mobile light/dark theme captures, TypeScript, targeted lint, 3 shared UI translation checks, and document boundary/link checks also passed. No build or server restart was performed.

- Verify that the title/description fields and the refresh control in the changes bar are hidden by default, and that the commit icon on the right opens the fields and allows selected files to be committed using the same button, the send icon to the right of the title, or Enter. On desktop and mobile, close the composition area with the X close button and reopen it to verify that title/description drafts are preserved. Also verify that the send button is on the same line as the title and is disabled when the title is empty, nothing is selected, or processing is underway. The robot icon must start an AI automatic commit without opening the manual input fields. Check button placement, field colors, focus, resizing, and draft preservation in light/dark themes and on narrow mobile screens.

- On mobile, deselect all files, then drag up and down starting from a checkbox to verify that files passed over are selected, starting from a checked file deselects them, and revisiting files does not change their state. Also check single-tap and Space toggling and touch scrolling from filenames.

- 2026-10-04: Switched to lossless compression of the full diff and recording intent at the time of each change. Used temporary repositories and mock ACP to verify restoration, advance reference, full coverage of unique changes, planning in 1 pass with a single packet, source rechecks, intent-object comparison, staged-change preservation, cancellation/change detection, and cleanup after parallel failures. Passed 32 related tests, TypeScript, and targeted lint. Actual decision quality and completion time with paid models require separate measurement.

- 2026-10-04: Removed sequential summarization from the default execution for large changes and switched to a local index and at most 3 planning passes. Verified inclusion of all chunks in the list, overview input budgets, full/partial indicators, batch source requests, committing entire individual files, preservation of staged changes outside the selection, and cancellation/change detection. Passed 18 related tests, TypeScript, and targeted lint. Actual model decision quality and completion time have not yet been measured.

- 2026-10-04: Updated the behavior to accept summaries in valid JSON that exceed the recommended length and compress the existing summary 1 time only when the actual limit is exceeded. Temporary inputs and mock ACP verified exceeding the recommendation, no source retransmission during compression, uncertainty preservation, continued limit violations, and format errors. Passed 18 related tests, TypeScript, targeted lint, skill checks, and document checks.

- 2026-10-04: Used temporary repositories and mock ACP to verify large staged diffs exceeding 4MB, full source-text restoration, long Unicode lines, summary integration, independent ACP calls, source rechecks, full-content commits, preservation of staged changes outside the selection, and summary failure/cancellation/edits during analysis. Passed 17 tests in `server/git-ai-commit.test.ts` and `server/mew-skills.test.ts`, plus TypeScript, targeted lint, skill format checks, and document checks. Summary quality with actual paid models and application to the running server require user verification.

- 2026-10-02: After reducing diff filenames by 4px and adding an Open in Editor button, TypeScript, targeted lint, existing Git panel Chromium regression tests, and document link checks passed. Document boundary checks failed due to unregistered documents in `todo/docs/` outside this task's scope. No build or server restart was performed.

- 2026-09-30: Remote progress feedback validation passed tests for the Git progress parser, actual transfers to a local remote, authenticated NDJSON streams, and preventing secret exposure in failure logs (`server/git-remote-progress.test.ts`, `server/gitWorkbench.test.ts`, `server/git-connections.test.ts`). Browser checks tested transfer rates from actual chunk streams, waiting for remote confirmation, completion display/restoration after 3 seconds, failures, early connection termination, and absence of global toasts (`server/git-panel-ui.test.ts`). TypeScript, targeted lint, and document boundary/link checks also passed. No push to the live service, build, or server restart was performed.

- 2026-09-30: Branch-addition validation passed `server/gitWorkbench.test.ts`, `server/git-connections.test.ts`, `server/access-policy.test.ts`, and `server/git-panel-ui.test.ts`. Actual temporary repositories were used to check creation based on HEAD, local/remote branches, tags, and commit hashes; remote tracking; preservation of working changes and staged changes on conflicts; and rejection of invalid names/bases. Also verified HTTP workspace and feature/file permissions, local operations without a connection, browser search, keyboard switching, creation from a tag base, failure recovery, draft preservation, and both themes at 320px and on desktop. TypeScript, targeted lint, and document boundary/link checks passed. No build, server restart, or actual remote transfer was performed.

- 2026-09-30: Isolated Chromium verified automatic updates to external commit history and branch information, along with preservation of history scroll position, file selection, and drafts. Existing Git panel UI regression tests, TypeScript, targeted lint, and workspace document checks passed. No build or server restart was performed.
- 2026-09-29: Passed 9 authentication/connection tests covering the default OAuth app and unset, empty, whitespace-only, and custom ID replacements, plus targeted lint and workspace document checks. Actual GitHub authorization and a server restart were not performed.
- 2026-09-29: Server tests verified per-account OAuth, encrypted storage, author/committer separation, blocking Push without a connection, disconnection during AI analysis, and credential helper host/path restrictions. Passed desktop/mobile login, disconnection, draft preservation, and single-retry checks; existing Git panel, AI UI, and docking tests; TypeScript; targeted lint; translation checks; and document checks. Actual GitHub authorization/transfers require user verification after configuring the OAuth app. No build or restart was performed.

- 2026-09-29: Desktop/mobile captures confirmed height alignment between the title field and 32×32px icon buttons. Existing Git panel UI tests, TypeScript, targeted lint, and document checks passed.
- 2026-09-29: Desktop/mobile captures confirmed placement of `선택 파일 수 / 전체 변경 파일 수` before the Changes heading. Existing Git panel UI tests, TypeScript, targeted lint, and document checks passed.
- 2026-09-29: Verified accessible names and hover tooltips for the commit and robot icons in `server/git-panel-ui.test.ts`. Git panel and AI automatic commit UI tests, TypeScript, targeted lint, and document checks passed.

- Verify that external commits and branch changes appear without manual refresh and that history scroll position, file selection, and drafts are preserved.
- Verify that automatic queries reflect file additions, status changes, and list removals; retain or remove selections; preserve drafts and scroll position; update diffs when the same file is edited again or changes are reverted; recover from temporary failures; prevent duplicate slow requests; and stop querying after the panel closes.
- 2026-09-28: Verified the automatic update behavior above in isolated Chromium in `server/git-panel-ui.test.ts` with controlled API responses. `server/git-ai-commit-ui.test.ts`, `server/gitWorkbench.test.ts`, TypeScript, lint for targeted files, and document boundary/link checks also passed. Reflection of actual external edits on the running server requires user verification after applying the build.
- Use a local bare repository to verify Pull fast-forward, rejection of divergent history, Push of the current branch, prohibition of forced overwrites, unset upstream, detached state, and duplicate execution. In Chromium, verify header placement, disabled controls during execution, errors, draft preservation, and the no-repository state.
- 2026-09-28: After adding Pull/Push, `server/gitWorkbench.test.ts`, `server/git-panel-ui.test.ts`, `server/git-ai-commit-ui.test.ts`, `server/access-policy.test.ts`, TypeScript, lint for targeted files, and document checks passed. Desktop/mobile captures confirmed header icon placement; remote transfers were verified only with temporary local bare repositories.
- Verify that changing all-file or individual selections updates the selected count in the Changes header and that the number is displayed even when it is 0.
- Initially, select only changed files saved from the current IP; do not select files saved from other IPs or files without records. Also verify manual all-file/individual selection and selection retention after automatic queries.
- 2026-09-28: After moving the selected count, existing `server/git-panel-ui.test.ts` Chromium checks, TypeScript, lint for targeted files, and document boundary/link checks passed.
- 2026-09-28: After moving GitHub login information to the panel header, `server/git-panel-ui.test.ts`, `server/github-auth-ui.test.ts`, TypeScript, and lint for targeted files passed. Desktop/mobile captures confirmed placement to the left of the close button.
- 2026-09-28: After moving the AI automatic commit button to the right of the regular commit button, `server/git-panel-ui.test.ts`, `server/git-ai-commit-ui.test.ts`, TypeScript, and lint for targeted files passed. Desktop/mobile captures confirmed that both buttons are on the same line.
- 2026-09-28: In `server/git-panel-ui.test.ts`, verified bidirectional mouse dragging of the composition area's top border, touch dragging/cancellation, termination on release, bottom anchoring, keyboard adjustment in 12px increments/Home/End, height preservation after diff navigation/closing, and removal of the existing corner handle. AI automatic commit UI regression tests, TypeScript, lint for targeted files, and document checks also passed.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that only the current tab's repository is displayed and that the selected-file scope before committing and confirmations for risky operations are correct.
- Verify the 36px top bar, removal of the fixed Git title, branch selection on the left, GitHub/close access, docking movement with the top handle, the initial 50:50 ratio between commit history and changed files, composition area height adjustment, all-file/individual selection, preservation of unselected staged files, changed files shown by default, independent scrolling, border dragging/keyboard controls, single-line mobile commits, and return from diff.
- Verify set selection and creation for AI automatic commits, multiple actual commits, hashes, included files, interruption, failure, reconnection, and detection of changes after analysis.
- Commits from partial success, staged changes outside the selection, and manual drafts must be preserved.
- In `server/agentAcp.test.ts` and `server/git-ai-commit.test.ts`, verify ACP application of the previous model ID, preservation of the specified model and reasoning effort, preservation of structured errors, and no changes to commits or staged changes on failure. Isolated tmux tasks also use the previous model ID to create actual test commits.
- Verify GitHub logged-out/connected-account states, missing OAuth app configuration, code copying, internal authorization, cancellation, expiration, retries, reconnection after refresh, concurrent users, and blocking under partial file permissions.
- The user directly verifies actual GitHub authorization.
- 2026-09-26: Chromium checks in `server/git-panel-ui.test.ts` verified the 36px top bar, body position, desktop handle docking, hidden mobile handle, preservation of drafts and diff when closing/reopening, and closing in the no-repository state. Also captured desktop/mobile screens in light/dark themes.

- 2026-10-03: Origin URL conversion tests, Git server and Chromium panel regression tests (checking link URLs, new tabs, and noopener/noreferrer), TypeScript, targeted lint, and document link checks passed. Document boundary checks failed due to existing unregistered files in `todo/docs`.

- 2026-10-03: Applied a 24px size to Pull/Push and hid panel titles below 400px. Isolated Chromium Git panel regression tests verified hidden titles at 320px, prevention of menu overlap during operations, and existing workflows. Desktop/mobile captures, TypeScript, targeted lint, UI detector, and document link checks passed. No build or server restart was performed.

- 2026-10-03: Applied 28px commit titles/buttons, 14px icons, 8px composition area padding, 6px spacing, a 128px minimum height, and a reduced default ratio. Desktop/mobile captures and Git panel Chromium regression tests verified composition, height adjustment, and draft preservation. Type checks, lint, UI detector, and document link checks passed. No build or restart was performed.

- 2026-10-03: Added X closing, icon controls, and compact spacing to the GitHub login popup. Isolated Chromium at 1100/390/320px verified login, tooltips, external/internal authorization, keyboard focus, errors, cancellation, reconnection, disconnection, and draft preservation. Type checks, targeted lint, UI detector, and document link checks passed. No actual GitHub authorization, build, or restart was performed.

- 2026-10-04: Chromium regression tests verified selection of rows skipped during checkbox touch dragging, state retention when revisiting rows, selection retention after dragging ends, and existing single-click behavior. Type checks, targeted lint, and document link checks passed. No build or server restart was performed.

- 2026-10-04: Chromium verified downward/upward automatic scrolling while holding a touch drag at the edge, selection of newly revealed rows, and scrolling stopping on release or cancellation.

<!-- mew:validation:end -->

### Default selection for the current IP (2026-10-06)

`PUT /file` autosave and `PUT /fs/file` record the connecting IP and the SHA-256 of saved content in a per-path ledger in the data directory. Git queries return `currentIp` only when the hash matches the actual current file, without exposing the IP itself. Forwarded headers are trusted only from loopback proxies. Edits without existing records and direct shell/agent edits are not assigned an inferred origin. When one file contains changes from multiple authors, attribution is determined for the entire last-saved file; this is not partial hunk selection. Ledger save failures do not block file saves.

Validation (2026-10-06): Ran related server and isolated Chromium tests, TypeScript, and targeted lint. No actual update installation, build, or server restart was performed.
