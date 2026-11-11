---
title: "Project build and deployment actions"
description: "Editable project Build and Deploy controls, conservative discovery, nonblocking setup, run results, notifications, Browser links, and scoped file/ZIP downloads. Defines individual actions reused by the results and publishing pipelines."
created: "2026-11-11"
updated: "2026-11-11"
---

## Behavior

Provide named **Build** and **Deploy** controls beside the existing project [command button](project-command-buttons.md). Users choose an outcome such as a debug or release build without entering a command. Editing an action exposes its name, kind, variant, command, optional result URL, and downloadable output paths. Legacy command buttons remain independently configurable.

The [results and publishing screen](project-delivery-pipelines.md) composes these actions into ordered workflows and retains completed pipeline results across restarts. This document owns the individual action and artifact behavior.

Controls target the selected row's actual project directory, including a subproject or worktree, without switching the active editor. All reads, saves, runs, result reads, and downloads retain that scope. Execution requires the existing owner/manager terminal boundary; a configured result URL opens the existing host Browser under its independent permission.

### Discovery and recovery

When no action configuration exists, read-only discovery offers supported actions from explicit package scripts and Android Gradle wrapper configuration. Node projects use their package manager evidence; Android projects offer debug and release APK builds only with Android project evidence. Do not infer an unknown deployment target, credentials, or URL. Discovery does not execute scripts or install a toolchain.

Explicit discovery can persist newly detected actions while preserving existing action IDs and user edits. An explicitly saved empty list remains empty until the user requests discovery. Invalid configuration and unreadable or unsupported manifests produce scoped warnings and an agent-assisted setup path. Do not overwrite malformed configuration through discovery. Failed setup, missing tools, or action execution must not prevent creating, opening, or modifying the project.

**Set up with agent** reuses the normal project-bound conversation and runtime picker. New-project assisted creation still asks about the user's concept first. Both paths apply the bundled `mew-project-setting` workflow only when it is enabled in the supplied skill catalog; disabling or removing it remains effective. The [skill library](../../development/skill-library.md) owns registration and overrides.

The account provider owns the setup dialog and checks the agent capability. Lightweight Browser and setup contexts keep project controls independent of the agent implementation. Controls disable result or setup actions when the corresponding callback is unavailable; Browser execution retains its server-side permission check.

### Runs and results

Run only the server-resolved action identified by its stable ID. Record a run independently of the current configuration so edits cannot rewrite a completed result. Capture bounded output, timestamps, and the real process exit status. A launch error or nonzero exit produces a failed result. Prevent duplicate execution of the same running action in the same root.

Finite actions have a 30-minute deadline. Stop their owned process group on timeout and retain the failure output. A pipeline reserves its project root, so manual action starts cannot overlap it. After interrupted pipeline recovery, a recorded live process group also blocks manual starts until it exits. Existing command buttons remain the entry for interactive and long-running processes.

Keep recent run results available in the action dialog. Closing the dialog does not stop the process. A page-level watcher retains the captured project root after its controls unmount, so completion and failure notifications continue while the Mew page remains connected. The account-level notification host opens the retained results even after switching projects. Existing results remain inspectable after reopening the dialog; old completed runs must not generate repeated notices.

Preserve explicit execution and discovery errors through unrelated status refreshes. Serialize status reads against mutations so a delayed response cannot replace saved configuration. Permanent client errors stop automatic reads; transient failures use a bounded retry budget and expose explicit recovery. Automatic reads never replay a build or deployment.

Successful results show the files available for download, with sizes when available and paths for duplicate names. A configured HTTP(S) address can open in the host Browser. Browser navigation does not publish a service or revive the removed Mew Port proxy. A URL remains an address supplied by the project, not proof that a service is ready. A static web output directory is downloadable but is not automatically served or executed in Browser. Build and deployment actions are finite processes; keep interactive and long-running development commands in the existing command UI.

For a package build whose saved command exactly matches a discovered command, Mew recognizes `vite build` and `react-scripts build` scripts and scans their default `dist` and `build` directories respectively. It compares file metadata before and after a successful run and offers new or changed files. Explicit nonempty artifact patterns take precedence; custom output paths need explicit patterns or agent setup. This detection does not inspect every framework or custom configuration. Metadata changes do not prove that the build itself changed a file if another process writes concurrently. Up to 100 individual files are shown. The result lists relative paths to distinguish files with the same name.

