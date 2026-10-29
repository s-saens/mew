---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: reintroduce the mew agent panel: ACP protocol, vendor independence, role gates. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0034 — Reintroduce the mew agent panel: ACP protocol, vendor independence, role gates"
created: 2026-08-04
updated: 2026-09-11
---

- Date: 2026-08-04
- Status: Adopted
- Follow-up decision: [0150](0150-mew-account-feature-and-file-permissions.md) — Fixed role gates for agents and tmux
- Follow-up decision: [0037](0037-mew-agent-bypass-permissions-default.md) — Permission defaults
- Follow-up decision: [0043](0043-mew-agent-workspace-scope-and-runtimes.md) — project-level file scope
- Follow-up decision: [0048](0048-mew-agent-supervisor-process.md) — coupling server and agent process lifetimes
- Follow-up decision: [0061](0061-mew-claude-acp-official-org-migration.md) — Claude ACP package
- Follow-up decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — the scope in which all interactive tabs use ACP
- Follow-up decision: [0119](0119-mew-unified-terminal-agent-panel.md) — separate panels for terminals and agents
- Follow-up decision: [0123](0123-mew-codex-acp-uses-host-cli.md) — internal engine of the Codex adapter
- Decision maker: Song Sanghoon (directive)
- Supersedes: the prohibition on "reintroducing or reinvestigating" in [ADR 0014](0014-mew-agent-panel-removal.md) (the rest remains valid)

## Background

[ADR 0014](0014-mew-agent-panel-removal.md) completely removed mew's agent panel on 2026-07-25. The reason was a bug of unknown origin — only when running inside the production server (`server/serve.ts`), the first message stalled for about 20 seconds and the client reported `Failed to fetch`; running the same code standalone did not reproduce it. We stopped without finding the cause, deciding not to spend more time on it.

There are two reasons to reopen this now.

1. The symptoms at the time were likely a consequence of the architecture. Restoring the deleted `server/agent.ts` from git (`git show 7bebca2^:server/agent.ts`) shows that it invoked Claude Code through the CLI in a blocking, non-streaming manner:

```js
const { stdout } = await exec(CLAUDE_BIN, ['-p', prompt, '--output-format', 'json', ...])
```

`-p --output-format json` does not emit a single byte until the entire turn finishes. During that time, the HTTP connection appears idle to intermediaries (proxies, express, and the browser). The failure to reproduce it standalone also fits this hypothesis — those intermediaries are absent in standalone execution. Reloading the entire session with `--resume` for every message is also consistent with the first turn being particularly slow.

This is a hypothesis, not a confirmed cause. But if the issue was a consequence of not streaming rather than an unknown cause, reintroducing it does not repeat the same failure. A streaming implementation prevents that condition from arising in the first place.

2. The requirements have changed. 0014 relied on the premise that "the terminal replaces 100% of it." What we want now is a chat UI, not a terminal — a panel with conversation history, tool approval buttons, and project scope. A tmux terminal cannot replace this.

## Options

The choice of protocol was the real fork in the road. Vendor independence is a requirement — we must be able to connect Hermes, Gemini CLI, Codex, and Kimi Code in addition to Claude.

1. Use the Claude SDK directly — fastest, with access to 100% of its features. Does not meet the vendor independence requirement.
2. Custom adapter layer — a thin normalization layer over each vendor's official SDK. Can expose all vendor features. However, it breaks silently when vendor specifications change, and fundamental differences between vendors, such as session resume and cancellation, do not fit into a common layer.
3. Fully separate implementations per vendor — even the plumbing is separate for each vendor. No features are lost, but sessions, WS, isolation, and role gates are duplicated for every vendor. In particular, with multiple copies of security and isolation policies, one is bound to be wrong.
4. ACP (Agent Client Protocol) — an editor↔agent standard using stdio JSON-RPC. Streaming, session loading, cancellation, and permission approval requests are part of the protocol.

## Decision

Adopt option 4 (ACP).

- mew's agent panel speaks only ACP. Switching vendors means changing the spawn target.
- Phase 1 has a single backend: `@zed-industries/claude-code-acp`. Pin the version; do not launch it with `npx @latest`. [ADR 0061](0061-mew-claude-acp-official-org-migration.md) superseded this specific package choice with its official successor package.
- Do not define a custom adapter interface. ACP is the interface. Do not create an abstraction with only one implementation.
- Spawn the agent as a child process. Do not run it inside a `serve.ts` request handler. Relay events as a stream over WS.
- The panel is not a terminal. The existing tmux terminal remains — this is an addition, not a replacement.

