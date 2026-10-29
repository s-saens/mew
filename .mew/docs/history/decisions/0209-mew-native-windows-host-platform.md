---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0209 — mew adds a native Windows server through a shared app and OS-specific execution layers"
description: "Retain existing Linux, macOS, and WSL contracts and define boundaries for the native Windows server's psmux, Job Object, ACLs, mutually authenticated named pipes, and platform-specific prebuilt distribution. Public support follows Windows CI and real-hardware gates."
created: "2026-10-14"
updated: "2026-10-14"
---

- Date: 2026-10-14
- Status: adopted and implemented in code; Windows CI and real-hardware gates required before public support
- Decision makers: User direction, Codex design and implementation
- Partial extension: [0111](0111-mew-native-deployment-and-supervisor.md) — Add native Windows to supported server implementations while retaining non-administrator execution, loopback, data preservation, and supervision boundaries
- Subsequent decision: [0210](0210-mew-retire-mewnager.md) — Supersedes the management-app retention clause below and unifies execution through the shared CLI
- Related: [0048](0048-mew-agent-supervisor-process.md) · [0201](0201-mew-windows-manager-wsl.md)

## Decision

- Keep UI, accounts, editing, Git, and Mewlink in the same codebase, and isolate OS-dependent implementations in mew's `server/platform/` and the terminal package's backend folder. Do not duplicate the entire app for each OS.
- Windows terminals use a pinned version of MIT-licensed psmux and distribute its binary with dependency notices. Linux and macOS retain the existing tmux.
- For long-running Windows tasks, a native helper attaches the child to a Job Object while suspended, then runs it. Descendants terminate when the helper exits, while the independently supervised lifecycle across server reconnections is retained.
- Protect private Windows state with ACLs for the current OS user and SYSTEM. On named pipes, perform mutual challenge-response authentication using the private-state key before existing account and project permission checks. Do not transmit keys through argv, env, or logs.
- The same npx CLI selects the prebuilt executable for each OS. Keep user projects, accounts, conversations, and device registrations separate from the executable cache.
- Retain the existing dedicated WSL contract for the Windows GUI management app. Extending native GUI operations is separate.
- Distinguish readiness of code and isolated tests from public publication, Windows real-hardware validation, and successful external-network access. Production app builds, deployments, and restarts follow the existing user-execution rules.

## Rationale and consequences

Native Windows cannot use Unix sockets, modes, or process groups as-is. Consolidate OS implementation responsibilities to share common feature changes and regression verification, and verify Windows boundaries separately. The [mew Native Windows Document](../../development/windows-native.md) owns the implementation contract and verification gates. This decision does not add container app support.
