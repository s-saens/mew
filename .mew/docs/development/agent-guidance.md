---
title: "Agent guidance and context delivery"
description: "Per-account guidance storage, revision APIs, settings presets and localized default instruction previews, and account/project context delivery. Defines defaults, preservation rules, runtime boundaries, and failure handling shared by interactive and scheduled sessions."
updated: "2026-11-06"
상위파일: "agent-sessions.md"
---

## Passing project context

Retry, build verification, branch, additional instructions, and automatic project guidance settings in the default instructions dialog are saved automatically 400 ms after the last change, without a separate save button. Invalid numeric, branch, or build-command input is not sent to the API. Saves are serialized through the existing revision API, and drafts are preserved on failure or conflict. Other presets are saved immediately upon selection. In the code quality and documentation selectors, the T button beside Apply default guidance displays a localized explanation without changing the selection or stored English instruction.

Per-project queues, independent tabs, the shared CLI, and completion criteria for feature requests follow [feature-based development](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md#실행과-복원). The project and Documents connection captured at submission are passed when the supervisor starts.

[Usage and configuration contract](../../../docs/guides/project-setup.md) · [ADR 0155](../history/decisions/0155-mew-project-agent-context.md).

### Shared source and settings API

**Source priority.** Use `DATA_DIR/agent-accounts/<정규화 계정 ID SHA-256>/agent-guidance.md`. Initial creation falls back to that account's `agent-guidance.txt`, then `server/prompts/agent-guidance.txt`. Preserve existing MD/TXT; previews use the same priority without creating files.

| API | Contract |
| --- | --- |
| `GET /api/fs/agent-guidance` | Requires `serverFiles`; returns `{ path, content, revision, settings, branch, instructions, capacityRetry, buildVerification }` |
| `PUT` with `{ key, value, revision }` | Atomically replaces only that MD settings section; no separate JSON copy |
| Unknown values | 400 |
| Revision mismatch or damaged settings | 409 |

Valid keys: `commit`, `commitLanguage`, `language`, `detail`, `subagents`, `debugger`, `testing`, `codeQuality`, `branch`, `instructions`, `capacityRetry`, `buildVerification`, and the documentation items below. Read values from the source.

- `instructions`: up to 8,000 characters, changing only `mew:agent-setting:instructions`. Reject other settings markers; empty input clears only this section. Preserve existing free-form guidance in place.
- `subagents`: `inherit`, `automatic`, `explicit`, or `never`, changing only `mew:agent-setting:subagents`. Missing means `inherit`; manual wording means `custom`. Automatic guidance covers independent tasks, shared-file coordination, and review, without changing runtime settings/permissions.

Edit through `/api/fs/file` and external-file tabs. Compare supplied `expectedContent` with the source and return 409 for stale drafts. Settings reads/saves refresh clean tabs via `mew:external-file-updated`, preserving unsaved tabs. Atomic file replacement prevents independent supervisors from reading an empty file during save. The Default Instructions button beside Skills/MCP opens the dialog; see [Shared guidance files](../../../docs/guides/project-setup.md#edit-the-shared-guidance-file) for save/application scope.

### Account and runtime ownership

Under [ADR 0202](../history/decisions/0202-mew-account-agent-settings.md), default instructions, `agent-defaults.json`, and `agent-settings.json` are stored in the same account folder. They use the server account context of authenticated HTTP and WS connections and are shared within the same account regardless of project path. During initial initialization, existing shared MD, TXT, and JSON files are copied only to the first owner created, and the originals are preserved. Other accounts start with defaults, and deleting or resetting settings after initialization does not import shared values again. The initial migration recipient is fixed in `.legacy-owner` so secrets are not migrated again when the owner changes. CLI use without an account uses the existing shared files.

| Runtime owner | Account boundary |
| --- | --- |
| Independent supervisors | Inherit the starting account through `MEW_AGENT_ACCOUNT`; remove that variable from ACP children |
| `AgentSession` | Pin that account across reconnections and other-account callbacks |
| Model/effort candidate and account-status concurrent-query caches | Keep per account |
| New one-time schedules | Store the creator for queries, changes, cancellation, and execution |
| New recurring schedules | Pin the account and pass runner `--account` |
| Git AI Commit | Use stored `input.owner` settings |
| Older schedules without account data | Retain shared queries/execution until resaved, then pin the saving account |

Provider CLI authentication/installation in the OS home is not isolated per account. Existing supervisors receive the new save contract only after the user applies changes and reopens the tab.

### Language and response formatting

Selecting **Follow mew language setting** at the top of the response language list uses the language of the screen that sent the request (Korean, English, Japanese, or Simplified Chinese). The `language: mew` selection is stored in the instruction source, and the screen language passed through the request's `settings.uiLocale` is converted into the actual response language instruction at execution. Explicitly selected languages and manually edited instructions are preserved. CLI and scheduled requests without a screen language follow the language of the user's message; the existing **Not specified** option adds no language instruction.

`commitLanguage` accepts `en` (default), `ko`, `ja`, `zh`, `mew`, and `agent` and stores the value in the `mew:agent-setting:commitLanguage` section. Commit title and body language is separate from response language, and repository prefixes and formatting are preserved. If the section is missing, queries return `en`, and default English guidance is added only when passing instructions. Existing source text, revision, manual edits, and damaged sections are preserved. `mew` is resolved using the request's UI locale, with English used when no locale is available. `agent` resolves a valid response language setting; for Not specified or manual edits, it instructs the agent to follow the response language. Saves take effect starting with the next request and do not rewrite history. Follows [Decision 0064](../decisions/0064-commit-message-language.md).

The default template instructs agents to omit skill usage announcements from introductions and progress messages and list only the skills actually used, without duplicates, on one line at the very end of the final response. Use `사용된 스킬: <이름 목록>` in Korean, `Used skills: <names>` in English, and a heading appropriate to the response language for other languages. Omit the line if no skills were used. The same instructions are added only once when reading context from existing MD and TXT files or empty source text, without changing the stored file or revision. Higher-priority runtime instructions requiring advance skill announcements take precedence.

### Testing and code quality

`testing` accepts `required` (default) and `project` and replaces only the `mew:agent-setting:testing` section. Existing accounts without the section are also shown as `required` in queries, and default instructions are added when reading context while preserving the stored source and revision. A manually edited section is `custom`; damaged markers prevent duplicate insertion of default guidance. The default requires writing or improving automated tests for behavior changes and regression tests for bug fixes, and running relevant tests. It includes reporting execution constraints and reasons for not running tests, and excludes documentation-only work. `project` adds no separate Mew requirement to write tests. This is a shared guidance setting, not a gate that enforces execution. Follows [Decision 0072](../decisions/0072-test-writing-guidance.md).

`codeQuality` accepts `required` (default) and `project` and changes only the `mew:agent-setting:codeQuality` section. The General group's **Code quality** selector uses **Apply default guidance** and **Follow project instructions**, saving immediately on selection. The default asks agents to keep responsibilities cohesive in small modules, components, and functions; make interfaces and dependency boundaries explicit; separate domain logic from UI and I/O where useful; and use clear names, control flow, error handling, and existing abstractions. Split code when it improves understanding, testing, or maintenance, without trivial wrappers, speculative abstractions, duplication, dead code, or unrelated rewrites. Existing project conventions and explicit requests govern. This choice does not alter test-writing guidance or create an execution gate. Missing sections are shown as `required` in settings queries and receive effective defaults at request time without changing source or revision; explicit project selections, custom wording, and damaged sections are preserved. [Decision 0117](../decisions/0117-focused-documentation-and-clean-code-guidance.md) owns the rationale.

### Build verification

`buildVerification` accepts an `AgentBuildVerificationSettings` object: `{ mode: 'required' | 'project', command: string, scope: 'implementation' | 'all', fixFailures: boolean }`. The default is `{ mode: 'required', command: '', scope: 'implementation', fixFailures: true }`. Queries return `buildVerification: { value, custom }`. Saving replaces only the `mew:agent-setting:buildVerification` section, containing `<!-- mew:agent-build-verification:v1 {"mode":"required","command":"","scope":"implementation","fixFailures":true} -->` metadata and the matching generated guidance. The command is a single line of at most 1,000 characters; control characters and HTML marker injection are rejected. Invalid values return 400, while stale revisions and damaged or overlapping sections retain the existing 409 behavior. A manually edited section is shown as custom and preserved until the user explicitly selects a mode. Missing sections in existing MD, TXT, or empty source text receive effective defaults at context-read time without modifying the source or revision; damaged markers prevent duplicate default insertion.

Required build verification asks agents to run the configured build before reporting completion after code, feature, dependency, or build-configuration changes. `scope: 'all'` also includes documentation-only and other changes. With an empty command, agents follow the project's documented build and package manager, using `npm run build` when npm is used and a build script exists. A project with no build system is reported as not applicable; agents do not install or create build tooling solely to satisfy this guidance. `fixFailures: true` asks agents to repair failures and rerun the build; `false` asks them to report the actual failure without automatic repair. Failed or blocked builds must always be reported as incomplete, and applicable tests, lint, and documentation checks remain required. `mode: 'project'` adds no separate Mew build requirement and retains the other selected values. Explicit user requests, project restrictions, and existing permissions still govern; this guidance does not authorize deployment, launcher execution, or server lifecycle operations. The General group's **Build verification** selector and collapsed **Build details** use the 400 ms autosave path; details are disabled in project mode and for custom sections until a mode is selected. [Build verification usage](../../../docs/guides/project-setup.md#build-verification) owns the controls, and [Decision 0116](../decisions/0116-configurable-agent-build-verification.md) owns the scope change from project-only guidance.

### Documentation and debugger guidance

The documentation items `documentation`, `decisionRecords`, `workRecords`, `documentWriting`, `documentStructure`, `documentDescriptions`, `documentLinks`, and `documentChecks` are also accepted as keys by `PUT`. Each accepts `required` (default) and `project` and replaces only the `mew:agent-setting:<key>` section with the same name. Their scopes, in order, are reference document updates, ADRs, work and validation records, writing practices, document structure, descriptions, links, and checks. Accounts without sections and empty source text are also shown as `required` in queries, and default guidance is added on requests. This does not change the stored source or revision, and each selection leaves other documentation items and code-quality, test, language, and Git settings unchanged. `project` adds no separate Mew requirement for that documentation item, and existing project instructions remain in effect.

`documentStructure` is an independent documentation preset, shown as **Document structure** next to writing style. It defaults to **Apply default guidance**, saves immediately, and defers to existing project structure and explicit requests. The default asks for focused files organized around a topic and reader task, with independently maintained subjects separated when useful. Keep one canonical source and link to related material; use accurate descriptions so agents can select only relevant bodies. It sets no arbitrary line count, does not require MOC navigation or registration, and discourages fragmentation that makes reading or maintenance harder. Missing sections in existing MD, TXT, or empty sources receive effective defaults only when reading context, without source or revision changes. Selecting `project` for this item adds no separate Mew structure requirement and does not change writing, description, link, check, or test settings. Custom and damaged blocks retain the existing preservation and conflict behavior. [Documentation guidance usage](../../../docs/guides/project-setup.md#documentation-guidance) owns the user controls; [Decision 0117](../decisions/0117-focused-documentation-and-clean-code-guidance.md) extends the independent documentation options from Decision 0073.

Exact matches for standalone documentation update wording in the existing default template are replaced with configurable wording only when passing context. User-edited sentences in the source, content inside settings sections, and examples in code fences are preserved. If a settings section is damaged, its syntax is not automatically deleted, and the item's default guidance is not inserted again. The documentation update ordering in the previous default Change intent wording is also limited to updates required by the selected value. As before, the save API rejects damaged or overlapping sections and stale revisions with 409, and unknown values with 400. The collapsed **Documents** group in the UI uses the same API. [Documentation guidance usage](../../../docs/guides/project-setup.md#documentation-guidance) owns the detailed scope of the guidance, [Decision 0073](../decisions/0073-documentation-guidance-options.md) owns the rationale for the choices, and the [work record](../work/agent-documentation-guidance.md) owns actual verification.

`debugger` accepts `enabled` and `disabled` and replaces only the `mew:agent-setting:debugger` section. If the section is missing, settings queries show `enabled`, and context reads add default English instructions without changing the stored source or revision. Empty source text uses the same default. Disabled and manually edited sections are preserved, and damaged markers prevent duplicate insertion of default guidance. The selection provides debugger usage guidance; it does not install or start adapters or change permissions.

### Capacity retry policy

`capacityRetry` accepts `{ delaySeconds, maxRetries }`:

| Field | Integer range | Default |
| --- | --- | --- |
| `delaySeconds` | 1–3,600 | 30 |
| `maxRetries` | 0–100 | 20 |

0 retries disables automatic retry. Save through the existing revision check in `PUT /api/fs/agent-guidance`, placing `<!-- mew:agent-capacity-retry:v1 {"delaySeconds":30,"maxRetries":20} -->` metadata in the same-named section. Missing sections or invalid metadata use query/execution defaults without changing source/revision. Damaged section markers retain 409/manual correction.

These values are Mew execution policy, excluded from agent text and independent of automatic project-guidance enablement. See [Model Congestion Retry Guide](../../../docs/guides/project-setup.md#model-congestion-retries) for UI and [Automatic Retry for Insufficient Model Capacity](agent-sessions.md#automatic-retry-for-insufficient-model-capacity) for execution boundaries.

### Context delivery and session pinning

`AgentSession.#run` sends mew guidance as a separate ACP text block from the user prompt and attachments. `agent-context.ts` combines the project and Documents paths pinned to the session with the settings at execution time. Queued, scheduled, and one-shot runners share this path.

Before launching a detached supervisor, the parent captures the connection information and passes it through `MEW_AGENT_CONTEXT`. That environment variable is removed from child ACP processes. Recurring schedule commands pass the connection through `--context`.

Only paths are stored in `DATA_DIR/agent-contexts/<sha256(runtime,cwd,sessionId)>.json`. History restoration uses the stored connection, while new conversations resolve the latest Documents settings for the same project. Screen navigation does not change the connection during a session.

The mew transcript preserves the user's original text. `<mew-context version="1">` blocks returned in user text in ACP history are removed before display. Guidance does not claim system privileges or verified document reading.

Mew global instructions apply to all projects in the current account and explicitly state that additional project instructions take precedence over conflicting Mew global preferences in that project. Explicit user requests and existing project instructions remain in effect. Both scopes are reread on the next actual request, and neither is passed when automatic guidance is disabled. The default template includes configurable build verification. Concrete project commands and execution, deployment, and server lifecycle restrictions remain project-owned. Follows [Decision 0061](../decisions/0061-agent-guidance-scopes.md).

If automatic guidance fails, report the error without falling back to another project to perform the work. Fix the settings JSON or document connection, then submit the request again.

### Project settings API

The owner API (`/api/docs/agent-context`) and `project-setup-cli.ts` share the planning and application logic in `project-setup.ts`. The API validates the current project path and compares the preview revision again when applying changes. Creation with `wx` preserves existing documents and files created concurrently.

`GET` on the same owner API returns `{ projectRoot, settings, revision }`. `PATCH` accepts `{ projectRoot, revision, instructions, enabled? }` and changes only additional instructions and whether automatic guidance is enabled, preserving the Documents path, entry document, and other settings. Instructions are a string of up to 8,000 characters. A current project or settings revision mismatch returns 409, and invalid input returns 400; existing files are not overwritten. The **Current Project** tab in the Default Instructions dialog uses this API and does not create a separate settings copy.
