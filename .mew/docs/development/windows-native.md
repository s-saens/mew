---
title: "OS execution layer and Windows native support"
description: "Owns the design that separates Windows, POSIX, and Linux implementations while retaining the shared mew server and UI, along with the contracts for psmux, Job Objects, private ACLs, mutually authenticated named pipes, and platform-specific releases. Distinguishes implementation and isolated checks from actual Windows and external-network release gates."
updated: "2026-10-14"
상위파일:
  - "architecture.md"
  - "../operations/cli-release.md"
---

## Design

Windows also uses the existing mew server, React UI, editing, Git, accounts, and Mewlink. Only OS-dependent implementations are separated into `windows/`, `posix/`, and `linux/` under `server/platform/`. `platform/index.ts` is the entry point for feature code, and `platform/contracts.ts` owns the contracts. The terminal package selects the tmux or psmux implementation in `packages/tmux-term/src/server/backends/` without importing the host server. OS path and browser handling for the thin npm CLI lives in `apps/cli/src/platform/`.

For execution, shutdown, IPC, and storage, the shared API selects the implementation. Feature policies such as shell syntax and provider installation availability remain at the respective call sites. The Linux implementation owns Linux cgroup and systemd memory control. This follows [ADR 0209](../history/decisions/0209-mew-native-windows-host-platform.md); the mewnager management app is retired under [ADR 0210](../history/decisions/0210-mew-retire-mewnager.md), unifying the execution path through the shared CLI.

```text
server/platform/
  contracts.ts · index.ts          공통 진입점·계약
  process.ts · ipc.ts · storage.ts 구현 선택
  common/                         IPC 인증·파일 경계·크론 해석
  posix/                          process group·Unix socket·XDG
  linux/                          cgroup·systemd 메모리 제어
  macos/                          OS 프로세스 지표
  windows/                        Job Object 호출·pipe·ACL·PowerShell·예약·지표
native/windows/process-host.cpp   Windows 작업 트리 소유자
packages/tmux-term/src/server/backends/  tmux·psmux
apps/cli/src/platform/            OS 경로·브라우저 열기
```

## OS-specific contracts

| Responsibility | Linux/macOS | Windows |
| --- | --- | --- |
| Terminal | Existing tmux/node-pty | psmux/ConPTY, version- and hash-pinned exe |
| Agent processes | Existing separate process group | `native/windows/process-host.exe` places a suspended child in a Job Object, then runs it. Closing the handle terminates all descendants |
| Internal IPC | Existing owner-only Unix socket | Named pipe hashed from the OS user and state path, mutual HMAC challenge-response using a private state key |
| Private state | Existing XDG paths/POSIX modes | `%LOCALAPPDATA%/mew/{config,data,cache,state}`, file ACLs for the current SID and SYSTEM |
| Shell commands | Existing sh/user shell | Fixed server invocations preserve argv; user commands use a PowerShell wrapper |
| App releases | Platform-specific native dependencies/tmux | Platform-specific native dependencies/psmux/process host, internal workspace junction metadata |

## Security and lifecycle

The Job Object helper creates a suspended child, assigns it to the job group, and then runs it. Even if the helper is forcibly terminated, the job handle closes and terminates its descendants. Normal execution also waits on the actual parent process handle to clean up if the parent exits abnormally. Independent agent supervision disables this parent monitoring to separate its lifetime from the server, and ties ACP child groups to the supervisor's lifetime. Workspace switching requests shutdown through authenticated supervisor IPC. Unrelated processes are not terminated based solely on PID names. This lifecycle uses the [Windows Job Object contract](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

The Windows Job Object memory limit applies 90% of the physical memory available at startup to the task tree. Host available-memory monitoring and queue pause/resume use shared logic. Its scope differs from Linux's dynamic aggregate slice limit, and `MEW_AGENT_MEMORY_SCOPE=off` explicitly disables only the memory limit. Descendant termination and parent monitoring remain enabled.

On Windows, `chmod 600/700` is not used as a contract for preventing reads by other users. State folders remove inherited ACEs and restrict access to the current OS user and SYSTEM. Execution is refused if ACL preparation fails or the state root is a reparse point. IPC keys in protected state folders are not sent through argv, the environment, logs, or HTTP.

Connecting to a named pipe does not immediately authorize operations. The server sends a random challenge and its own proof; the client verifies the server's proof, then returns its own proof. Both proofs are bound to the endpoint, role, and nonce. Frame size, time, and pending connection counts are limited before authentication. Existing account, project, and permission checks remain in effect after authentication. The POSIX wire format is compatible with existing connections.

The command wrapper reads user text from a stored execution record and inserts only server-owned file paths into the wrapper syntax. It runs an inner PowerShell separately so a user's `exit` cannot skip completion handling. Because ConPTY may consume arbitrary OSC completion markers, Windows checks the completion file and an idle period of 150ms after the last output before closing the console. Verification of actual large-volume output, cancellation, Unicode, and resize is the responsibility of the Windows CI fixture; this is not described as a protocol that fully guarantees arbitrary delayed output.

