---
title: "Agent memory protection"
created: 2026-09-21
updated: 2026-10-09
description: "Explains how to install an aggregate agent limit of 90% of dynamically available memory on Linux systemd and cgroup v2, pause and resume tasks, diagnose and recover from issues, and understand WSL support boundaries."
상위파일: "MOC.md"
---

Decisions: [ADR 0205](../../.mew/docs/history/decisions/0205-mew-dynamic-agent-memory.md), [ADR 0164](../../.mew/docs/history/decisions/0164-mew-agent-memory-protection.md). Execution contract: [Agent sessions](../../.mew/docs/development/agent-sessions.md).

## Installing OS limits

Requires Linux cgroup v2, systemd 254 or later, and the current user's systemd manager. Root is not required. Run from the repository root as the OS user running mew.

```sh
sh native/agent-memory/install.sh
```

Installs and enables `~/.config/systemd/user/mew-agents.slice` (respecting `XDG_CONFIG_HOME`). Does not overwrite existing files. Does not restart current mew or agents or move them between groups. Only ACP adapters and agent panel CLI shells started with the new code enter `systemd-run --user --scope`. All tabs and child builds and checks share the same aggregate budget, while the mew server and independent supervisors remain outside.

| Setting | Default installed value | Role |
| --- | --- | --- |
| `MemoryHigh` | infinity | Removes the separate throttling limit that can stall even initialization |
| `MemoryMax` | Initially 90% of host RAM, then 90% of the dynamic budget | Final OS ceiling updated according to other application load and total WSL memory |
| `MemorySwapMax` | 25% of host RAM | Aggregate agent swap ceiling |