### Isolation and access permissions (by phase)

Do not grant members access in phase 1. Currently, `/tmux`, `/cmd-buttons`, and `/system-stats` all use `requireRole('owner','manager')`. Since the agent panel can execute shell commands, allowing access through a lower role gate would bypass that boundary.

- Phase 1 (now): no OS isolation. `requireRole('owner','manager')`. The agent runs as the same Unix user as the mew server.
- Phase 2 (not started): a separate Unix user + traversal permissions via `setfacl`. This works because `/home/saens` has permissions `drwxr-x---`. It cannot prevent network exfiltration, fork bombs, access to `/tmp`, or access to world-readable files.
- Phase 3 (not started): a Docker container per project + an egress allowlist proxy. Decide whether to grant members access only after reaching this phase.

### Invariants to uphold

- ~~Do not use `bypassPermissions` at the workspace root.~~ — [ADR 0037](0037-mew-agent-bypass-permissions-default.md) reversed this (2026-08-05). The assessment was that approval prompts merely asked again about shell permissions owner/manager already had, and container isolation could not protect the mounted project itself. The current default mode is `bypassPermissions`, and the gate (`authorizeTmux`) is the only control. The original rationale is in [ops/mew/security-review-2026-07-21.md](../security-review-2026-07-21.md) §4.
- ~~Scope file tools to the project folder. Add docs as read-only because SSoT rules require reading them.~~ — [ADR 0043](0043-mew-agent-workspace-scope-and-runtimes.md) reversed this (2026-08-10). The panel itself became workspace-scoped, so the file tool boundary is also the workspace (access between projects is not blocked). Bash cannot be path-scoped — isolation is effective only at the OS layer.
- Do not mount `~/.claude/.credentials.json` in a sandbox accessible to members. Use a separate API key.
- Never mount `/var/run/docker.sock` in an agent container. It is equivalent to host root access.
- Do not put push credentials (`~/.ssh` or gh tokens) in the sandbox. Use per-repository deploy keys if needed.
- Keep one contract test that runs an ACP handshake + one turn (streaming and a permission approval round trip). This test must fail first when an adapter upgrade breaks the contract.

### Do not confuse these — things that must not be changed together

The disk→room collaboration bridge is a separate path unrelated to this decision. It injects `.md` files edited by AI in the terminal into an open Yjs room with an `agent` cursor. It is distinct from both the agent panel removed by 0014 and the panel being built now. This warning in 0014 remains valid.

## Rationale

- The prohibition on "reinvestigation" in 0014 assumed an unknown cause. That premise has weakened — the structural explanation of blocking CLI calls covers all three symptoms (occurring only inside the server, on the first message, for about 20 seconds). Rebuilding with a different architecture does not mean hitting the same wall again.
- ACP was chosen because the hard parts are in the standard, not simply because it is a standard. Session resume, cancellation, and tool approval differ the most across vendors, and a custom adapter cannot fit these three into a common layer. ACP handles them at the protocol level. Feature differences remain, but capability declarations in `initialize` turn them into known constraints rather than silent failures.
- The adapters are not vendor-owned. `@zed-industries/claude-code-acp` is an open-source package from Zed, not Anthropic, and Gemini's ACP mode is also in its open-source CLI. Gaps in the adapter layer can be filled through forks or PRs without vendor permission. A vendor truly blocks a feature only when the underlying CLI/SDK does not expose it at all.
- Why fully separate implementations per vendor were rejected: vendor-specific code is a small fraction of the whole; the rest is plumbing such as sessions, WS, role gates, and isolated spawning. Duplicating that plumbing for each vendor fragments the UX across panels (which is not apparent in code review) and, above all, creates multiple copies of isolation and credential policies. Security policies must have a single source.

## Results

- The ACP specification and adapters are still young. Verify actual method signatures immediately before implementation — do not code from memory or cached documentation.
- There is only one vendor in phase 1. Until a second one (such as Gemini CLI) is connected, "vendor independence" remains unverified.
- The cause of the 20-second stall remains a hypothesis. Treat the absence of reproduction under the streaming architecture as confirmation; if it does recur, record it again, since that would invalidate this ADR's premise.
- This ADR does not authorize member access. Granting access without phase 3 isolation requires a separate decision.