Windows file boundaries normalize drives and case according to `path.win32.relative`. ADS, reserved device names, and trailing dots/spaces in relative file paths are rejected, and actual symlink/junction boundaries are checked alongside existing file permission checks.

## Execution, updates, and scheduling

Windows prebuilt targets are Node.js 24 on x64/arm64 and Windows 10 1809 or later and Windows 11. Git features require Git for Windows on PATH. User working folders, accounts/conversations/device registrations in `%LOCALAPPDATA%/mew/data`, and runtimes in `%LOCALAPPDATA%/mew/cache/runtimes` are kept separate. Locations specified through CLI options or `MEW_DATA_DIR` take precedence.

After the first public release, run the following in PowerShell. No npm or GitHub runtimes were published during the current work.

```powershell
cd C:\work\project
npx @liiiiv/mew-cli@latest
```

The first run uses the existing owner setup flow, loopback server, browser opening, and Mewlink device registration. To update, exit the CLI and run the same command again. Windows shutdown requests graceful termination through IPC, then forcibly terminates after the timeout. While using the cache as the installation, the CLI does not clone, pull, or rebuild. For source development, a separate Windows release build in an MSVC environment must prepare the process host.

Recurring tasks run every minute through a single Task Scheduler entry for the current user with standard privileges, identified by a hash of the state path. The private `windows-schedules.cron` uses 5-field cron expressions supporting numbers, ranges, lists, steps, and month/day-of-week aliases, along with PowerShell commands, evaluated in OS local time. A file stamp prevents duplicates within the same minute, and saving an empty configuration removes only mew's task. When the server starts from a new runtime, it updates the runner path for saved schedules. Existing Windows Task Scheduler entries are not modified. The task has a 1-minute limit, and each control call has a 30-second limit; long-running agent tasks run in separate psmux sessions. Tasks run while logged in, with no contract to retroactively run tasks missed during logout or sleep.

General commands and project buttons also use PowerShell syntax. Existing Bash commands must be adapted to the execution environment. Windows automatic installation is not provided for Cursor and Prime's Unix automatic installers or the currently registered Antigravity distribution. Check each provider's Windows support for provider executables, login, and DAP engines. Optional remote desktop and OS permission setup follow their existing contracts.

## Redistribution notices

Includes the [original psmux MIT license](https://github.com/psmux/psmux/blob/v3.4.0/LICENSE) and notices for modified portable-pty and vt100. SHA-256 hashes for binaries and original source materials are pinned, and download checksums are also verified for the 247 registry dependencies in Cargo.lock. Complete `.crate` source archives are included, preserving licenses, copyrights, and NOTICE files; `dependencies.json` records the original declarations and the licenses selected for distribution. Permitted alternatives under OR are distinguished from all required conditions under AND; standalone conditions, source, or missing licenses not covered by the review list halt release packaging. Detailed release procedures follow [CLI releases](../operations/cli-release.md).

## Implementation, verification, and application

On 2026-10-14, the shared/OS execution layers, Windows CLI, releases, scheduling, mutually authenticated IPC, graceful shutdown, and CI verification paths were implemented. The scope verified in this work is as follows.

- Type checking, targeted lint checks (no errors, 1 existing warning in `primeAdapter.ts`), and 12 isolated CLI checks on Linux passed.
- Passed 44 existing agent, independent supervisor, and command queue/output regression tests, and 73 of 75 operations, login, Git, MCP, memory, scheduling, and release checks. Skipped 2 checks requiring a Linux systemd environment.
- Passed 17 of 18 CLI and OS fixtures on actual Windows with Node.js 24.21.0 and PowerShell. Skipped 1 Unix legacy PID check. Verified named pipe behavior with correct keys, incorrect keys, and role replay; current SID/SYSTEM ACLs; junctions without administrator privileges; Korean/emoji; and explicit exit codes. The actual mew server and user workspaces were not run.
- Verified the original `.crate` checksums and license selection availability for 247 psmux registry dependencies. Release packaging itself was not run.

Job Object descendant/parent termination, CMD argv, actual psmux creation/input/capture/attach, ConPTY resize, and command archive/exit/cancellation in `server/windows-native.test.ts` were connected to Windows x64/arm64 CI. There are still no results from running MSVC compilation, the full native fixtures, or compiled mew host startup. Actual Task Scheduler registration/permissions, logon/sleep/DST, native dependency installation on both architectures, actual provider authentication, Git credentials, DAP, and external-network/mobile access are also tests on actual machines required before public support.

The first npm/GitHub release and actual external-network and remote desktop verification follow the existing contracts. Implementation and partial verification in a real environment must not be described as an already published runtime or full compatibility with all providers. Agents do not build the production app or start/restart the server.