Each task scope uses `OOMPolicy=kill` to prevent only some children of the selected task from being killed while others remain. Normal termination and CLI cancellation also clean up descendants of that scope. No termination signal is sent to the entire shared slice. For systemd details, see [resource control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html) and [scope OOM policy](https://www.freedesktop.org/software/systemd/man/latest/systemd.scope.html).

`MEW_AGENT_MEMORY_SCOPE` supports `auto` (default), `required`, and `off`. `auto` applies when an enabled slice with a finite limit exists; otherwise, it logs a warning in the supervisor log and keeps monitoring available Linux memory. `required` refuses execution if OS limits cannot be prepared. `off` disables only the OS scope and keeps available-memory monitoring enabled. If execution in the configured scope fails, it does not retry without limits.

Before starting and during the existing 2-second monitoring cycle, the supervisor rereads `MemTotal` and `MemAvailable` from `/proc/meminfo`, along with slice usage. Unreclaimable agent usage is `max(0, memory.current - inactive_file)`, and the dynamic pool is `min(MemTotal, MemAvailable + 에이전트 회수 불가능 사용량)`. Adding memory already in use avoids subtracting the agents' own allocations twice. 90% of the pool is applied as `MemoryMax`. OS settings are applied when the target and actual ceiling differ by at least 64 MiB, and `MemoryHigh=infinity` is also restored. Multiple supervisors read actual cgroup values to reduce unnecessary duplicate settings.

The ceiling is not lowered below the current `memory.current`. If external application load or a decrease in total memory causes usage to exceed the budget, the cancellation and pause paths below first reduce usage, and the ceiling is then applied. The existing ceiling may remain temporarily. A configuration failure pauses tasks as an available-memory check failure; it does not bypass the limit by running without restrictions.

Existing installation files are preserved. Rerunning the installation script updates the runtime ceiling based on the current load. The initial 90% value for new installations also changes to a dynamic value at the first measurement. After systemd restarts, runtime settings are reapplied at the new supervisor's first measurement or by rerunning the installation script.

## Pausing and resuming tasks

The supervisor checks every 2 seconds and immediately before starting a task or dequeuing one. It uses Linux `MemAvailable` and does not rely solely on `MemFree`. For a shared slice, it calculates headroom by subtracting unreclaimable usage from the dynamic pool above. Software protection activates at 10% pool headroom, and the OS ceiling is also 90% of the pool, so 10% is not subtracted from the budget twice.

- Task starts are rejected if host or shared-slice headroom is **10% or less** (minimum headroom: 512 MiB). Active AI turns receive an ACP cancellation request, and CLI tasks use the existing interruption path.
- An out-of-memory error is displayed, and the date, runtime, available memory, and threshold are recorded in the supervisor log. The error transcript is also saved immediately. The order of queued AI tasks, CLI tasks, and `/clear` is preserved, and no next task runs until memory recovers.
- After recovery, when headroom is **greater than 20%** (minimum headroom: 1 GiB), tasks resume automatically during the 2-second monitoring cycle. On small machines, required headroom is capped at 40% of total memory. Resumption is refused while cancellation is still in progress.
- Scheduled messages and automated feature tasks only add to the paused queue; they do not resume it. Background one-shot runs return an error while paused. Automatic resumption does not release edit locks or authentication or usage holds.
- For an interrupted AI turn, a continuation message runs first in the same session with the original model, effort, and permissions. It instructs the agent to check the previous conversation and current file state and avoid repeating completed work. CLI commands are not rerun automatically; processing begins with the next queued task. The user's stop button removes automatic continuation and preserves the queue ([ADR 0192](../../.mew/docs/history/decisions/0192-mew-agent-memory-auto-resume.md)).
- Does not forcibly clear caches or terminate other processes. Waits for OS reclamation or user memory cleanup to free headroom.

SIGSTOP is not used because it does not release memory already in use. If ACP ignores cancellation or usage spikes between 2-second checks, the OS ceiling is the final line of defense. If the OS also terminates the adapter, the supervisor displays and saves the termination error and closes the session. In this case, the in-memory queue is not recovered, and work must restart from the saved completed conversation. A supervisor with queued tasks does not exit due to inactivity during a normal protective pause.

## Checks and logs

```sh
systemctl --user show mew-agents.slice -p ControlGroup -p MemoryHigh -p MemoryMax -p MemorySwapMax
systemctl --user list-units 'mew-agent-*.scope'
journalctl --user --since '1 hour ago' --grep='mew-agent|oom|Killed'
```

Check `memory.current`, `memory.max`, and `memory.events` at the path formed by prefixing `ControlGroup` with `/sys/fs/cgroup`. `oom_kill` is the cumulative count of OOM kills in that group. Find mew errors under `[mew:agent-memory]` in `<MEW_DATA_DIR>/agent/<runtime>-<hash>.log`. `SIGKILL`/137 alone is not conclusive evidence of insufficient memory, so assess it together with the journal.

New code applies starting with new supervisors. After ongoing work finishes, close existing agent tabs and open new tabs to apply it. Scheduling and feature execution code already loaded in the mew server takes effect after the user restarts the server. Restarting only the mew server leaves existing independent supervisors running, so that alone does not give existing agents the new protection. Agents do not build or restart the server.

## WSL and scope

The Windows user's `.wslconfig` owns the WSL VM's `memory` and `swap` ceilings and `autoMemoryReclaim`. Cache reclamation does not replace memory ceilings for running processes. Configuration changes require a WSL restart ([Microsoft configuration documentation](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)). This installation does not modify `.wslconfig`.

Regular terminals, agents on the terminal surface, and separate servers, Docker, browsers, and Windows processes are outside the limited group. Tasks that launch other services directly through user systemd may also leave the group. The supervisor's own transcript memory is also excluded from the scope ceiling. This is therefore resource protection, not a security sandbox or a guarantee against all WSL shutdowns. If all of WSL shuts down without a Linux OOM record, also check Windows events and VM errors.

These OS limits and `/proc` monitoring do not apply outside Linux.

## Verification

```sh
node --test --test-concurrency=2 server/agent-memory.test.ts server/agent-clear.test.ts server/agentAcp.test.ts server/agentHost.test.ts server/agent-commands.test.ts
# slice 설치 환경에서만: 64MiB의 별도 scope 안에서 OOM을 발생시키는 제한된 통합 검사
MEW_TEST_MEMORY_SCOPE=1 node --test server/agent-memory.test.ts
```

Do not exhaust actual host memory. Use synthetic memory values to verify AI and CLI cancellation, queue preservation, recovery thresholds, automatic continuation, user interruption, and pausing of automated scheduled tasks. OS checks verify scope membership, preservation of original arguments, and OOM termination within a 64 MiB limit.
