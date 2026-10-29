---
title: "Connect project documentation and configure automatic agent guidance"
created: 2026-09-16
updated: "2026-10-28"
description: "Covers connecting and initializing project documentation, default instructions per account, wait times and maximum attempts for automatic retries during model congestion, and automatic saving without a Save button. Also explains the preservation and scope of test and documentation instructions, automatic Git handling, commit language, worktrees, and additional project instructions."
상위파일: "MOC.md"
---

This guide explains how to connect a project's documentation folder or configure instructions for the agent to reference every time. If a folder is already open, start with the settings that match your goal.

| What to change | Where to start | Scope |
| --- | --- | --- |
| Documents location and document creation | Right-click the **Documents** toggle in the file explorer → **Agent guidance and document settings** | Current project (owner) |
| Git, language, tests, documentation, and additional instructions | **Default instructions** gear at the top of the agent panel → **Mew global instructions** | All projects for the signed-in Mew account |
| Model congestion retry interval and count | Same window → **Mew global instructions** | All ACP conversations for the signed-in Mew account |
| Project-specific instructions and automatic guidance on/off | Same window → **Current project** | Current project (owner) |
| Documentation skills and MCP servers | Book and plug buttons at the top of the agent panel | Check by source in [Skills and MCP management](../configuration/agent-harness.md) |

Documentation skills are provided as Mew default skills, so you do not need to copy them into each project. User-specified languages and existing file languages take priority; the default language for new documents follows the agent response language setting. See [ADR 0155](../../.mew/docs/history/decisions/0155-mew-project-agent-context.md) for the design rationale.

## What is passed automatically

With every request, mew's chat-based (ACP) agents receive the project root, working folder, Documents location, and brief guidance on finding and updating documentation. This is enabled by default without creating a separate AGENTS.md. You can configure additional documentation entry points and project instructions.

The guidance asks agents to follow the project README and existing instructions, and to select and read relevant current documents based on document paths and frontmatter `description`. Instructions on updating owning documents, ADRs, work records, and similar items are passed according to the account's **Documentation** selections. It does not automatically copy full document bodies, company-specific policies, or brand rules. It is neither mandatory system-role instructions nor a feature that verifies document access.

Additional project instructions take priority in that project when they conflict with Mew global instructions. Explicit user requests and existing project instructions still apply. Put operational rules that vary by project, such as building, running, and restarting, in the project instructions. Mew's default template has no blanket rule prohibiting these actions. Restrictions for the Mew source repository itself are in this repository's `.mew/agent-context.json`, [project instructions](../../AGENTS.md), and [execution rules](../../.mew/docs/development/getting-started.md).

