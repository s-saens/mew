---
title: "mew Deployment Readiness, Security, and Usability Review"
created: 2026-09-13
updated: 2026-09-13
description: "Reviews deployment readiness issues and improvement priorities, including installation reproducibility, upload execution boundaries, recovery, and documentation consistency, based on the code as of 2026-09-13. This is not an assessment of current release readiness."
상위파일: "_work.md"
---

[Feature Guide](../../../docs/guides/getting-started-ko.md) · [Deployment Contract](../../../docs/deployment/native.md)

Status: **review and proposals**. This document distinguishes current behavior from proposed improvements and does not indicate completed implementation or adoption of new policies. It is based on `80c126b` and the working tree at the time of review. It also includes remote desktop, Git, and agent changes already in progress.

## Assessment and Scope

The feature set is sufficient for an editor operated directly by an individual or a small trusted team. However, new-installation reproducibility, upload execution boundaries, recovery after failure, and consistency between documentation and actual features are insufficient, so **it is too early to present the current state as a finished product ready for distribution to general users**.

Use by the general public and multi-tenant use are outside the existing [supported scope](../../../docs/deployment/native.md#deployment-paths-and-prerequisites). Shell privileges for manager and owner roles, broad file access for members, and server-wide shared CLI credentials are intentional parts of the current contract. App role restrictions alone must not be described as guaranteeing OS isolation.

The review focuses on documentation, current source code, and isolated reproductions. No actual public server, login sessions, user files, or crontab were changed. Fresh OS installation, actual provider login, the full UI, external networks, and a physical remote desktop were not validated in this review. It does not include a visual design score or an accessibility compliance assessment.

## Strengths to Preserve

- A single deployment document covers native installation, default loopback binding, a dedicated OS user, HTTPS, and systemd.
- Storage boundaries for configuration, state, work products, and Postgres are distinguished, and app deletion is separate from user data deletion.
- File autosave and commits, tab closure and panel closure, and scheduled messages and independent scheduled tasks are distinguished.
- Shared contracts exist for the runtime registry, per-account UI restoration, permission middleware, and optional browser, DB, and desktop capabilities.
- There are feature-specific unit and integration tests, as well as validation evidence for guest access, path validation, command arguments, and native input. However, the existence of tests or some passing results does not guarantee the safety of the entire deployment.

## Priority Items Before Deployment

P1 items must be resolved before public access or expansion in the target environment; P2 items improve operations and usability. Severity represents priorities for this deployment review, not CVSS scores.

### P1 — Uploaded files can execute scripts on the app's origin

**Current evidence:** `safeExtension` in [localAssets.ts](../../../server/localAssets.ts) only checks whether the extension is alphanumeric, preserving `.html` and `.js`. `/upload` in [api.ts](../../../server/api.ts) is open to logged-in users, and `/asset` serves UUID paths through `sendFile` without authentication. `script-src 'self'` in [serve.ts](../../../server/serve.ts) also allows uploaded JS on the same origin.

**Reproduction:** Used an isolated HTTP fixture in a temporary project with the actual asset save function/API and production CSP applied. Without authentication, the HTML response returned 200 with `Content-Type: text/html` and no `Content-Disposition`, and the uploaded JS referenced by that HTML executed a harmless DOM marker change in Chromium. No actual user API calls or credential theft were performed.

**Impact:** If an account with upload permission uploads a file and another logged-in user opens its URL, code can execute on that user's app origin. HttpOnly restricts reading cookie strings but does not prevent authenticated requests from that origin. UUIDs prevent path guessing; they do not isolate content execution.

**Improvement:** Explicitly define the media formats allowed inline in content, and serve executable files such as HTML and JS as downloads. Isolate untrusted documents that require rendering on a separate origin that does not share cookies or in an appropriate sandbox. Apply purpose-specific CSPs to assets and app documents. Review this alongside the format validation, storage, and serving boundaries in the [OWASP upload guidelines](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

**Completion criteria:** Allowed images and document downloads remain available, and real-browser regression tests pass showing that executable combinations such as HTML, JS, and SVG cannot execute code with the app origin's privileges.

### P1 — Configuration file parsing and precedence differ by execution method

**Current evidence:** `set_config` in [mew](../../../mew) writes values without quoting them, and `load_config` executes the file through the shell's `source`. [server/config.ts](../../../server/config.ts) uses `process.loadEnvFile`. The [environment variable documentation](../../../docs/configuration/environment.md) states that the repository's `.env` overrides earlier settings.

**Reproduction:** In Node 22.22.2, reading the same key sequentially from two files retained the first value. When the harmless path `/tmp/folder with spaces` was saved in the same format, Node read it, but Bash failed with `with: command not found` and exit code 127. Because configuration is executed as shell code, special characters such as `$` can also be handled differently from plain strings.

**Improvement:** Have the CLI and server use the same dotenv parser and explicit precedence, without executing configuration files. In `status`, show only configuration sources and validation results without printing secrets.

**Completion criteria:** Values are identical and match the documentation for paths containing spaces, Korean characters, and special characters; conflicts among environment variables, XDG configuration, and the repository's `.env`; and execution through the CLI, direct Node, and systemd.

### P1 — A failed update does not guarantee preservation of the previous working installation

**Current evidence:** `cmd_update` in [mew](../../../mew) performs pull → `npm ci` → build → stop/start in the current installation directory. The [deployment documentation](../../../docs/deployment/native.md) states that changes to `dist/` also affect the running UI. Startup verification checks PID liveness, not functional readiness.

**Impact:** A failure during dependency replacement or a build can leave the running process and on-disk artifacts out of sync. There is also no path to automatically restore the previous installation if the new server fails to start. Update polling in [App.tsx](../../../src/App.tsx) keeps treating connection failures as retries, potentially leaving users waiting without recovery guidance.

**Improvement:** Install dependencies, build, and validate in a separate release directory before switching, and retain the previous release. Roll back if readiness checks fail, and provide a timeout, failure stage, logs, and a manual recovery path in the UI. This can be designed within the scope of native deployment without reintroducing Docker.

**Completion criteria:** Recovery to the previous working version is possible even when installation failure, build failure, port conflicts, or immediate termination of the new process are injected. Verify user data recoverability through separate backups.

### P1 — The server continues running after a fatal exception

**Current evidence:** [serve.ts](../../../server/serve.ts) logs `uncaughtException` and continues running. systemd's `Restart=on-failure` does not take effect unless the process exits.

**Improvement:** Handle expected task errors within the affected session, and exit with failure after bounded cleanup for unhandled global exceptions so the supervisor can recover. Automatic recovery for personal use must also be defined. This aligns with the recommendation to use an external monitoring process in the [official Node guidance](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly).

**Completion criteria:** Injecting global exceptions in an isolated environment confirms process replacement, readiness, and resumption of file saving. Also verify the contract for preserving user agent sessions.

### P1 — Revoking sharing does not revoke attachment access

**Current evidence:** Guest file permissions and `/api/asset` are separate boundaries. Assets are public to visitors who know the URL, and responses use public immutable caching for 1 year. This behavior is the current choice in [ADR 0120](../history/decisions/0120-mew-project-local-assets-replace-r2.md), rather than behavior introduced inadvertently by a bug.

**Impact:** Previously distributed image and attachment links may remain accessible even after document sharing is disabled. Users editing private materials are unlikely to anticipate this distinction. Retracting copies already downloaded or cached is a separate issue.

**Improvement:** Explain the current meaning of public attachments in the sharing UI and usage instructions. If private sharing is needed, combine document and attachment permissions and give individual sharing links scope, expiration, and revocation. A new ADR is required before changing the default public bearer-link policy.

**Completion criteria:** Users can preview the list of files and attachments recipients will see, and tests verify that access to server originals is blocked after revocation. If attachments remain public, clearly distinguish this in the UI.

### P1 — Overlapping scheduled tasks send new commands to input for a running task

**Current evidence:** `buildCommand` in [schedules.ts](../../../server/schedules.ts) reuses an existing session if present and always inserts the next execution command through `send-keys`. The [commands and scheduling documentation](../../../docs/guides/commands.md) advises against setting an interval shorter than the execution time.

**Improvement:** Add per-task locks and execution states, and explicitly choose either skipping or waiting when executions overlap. Show each execution's ID, start/end, errors, next execution time, and time zone, and set a log retention limit.

**Completion criteria:** A second scheduled execution arriving during a long task does not mix commands into the current agent's stdin. Handle restarts, missed execution times, cancellations, and failures predictably.

### P2 — Production security headers and media features must be validated together

**Current evidence:** [serve.ts](../../../server/serve.ts) sends `frame-ancestors 'none'` and `default-src 'self'`. The PDF endpoints `/raw` and `/fs/raw` only change X-Frame-Options to SAMEORIGIN, and the [YouTube node](../../../packages/editor/src/MediaNodes.ts) creates an external iframe.

**Reproduction and limitations:** An isolated HTML iframe with the production header combination confirmed that even the same origin was blocked by `frame-ancestors 'none'`. Actual PDF viewer behavior on different devices requires separate validation. The YouTube external frame has a mismatch between the source and CSP; actual provider video playback was not tested in this review.

**PDF follow-up implemented (2026-09-15):** The PDF iframe was removed and replaced with the [app Canvas viewer](../development/pdf-viewer.md). Opening, handwriting, saving, and downloading are validated in actual Chromium with the production CSP applied. `frame-ancestors 'none'` is retained, allowing WASM compilation only for the local decoder. This item's review scope for the existing `/raw` headers, YouTube, and other media remains.

**Improvement:** Preserve clickjacking protection for the app shell while distinguishing the ancestor policy of allowed viewer responses from the parent's frame source policy. Avoid globally relaxing the CSP to allow media unconditionally.

**Completion criteria:** On actual pages with production headers applied, test both correct operation of PDF, SVG, YouTube, the internal browser, and authentication popups and blocking of untrusted frames.

## Next improvements for deployment and documentation

| Topic | Identified gaps | Recommended deliverables and completion criteria |
| --- | --- | --- |
| First run | README is a feature reference, but lacks a short walkthrough covering installation → file creation → saving → reconnecting | A 5-minute getting started guide and sample project. One new user completes file creation, a commit, and reconnection without help |
| Preflight diagnostics | `setup` checks Node, the compiler, and tmux, but there is no combined check for optional features and public access | `mew doctor` and a feature status screen: Ready, Setup Required, Unsupported, with remediation commands and rechecks |
| DB startup | The setup example uses port 5432, while Compose uses 55432. The procedure for passing an external `config.env` to Compose is also unclear | Align credentials, ports, and environment passing under a single DB startup procedure, and verify `/db` creation and persistence after restart |
| Continuous operation on macOS | A systemd example exists, but guidance on Mac autostart and the lifetime of logged-in GUI sessions is insufficient | Specify how to start automatically at login and the feature differences between headless and GUI operation. Verify recovery after reboot separately |
| Backup and migration | Backup targets are listed, but guidance on restore order, consistency, Postgres recovery, and CLI reauthentication is insufficient | A restore rehearsal covering server shutdown/snapshot criteria, recovery order, ownership restoration, and verification of accounts, documents, attachments, and the DB |
| Public repository documentation | The review found 60 links outside the repository across 22 current documents. They work in the workspace, but their targets are absent in a standalone clone | Make user instructions self-contained within the repository. Decide on public documentation URLs and link conversion for distribution without duplicating central ADR originals |
| Unsupported paths | The Compose `app` service and its description remain, but there is no Dockerfile. The setup welcome message also uses the old project model | Choose between removing unsupported profiles and providing explicit failure guidance. Update the welcome message to the current folder project model |
| Security documentation reliability | SECURITY says guests can revert, but the actual route uses `requireAuthenticated`. Some descriptions of link previews, home, and account issuance are also outdated | Compare the code, current ADRs, and SECURITY to update the canonical source, and enforce it with API tests for each role |
| Feature guides | Menu operations are mixed with internal APIs, file formats, and source explanations in the same guides | Order usage instructions as preparation → operation → success verification → common errors. Link implementation contracts to existing development documents |
| Release evidence | The `package.json` version is 0.0.0, and there is no `.github/workflows` in the repository. Whether external CI exists is unconfirmed | Version, changelog, platform verification results, dependency audits, third-party notices, and installation/update/recovery CI |

Title and description previews for external sites are currently disabled because `/link-preview` returns null. This review corrected earlier README and editing guide statements that described them as available. Link editing and internal file references remain available.

## Required explanations in feature-specific instructions

| Feature | What users need to know |
| --- | --- |
| Saving and Git | Autosave writes to disk, Ctrl+S commits the file, and the Git panel commits all changes. How to recover when server files differ from open editor contents |
| Sharing and permissions | Members can also read a broad range of files; managers and owners have shell access. Guest rule inheritance, public attachments, and the scope of revocation |
| Agents | Execution machine, cwd, accessible files, approval mode, provider account, and costs. Instruction text is not a means of permission isolation |
| Project instructions | How to find run/verification commands in README and rules in AGENTS, and differences in instruction file support across runtimes. Users must be able to check the scope actually applied on screen |
| Browser | Uses the server's localhost, not the device's localhost. DOM relay limitations for video, Canvas, and device authentication. The difference between CLI accounts and web login accounts |
| Remote desktop | Sharing the server's actual logged-in screen, OS approval, limitations of services without a GUI, and differences between WebRTC and HTTPS tunnel paths |
| Scheduling | Differences between session scheduling and independent cron, server time zone, overlapping runs, failures, cancellation, costs, and execution history |
| DB | Documents store only references; actual rows reside in Postgres. A Markdown/Git backup alone does not restore the DB |

Agent instructions should start with a small template covering the project's purpose, how to run and verify it, prohibited operations, and documentation locations. File and command permissions must be enforced separately; do not describe writing “do not read” in instructions as restricting permissions. See the [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) for the rationale for least privilege and validation on every request.

## User convenience feature priorities

| Order | Proposal | Changes for users |
| --- | --- | --- |
| 1 | Feature status and diagnostics screen | See why the browser, DB, runtime, or desktop is not working and what to do next in one place |
| 2 | Selected-file commits, replacement previews, and deletion recovery | Avoid committing unrelated work or secret files together, check results before bulk changes, and recover from mistakes |
| 3 | Sharing management screen | View public files, attachments, and applied rules together, preview the guest perspective, and revoke access |
| 4 | Contextual help and command palette | Open instructions for the current screen directly and search menus and commands by feature name. Reduce the need to memorize all features at once |
| 5 | Task completion and failure notifications | Check agent and scheduled task results even after leaving the screen on mobile. Users choose notification channels and permissions |
| 6 | Project instruction templates and application status | Quickly configure and check which commands and rules agents should follow in a new project |

Selected-file commits are a proposal to change the current `git add -A` contract of `commitWorkingTree`. The current UI already indicates that all changes are committed, so this is not considered hidden behavior. Review the relevant central ADRs first for features that change existing contracts, such as sharing policies, default agent permissions, per-account CLI isolation, and concurrent use of independent projects. In particular, the current structure, in which the server's active root is global, limits scaling for teams using different projects simultaneously.

## Recommended implementation order and verification

1. Address upload execution boundaries, unified configuration loading, fatal exception handling, and safe updates/recovery.
2. Complete guidance on feature readiness, first run, sharing semantics, DB startup, and backup restoration. Resolve public attachment policies and cron overlaps before deploying those features.
3. Automate the fresh installation → login → document saving → collaboration → update failure → restoration path on Linux/macOS, and verify actual public HTTPS and mobile access. Mark verification with actual providers and operating systems separately.
4. Add selective commits, sharing management, contextual help, and task notifications in that order.

Results of this verification:

- Shell/Node parsing differences for paths containing spaces and first-value retention in `loadEnvFile`: reproduced in isolation.
- Actual asset storage/API and harmless JS execution under production CSP: reproduced in isolated Chromium.
- Same-origin iframe blocking with the production header combination: reproduced in isolated Chromium. Distinct from verification of actual PDF and YouTube playback.
- `auth.test.ts`, `localAssets.test.ts`, `schedules.test.ts`, `agentSettings.test.ts`: 19 passed in temporary workspace/data, with no failures or skips.
- The full test suite, production build, installation, restart, and actual account connections were not run. This report is not a security certification or release approval.