When the complete detected output consists of new or changed files, Mew also offers a ZIP containing the whole output directory's eligible files, provided scanning completed and the output contains at most 5,000 files and 512 MiB. A partial scan, protected entry, unchanged file, or exceeded limit prevents offering the ZIP. The ZIP retains paths relative to the output directory. If no result files or address are available, the result view offers setup guidance; a successful command does not guarantee that Mew can identify its output.

Artifact and ZIP downloads require a recorded successful run, the recorded project-relative paths, and fresh realpath and regular-file checks. Reject traversal, symlinks, files outside the project, protected metadata, and server data. An individual download reads the current file at its recorded path, not an immutable copy from completion. A ZIP manifest also records each file's device, inode, size, modification time, and change time. ZIP requests recheck that metadata before responding and again when opening each file; a changed, replaced, removed, or unsafe file rejects the download, or aborts a stream already in progress. These checks use metadata rather than a content hash. Do not treat an arbitrary download path as permission to read a file. Output, ZIP manifests, and recent run history are bounded in server memory; server restart does not preserve them.

## Configuration and API

The project-owned `.mew/project-actions.json` file is separate from `.mew/cmd-button.json`:

```json
{
  "version": 1,
  "actions": [
    {
      "id": "debug-apk",
      "name": "Debug APK",
      "kind": "build",
      "variant": "debug",
      "command": "./gradlew assembleDebug",
      "artifacts": ["app/build/outputs/apk/debug/*.apk"]
    }
  ]
}
```

`id`, `name`, `kind`, and `command` are required. `variant` is optional (`debug`, `release`, or `custom`); `previewUrl` is an optional HTTP(S) URL, and `artifacts` is an optional array of project-relative paths or globs. Keep secrets out of commands and result URLs stored in shared settings. Save validation and atomic replacement preserve a complete configuration file.

| API under `/api/project-actions` | Contract |
| --- | --- |
| `GET /` | Return actions, canonical `projectRoot`, recent runs, warnings, and `needsAgent`; discover read-only when no file exists |
| `PUT /` with `{actions}` | Validate and save the complete list |
| `POST /discover` | Merge supported discoveries without replacing existing IDs or malformed configuration |
| `POST /run` with `{id}` | Resolve and execute the configured action; return its run |
| `GET /artifacts?runId=...&artifactPath=...` | Download a recorded artifact after authorization and boundary checks |
| `GET` or `HEAD /archive?runId=...` | Download or inspect the recorded complete automatic output as a ZIP after authorization and fresh path and metadata checks; changed files reject the request |

Project, directory `path`, and optional `workspacePath` retain the command button scope. Explicit workspace transport follows the [workspace session contract](../../development/workspace-sessions.md); `artifactPath` must not replace the directory `path`.

## Acceptance and implementation

Verify supported discovery, unsupported and malformed configuration recovery, preservation of user edits and empty lists, build variants, real success/failure and launch errors, duplicate-run prevention, root isolation, and unauthorized or escaping downloads. UI checks cover ordinary action selection, editing, recovery without replay, closed-dialog completion notices, result navigation, downloads, and compact light/dark mobile and desktop layouts.

Shared types live in `shared/project-actions.ts`; backend configuration, discovery, execution, and routes live in `server/project-actions*.ts`. Client requests use the workspace API; `ProjectActions*` components supply controls and result dialogs, and `project-action-notice-host.tsx` supplies account-level navigation. The bundled [setup skill](../../../../resources/skills/mew-project-setting/SKILL.md) supplies project-specific investigation and default TDD. [ADR 0163](../../decisions/0163-project-build-deploy-actions.md) records the original decision, [ADR 0164](../../decisions/0164-build-result-files.md) extends result discovery, the [user guide](../../../../docs/guides/commands.md#build-and-deploy-a-project) explains everyday use, and the [work record](../../work/project-build-deploy-actions.md) records actual verification and limits.