The default guidance asks agents to record a brief purpose for the changes and the files involved in this task before completing the work or making an approved commit. This does not add commit comments to source code. Sending the purpose, paths relative to the Git root, and checks actually performed as stdin JSON to the supplied recording command stores them only in Git metadata. Files mixed with other work, secrets, and verbatim conversations are not recorded. Work continues even if the record is missing or fails, and automatic commits compare the record against the actual old and new Git objects and read the full diff. The record does not replace commit approval or formal documentation. The detailed contract follows [AI commit execution](../../.mew/docs/development/agent-sessions.md#git-ai-commit-jobs). Updates do not overwrite user guidance in existing installations.

The guidance asks agents to skip announcing skill use in introductions or progress messages and summarize it in a single `사용된 스킬: 스킬명, 스킬명` line at the very end of the final response. English responses use `Used skills: ...`; other languages use a heading in that language. List only skills actually used, without duplicates, and omit the line if none were used. For existing accounts as well, the instructions are supplemented when passed without overwriting saved files. If higher-priority runtime instructions require advance notice, those instructions take priority.

This guidance is not appended to user input or the displayed conversation. The ACP runtime's original conversation log may retain the content actually passed. Use **View guidance to be passed** in settings to inspect the content for the current root. Agents started in a subfolder also receive entry points for their actual working folder.

## Edit the shared guidance file

Use the **gear button to the right of Skills·MCP (Agent default instructions)** at the top of the agent panel to select **Mew global instructions** or **Current project**. Accounts with server file explorer permission (manager and owner by default) can edit **Mew global instructions**. These apply across all projects and sessions for the signed-in Mew account and do not apply to other accounts. Under **Current project**, an owner edits the current project's instructions. Both scopes take effect starting with the next actual ACP request.

The settings window uses the same dimensions, surfaces, and navigation structure as the full Settings popup, and fills the screen on mobile. The title bar is compact at 36px, with a 14px close icon. It uses a small title, left navigation on desktop, and horizontal navigation on mobile; only the long body content scrolls. **Mew global instructions** separates **General** and **Git**, with values selected beside each setting name. Expand **Documentation** for documentation settings and **Branch details** for branch strategy explanations and additional settings.

- **Commit behavior**: Unspecified / Commit after each completed change / Commit only when requested. Applies in **Use existing commit settings** mode. In automatic mode, task commits are included in the handling scope, and the saved commit selection is restored when returning to manual mode.
- **Commit language**: English (default) / Korean / Japanese / Simplified Chinese / Follow mew language setting / Follow agent response setting. Selecting it in the Git group saves it immediately and applies it to commit titles and bodies from regular agents and Git panel AI automatic commits. It is independent of the response language and can also be changed in automatic Git handling mode. Repository prefixes and formats are preserved. Explicit user requests and project instructions take priority.
- **Branch strategy**: GitHub Flow (recommended, default) / Git Flow / Trunk-based / Follow project instructions. Adjusts the base branch, working folder, and merge method together. See [Branch instruction settings](#git-branch-guidance).
- **Response language**: Follow mew language setting / Unspecified / Korean / English / Japanese / Simplified Chinese.
- **Response length**: Unspecified / Concise / Detailed.
- **Subagent delegation**: Unspecified / Delegate automatically when needed / Delegate only when requested / Disabled. Automatic delegation instructs supported runtimes to delegate work that can be separated independently and benefits speed or quality. The primary agent handles small tasks and sequentially dependent work, coordinates changes to shared files, and reviews and integrates results. If existing instructions have no settings section, the value remains Unspecified. This option does not enable or forcibly block runtime capabilities; it applies within the higher-priority instructions and supported capabilities of the model and runtime.
- **Test writing**: Required (default) / Follow project instructions. Required mode instructs agents to write or extend automated tests for added or changed behavior and bug fixes, including regression tests for bug fixes. It asks them to run relevant tests within the project's execution restrictions and report the reason if they cannot run them. Documentation-only changes do not require new tests. **Follow project instructions** adds no Mew-specific test-writing obligation. For existing accounts without a settings section, the required instructions are passed starting with the next request without overwriting saved files. Manually edited sections and existing selections are preserved. This setting is guidance passed to the agent; it does not forcibly block or guarantee test execution.
- **Debugger use**: Enabled (default) / Disabled. Enabled passes English instructions to inspect variables and call stacks with an available debugger when logs and tests alone cannot adequately explain an error or execution flow. It also asks agents to respect existing execution and permission restrictions and clean up connections and temporary processes. Disabled instructs agents to use a debugger only when explicitly requested by the user. This setting does not automatically install or run adapters or establish connections.
- **Documentation**: Set each of the 7 items below to **Apply default instructions** (default) or **Follow project instructions**. Selections are saved immediately and apply starting with the next actual request. Deferring to project instructions adds no separate Mew requirement for that item. Explicit user requests and existing project documentation rules still apply.
- **Additional instructions**: Expand the collapsed section and enter up to 8,000 characters to pass across all projects; changes are saved automatically. This field changes only its dedicated settings section, preserving existing freeform instructions and presets. Write rules for a single project under **Current project**.
- Selection lists use the app's own dropdowns. Navigate with the arrow keys, confirm with Enter/Space, and use Esc to close the list first. On mobile, tap to select from the same themed list.
- The settings window has no Save button. Branch, retry, additional instruction, and automatic project guidance settings are saved automatically 400ms after the last change; other presets are saved immediately upon selection. Check the saving and saved status at the bottom. Invalid branch or numeric inputs are not saved, and an error is displayed. Unspecified removes only the text for that setting and preserves other manually written instructions.
- Use **View file** to open `agent-guidance.md` in the existing editor and edit it freely. Reopening settings or clicking **Reload** reads values from the file. Setting text that does not match a selection is shown as **Manually edited instructions** and preserved when other settings change.
- If another edit has changed the source text, saving is rejected and you are prompted to reload. Saving settings also updates the saved content of an already open file. Unsaved drafts are preserved, and attempting to save outdated content reports a conflict.

The actual canonical source is `DATA_DIR/agent-accounts/<정규화 이메일 SHA-256>/agent-guidance.md`. The default installation data folder is `~/.local/share/mew`. Installations using `MEW_DATA_DIR` or the legacy `.data` use that data folder. For the first owner account created, the existing shared MD, TXT, runtime settings, and model defaults are copied once, preserving the originals. Other accounts start from the default template. If the account MD is missing when the first request is made or settings are opened, the contents of `agent-guidance.txt` in the same account folder are copied unchanged. If there is no TXT either, `server/prompts/agent-guidance.txt` is used. The existing TXT is preserved, and only MD is used afterward. App updates and restarts do not overwrite existing MD files. When reading for the runtime, only the two sentences about MOC navigation and registration in the old default template are replaced with sentences about description-based navigation and updates; saved files and user settings are preserved. Running only the preview creates no files and reads in the order MD → existing TXT → template. For existing MD and TXT files without a debugger settings section, the default enabled guidance is supplemented only when passed, without overwriting the originals. Explicitly disabled or manually edited sections are preserved. If debugger markers are damaged, default guidance is not supplemented, and repair is requested when editing settings.

Setting text is stored between `<!-- mew:agent-setting:항목 -->` and `<!-- /mew:agent-setting:항목 -->` in the MD. Instructions are stored as ordinary sentences, while execution settings such as model congestion retries are stored as metadata. You can write freeform instructions outside these markers, and setting changes replace only the corresponding section. If sections are damaged by missing, duplicate, or overlapping markers, you must fix them in View file first.

The **Current project** tab saves both whether automatic guidance is enabled and up to 8,000 characters of additional instructions. Confirm the target by its project name and path, then write build, server execution, and other rules needed for this project. It uses the same `<프로젝트>/.mew/agent-context.json` as the additional instructions in the existing Documents settings, preserving other settings such as the Documents location and entry documents. Turning off automatic guidance stops both Mew global and project instructions from being passed.

Additional instructions remain a draft until saved. If saving fails or concurrent edits cause a conflict, the input is retained and an error is displayed. Use Reload to check the latest settings; if there is an unsaved draft, you are asked whether to discard it. Pending automatic saves continue when switching scopes, and after moving to another project, the previous project's draft is not saved to the new project.

Selecting **Follow mew language setting** at the top of the response language list follows the language of the screen that sent the request (Korean, English, Japanese, or Simplified Chinese). Explicitly specified languages and manually edited instructions are preserved. CLI and scheduled requests without a screen language follow the language of the user message, while **Unspecified** adds no language instruction.

For commit language, **Follow mew language setting** uses the language of the screen that sent the request, or English if there is no screen language. **Follow agent response setting** follows the selected response language; if the response language is Unspecified or manually edited instructions, it instructs agents to write in the same language as the actual response. For existing accounts without a commit language section, the English default is supplemented only when reading. Existing source text, revision, and manually edited or damaged sections are preserved. Saving settings does not change past commit messages.

mew automatically appends project, working, and Documents paths, documentation entry points, and project-specific additional instructions. Saving an empty MD removes the existing shared text while retaining path information, used-skill notation, default debugger use, test writing, documentation items, default Git branch guidance, and English commit language. To restrict debugger guidance, select Disabled; to avoid adding separate requirements for tests, documentation, or branches, explicitly select Follow project instructions for those items. After deleting the MD, the next request or opening regenerates it from the TXT in the same account folder or the default template. It does not reimport the old shared file. CLI use without an account uses the old shared file. An already running supervisor from an older version requires reopening the tab after the app changes take effect to use per-account settings. Read errors are reported as request errors. Turning off automatic guidance for a project stops both the shared file and automatic path information from being passed. Storage and UI decisions follow [ADR 0171](../../.mew/docs/history/decisions/0171-mew-agent-guidance-settings.md). The shared guidance row in the file explorer was removed to consolidate access to settings in the agent panel. Do not reintroduce duplicate entry points without a user request.

### Model congestion retries

Changes to **Retry interval (seconds)** and **Maximum retry count** under **Default instructions → Mew global instructions → General → Automatically retry during model congestion** are saved automatically. The defaults are 30 seconds and 20 retries. The interval must be an integer from 1 to 3,600 seconds, and the count an integer from 0 to 100 retries; saving 0 retries disables automatic retries. The count is the number of additional attempts after the initial request. Input remains a draft until saved and is preserved if saving fails.

When the selected model in ACP chat is temporarily too busy to accept a request, retries continue with the same conversation and model. While waiting, the remaining time and retry count are displayed, and the working status and pending messages are retained. Use **Stop** to cancel the wait. This setting does not apply to exhausted user quotas or subscription, billing, or authentication errors. When all retries are used, an error is displayed and pending messages are held; sending a new message manually resumes the conversation. Official TUIs, regular terminals, and CLI commands are not automatically rerun.

This setting is Mew's execution policy, not text passed to the agent. It applies even when automatic project guidance is disabled, and changes take effect starting with the next turn. Detailed storage, evaluation, and queue contracts follow the [session contract](../../.mew/docs/development/agent-sessions.md#automatic-retry-for-insufficient-model-capacity).

### Documentation guidance

Expand **Mew global instructions → Documents** and select each option.

| Item | Requirements when default instructions apply |
| --- | --- |
| Update canonical documents | Update the relevant canonical documents as part of the same work as code, feature, configuration, or operational changes, and edit the existing owning document instead of creating duplicate copies. |
| Decision records (ADR) | Record the background, alternatives, decision, rationale, impact, and status of significant architectural or technical choices, shared contract changes, and reversals of prior decisions using the existing format and location. Do not create an ADR for every simple fix. |
| Work and verification records | Record the implementation purpose, outcome, checks actually performed and their results, and remaining limitations in the project's work record. Distinguish local verification from actual production application. |
| Documentation writing style | Write concisely for the audience and purpose, and distinguish current contracts, usage, decisions, and history. Preserve facts, conditions, code, uncertainty, and existing terminology and formatting. |
| Document description | Write or update a nonempty frontmatter description explaining the topic, scope, and status of each new or modified document. Follow the existing metadata format. |
| Document link management | When moving or renaming files or headings, fix incoming links and anchors in the same work and link to the canonical document. MOC registration is not required. |
| Documentation checks | Run existing metadata, link, and format checks. If no checking tools exist, manually check metadata and local links in changed documents, and report why checks were not run or failed. |

For existing accounts, missing sections are also supplemented with defaults at request time without changing the saved file or revision. Fixed documentation update wording in the previous default template is replaced with configurable guidance only when passed along, so it does not conflict with selected options. User-edited text, configuration sections, and example code blocks are preserved. These options do not waive ADR locations or documentation obligations separately established by the project. Decisions and migration behavior follow [Decision 0073](../../.mew/docs/decisions/0073-documentation-guidance-options.md).

## Git branch guidance

Select **Branch strategy** under **Default instructions** in the agent panel. The default, **GitHub Flow (recommended)**, creates short-lived work branches from the default branch and integrates them after review and verification. Choose Git Flow for projects that manage releases with separate development and release branches, or Trunk-based for projects that integrate small changes quickly. If the project has established rules, select **Follow project instructions**. The rationale is in [Decision 0045](../../.mew/docs/decisions/0045-agent-branch-guidance.md).

Adjust automation, branching, commit behavior, and detailed settings in the **Git** group under Default instructions. **Git automation** defaults to **Automate through local merge (recommended)** and does not include remote updates. If needed, change it to Use existing commit settings or Automate through remote updates and save. Previously saved explicit selections are retained.

| Git automation | Scope handled by AI |
| --- | --- |
| Use existing commit settings | Follow the commit behavior above. Merge and push when requested. |
| Automate through local merge (recommended, default) | Delegate work branch and worktree preparation, committing work files, verification, diff review, and local merging. Approval is not requested again at each Git step, and remote updates are performed only when requested. |
| Automate through remote updates | Extend local automation to include fetch and normal push to the existing upstream, or the repository's established PR workflow. |

Even in automatic mode, explicit user requests, project rules, manually edited constraints, and branch protection are followed. If failed checks or changes from other work prevent safe integration, preserve the content and report the specific cause. If the remote destination or authentication is not ready, finish local work and report the conditions blocking remote updates. Do not create a new remote without authorization or push unrelated unpushed commits.

Expand **Branch details** and adjust the values below to save them automatically. The strategy, automation scope, and all detailed values are saved together.

| Detailed setting | Default | Preference passed along |
| --- | --- | --- |
| Default branch | Auto-detect (empty value) | Check project instructions, existing local conventions, and the locally recorded `origin/HEAD`. Specify it manually only if all projects use the same name. |
| Development branch | `develop` | The development integration branch name, shown when Git Flow is selected. |
| Work branch prefix | `feat/` | Append the purpose of the work, as in `feat/agent-branch-guidance`. |
| Working folder | Worktree when needed | Use a separate working folder if there is a risk of conflicts with a shared checkout or existing changes. Can be changed to **Always use worktree** or **Current folder**. |
| Merge method | Squash | Applies to integration authorized by the selected automation scope or a user request. Can be changed to **Merge commit** or **Rebase**. |
| Clean up local branches after integration | Off | When enabled in automatic mode, also delegate cleanup of this work's local branch and temporary worktree once integration is confirmed. In manual mode, follow the separately requested deletion scope. |

After saving, selections are passed along starting with the next actual ACP request. Saving does not execute Git commands or bulk-merge existing branches. The AI is instructed to handle Git operations within the selected scope when carrying out the user's implementation request. Automatic mode omits duplicate standard commit and push restriction wording from requests but does not change the saved source text. Manually edited commit constraints are retained, and the regular commit selection is disabled in automatic mode. This also works locally without a GitHub connection and is skipped outside Git repositories.

The agent checks the current branch and uncommitted and staged changes, and reuses an existing work branch if it fits the current task. It does not automatically stash or reset changes from other work. Uncommitted changes in the existing folder are not automatically transferred to a separate worktree. The obligation to preserve changes in shared folders remains even when no worktree is used.

New worktrees are collected under `.worktrees/<브랜치 슬러그>` in the main checkout. For example, `feat/example` uses `.worktrees/feat-example`. Before creation, check that the main checkout's `.gitignore` contains `/.worktrees/`. If already working inside a worktree, locate the main checkout using the common Git directory and registration list to avoid nested creation. Locations specified by the user or project take precedence. Existing worktrees are not moved automatically; when a move is requested, check path dependencies of running processes and sessions, then move it with `git worktree move`. Navigation, search, and watching in the parent project exclude the contents of `.worktrees`, while opening the worktree itself as a project allows normal navigation.

Existing MD and TXT files without a branch settings section are supplemented with defaults when read, without modifying the files. Valid v1 settings without an automation scope also use the local merge default. Valid v1 and v2 settings preserve the original strategy, detailed values, and saved source text, replacing only the section passed in requests with current v3 guidance. Explicit saves use v3 format. Manual and remote modes explicitly saved in v2 are not overwritten with defaults. Valid manually edited sections are labeled **Manually edited instructions** and retained when other settings change. Selecting a strategy again automatically saves and replaces that branch section with the selected values. If section markers are damaged by duplication, overlap, or omission, saving is rejected, so repair them first in **View file**. Automation permissions and criteria for preserving previous settings follow [Decision 0046](../../.mew/docs/decisions/0046-agent-git-automation.md); worktree locations and v3 compatibility criteria follow [Decision 0054](../../.mew/docs/decisions/0054-internal-worktrees.md).

## Configure through the GUI

1. After opening a project or creating a new folder, right-click the **Documents** toggle (English: **Documents**) at the top of the file explorer. On mobile, press and hold to open the item menu.
2. Open **Agent guidance and document settings** (owner only).
3. Set the Documents relative path, whether guidance is passed automatically, additional document entry points (one per line), and additional instructions. Entry points are existing Markdown files within the project.
4. For a new project, select **Create missing basic document structure**. For an existing project, you can simply connect the current documentation folder and specify only the necessary entry points.
5. To use documentation guidance in external tools too, select **Create AGENTS.md for external tools**.
6. In **Preview**, review the files to be created, updated, or kept unchanged and the guidance to be passed along, then select **Apply**. If you change the inputs, you must preview again. Reload the screen after applying.

Initialization targets `AGENT.md` and `README.md` in Documents and the project's `README.md`. New Documents documents include `description`, and no new MOC is created. Only missing files are created; existing document content, maps, and AGENTS.md are not overwritten or moved. Default GUI and CLI creation templates are in English. The document preparation tool in the [Mewpet assistant](../../.mew/docs/features/appearance-accounts-operations/mewpet-assistant-conversations-and-controls.md) creates only missing documents in the current UI language. Existing MOCs are preserved for display and link compatibility, but there is no obligation to navigate through them or register new documents. Additional folders and ADR storage locations are left to project policy.

AGENTS.md export creates a short Documents linking file only when that file does not exist. Existing files are shown as **Keep existing** in the preview and are not automatically merged. In this case, the user decides whether the existing instructions need a link to the Documents entry point.

## Configure through the CLI

Run this in the mew repository. The default is a read-only preview; writes require `--apply`.

```bash
# 기존 프로젝트의 문서 폴더 연결·미리보기
npm run project:setup -- --project /absolute/path/to/project --docs docs

# 문서가 없는 기존 프로젝트의 기본 구조 생성
npm run project:setup -- --project /absolute/path/to/project --init-docs --apply

# 새 프로젝트와 기본 문서, 외부 도구용 연결 파일 생성
npm run project:setup -- --project /absolute/path/to/new-project --create --init-docs --export-agents --apply

# 기존 Markdown 진입점과 프로젝트 지침 지정
npm run project:setup -- --project /absolute/path/to/project --entry docs/AGENT.md --instructions "Follow the existing project decisions." --apply

# 자동 안내 끄기 / 도움말
npm run project:setup -- --project /absolute/path/to/project --disable --apply
npm run project:setup -- --help
```

`--entry` can be repeated and replaces the saved list of additional entry points. `--instructions ""` clears additional instructions. `--enable` re-enables automatic guidance. The CLI configures project files only; it does not run, build, or restart the mew server or open a project tab. If you change the Documents path of a currently open project through the CLI, reopen that project to update the path on screen as well.

## Storage and session lifetime

Per-project settings are stored in `<프로젝트>/.mew/agent-context.json`.

```json
{
  "version": 1,
  "enabled": true,
  "docsDir": "docs",
  "entrypoints": [],
  "instructions": ""
}
```

Documents path selection priority is project settings → existing `MEW_DOCS` whose folder actually exists → `docs` or existing `.mew/docs`. The existing **Change folder** action also writes the same project settings. Only relative paths are allowed, and symbolic links are not followed in configuration or creation paths. Invalid JSON is not overwritten; an error is reported.

When a session starts, its project root and Documents connection are bound to the session ID. Switching project screens or restoring old history does not change them to another project's connection. After changing the Documents path, the new path is used starting with **New conversation** (`/clear`). The automatic guidance toggle and additional instructions are read on the next actual request. Queued messages also receive the instructions in effect when they execute.

Starting in an explicitly configured subproject uses that project's settings. Subfolders without settings inherit the current workspace connection. Sessions started outside the workspace use settings and default Documents from their own path and do not borrow the document path from another screen.

## Supported scope and updates

- Chat input, agent sets, execution after queue edits, scheduled messages, and recurring scheduled tasks receive guidance at the shared ACP transmission point. Recurring scheduled commands explicitly specify the task's project and Documents connection.
- Guidance is not automatically injected into content entered directly in regular terminals or terminal-based agents. Use the optionally exported linking file according to the external tool's AGENTS.md support.
- An older standalone agent supervisor that is already running is not replaced by restarting the server alone. After the task finishes, close and reopen the existing agent tab to use the updated delivery path.
- When applying changes from the Mew source repository to a running Mew instance, the user builds and restarts it according to this repository's [execution rules](../../.mew/docs/development/getting-started.md). These rules do not automatically apply to other projects opened in Mew.

Use README files, instructions, and each document's `description` for document navigation, and read only relevant body text. Local RAG commands are not included in automatic project guidance ([search contract](../configuration/search.md#document-discovery)).
