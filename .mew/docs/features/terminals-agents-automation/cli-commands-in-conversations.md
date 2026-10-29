---
id: "mew-agents-cli-commands"
parent: "mew-agents"
title: "Run CLI Commands in Conversations"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-14"
status_hash: "5e176a299d57b0bec1327fb8a080e5dd0fa635c25be1fadb49b64e49a3afb1c7"
files: ["src/components/agent-command-bubble.tsx", "server/agent-command-runner.ts", "server/agent-command-queue.ts"]
commits: []
description: "Feature contract for sending commands from agent conversations through CLI mode, the ! prefix, and response code blocks, and checking status, stopping execution, viewing output, and downloading it. Distinguishes code detection, drafts, permissions, and the shared queue from execution, output completion, and verification scope for POSIX shells and Windows PowerShell/Job Object."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Run shell commands and view their results within agent conversations.

### Scope

- Commands canceled in the queue before execution leave no conversation bubble or stopped status. Records and output from commands actually stopped during execution are preserved.

- Remove `! ` at the very start of the input while switching between normal and CLI modes in either direction. The same switching restrictions as the existing button apply.
- Provides CLI input mode, command status, stopping execution, opening a terminal, and viewing and downloading completed output.
- Command code blocks in responses have a triangular Run button to the left of the Copy button. Clicking it submits the content as a CLI command in the same tab, session, and working directory and displays an execution record in the conversation.
- On Linux, applies the installed agent's aggregate OS memory limit to the shell and its descendants, stopping the active command on low memory while preserving queued commands ([protection scope](../../../../docs/operations/agent-memory.md)).

### Boundaries and limitations

- AI prompts and CLI commands follow the execution order of the shared queue.
- Because this runs arbitrary shell commands, agent and terminal permissions and server execution boundaries apply.

### Detailed contracts

- [Terminal and Agent Usage](../../../../docs/guides/terminal-agents.md) · [Shared Execution Queue](../../development/agent-sessions.md)

### Run from Response Code Blocks

`bash`, `sh`, `shell`, and `zsh` blocks execute the entire nonempty command body at once. Blocks with no language or with `text` or `plaintext` show a Run button when every line other than comments and blank lines starts with a `npm`, `npx`, `pnpm`, `yarn`, `bun`, `node`, `python`, `pip`, `uv`, `git`, `docker`, `make`, `cargo`, `go`, `curl`, `wget`, `cd`, `ls`, `pwd`, `mkdir`, `cp`, `mv`, `rm`, `echo`, `cat`, `sudo`, `chmod`, `export`, or `source` command (including `python3` and `pip3`). Indented code blocks use the same detection. Source-language blocks such as Python and C++ do not show a shell Run button.

In shell blocks, `console`, `terminal`, `shellsession`, and blocks without a language, if every command line starts with `$ `, only the prompt is removed. Transcripts mixing commands and output do not show a Run button. The Copy button preserves the original text, including prompts. This detection controls display; it does not check command safety or change the shell used for execution. The actual execution environment follows the existing CLI execution path.

Clicked commands are not sent as AI prompts. Once the server accepts a command, CLI input mode is enabled and the command is added to input history without overwriting or clearing the draft being composed. If work is in progress, the command enters the existing shared queue. Repeated clicks during submission do not cause duplicate execution because of the existing submission lock. Failures use the existing error display and retry path.

The Run button is hidden without terminal permission. It is disabled while responses are streaming, connections or sessions are being prepared/restored, saved transcripts are being displayed in advance, the queue is being edited, attachments are being processed or are present, or commands are being submitted. The Copy button remains available. The Run button provides a translated accessible name, a shared tooltip, and a keyboard focus indicator.

<!-- mew:implementation:start -->
## Implementation details

- Windows commands run in PowerShell, with no automatic conversion of POSIX shell syntax. A user `exit` terminates the inner shell, and a separate wrapper records the exit code, completion file, and output drain. Descendants owned by the Job Object are cleaned up together on cancellation or parent termination. The queue, output archive, and conversation IDs use the shared implementation. The precise protection scope and actual Windows pty verification follow the [OS Execution Contract](../../development/windows-native.md).

- The `! ` prefix sets the mode to the opposite of its current value. This prevents duplicate editor document and cursor notifications from switching the mode back.

- Cancellation before execution is distinguished by the `cancelledBeforeStart` marker in server records and excluded from the conversation timeline. Existing cancellation records are also normalized when retrieved, while IDs are retained to prevent duplicate execution on resubmission.

- Remove `! ` at the very start of the input while switching between normal and CLI modes in either direction. The same switching restrictions as the existing button apply.
- Provides CLI input mode, command status, stopping execution, opening a terminal, and viewing and downloading completed output.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-13: 7 Markdown tests and 1 existing CLI UI regression check passed. In isolated Chromium on desktop and mobile in both themes, verified Run/Copy button placement in command blocks and absence of the Run button in Python source. Verified that copying does not execute commands, disabling during streaming, hiding based on terminal permission, blocking duplicate clicks during submission, sending to the CLI API with the same tab, session, cwd, and utterance position, no AI prompt submission, switching to CLI mode, draft preservation, queueing, and execution record display. Type, targeted lint, and documentation description/placement checks passed. The command API and output were replaced with fixtures; no actual shell commands, builds, or production server restarts were performed.

- 2026-10-03: Reproduced with the pre-fix code an issue where only the characters were removed and the mode switched back when document and cursor changes were notified consecutively before React rendered. After the fix, desktop and mobile CLI UI regression tests, type checks, and targeted lint checks passed.

- 2026-10-03: In isolated Chromium on desktop and mobile, verified switching in both directions with `! `, prefix removal, preservation of the remaining body and cursor at the start, and prevention of switching in the middle of the body. Existing CLI UI regression tests, type checks, targeted lint, UI checks, and documentation link checks passed. The documentation allowlist check failed because of the existing unregistered `todo/docs/` boundary. No build or server restart was performed.

- `agent-clear.test.ts`, `agent-commands.test.ts`, and `agent-command-timeline.test.ts`: Verify individual/all queue cancellation, distinction from stopping actual execution, reconnection and resubmission, normalization of older records, and exclusion of bubbles.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that AI tasks and CLI commands execute in queue order and that cancellation, output records, and restoration work correctly.

<!-- mew:validation:end -->
