---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: removal of the mew agent panel and prohibition on reintroducing or reinvestigating it. Preserves the choices, rationale, and subsequent changes at the time; consult Mew's owning documents for the current contract."
title: "0014 — Remove the mew agent panel; prohibit reintroduction and reinvestigation"
created: 2026-07-27
updated: 2026-08-21
---

- Date: 2026-07-25 (decision) / 2026-07-27 (recorded in SSoT)
- Status: Superseded by: 0034
- Decision maker: Song Sanghoon (directive)

> What was reversed (2026-08-04): the "prohibition on reintroduction and reinvestigation" was superseded by [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md). The premise behind "the cause could not be found" below was called into question — the removed `server/agent.ts` invoked Claude Code CLI with `-p --output-format json`, meaning blocking, non-streaming execution. Because not a single byte flows until the turn ends, intermediaries see an idle connection. The failure to reproduce it outside the server is also consistent with this explanation. 0034 rebuilds it using a streaming (ACP) architecture.
>
> What remains valid: the removal itself and its rationale · the concern about `bypassPermissions` · "What must not be removed along with it" below (the disk-to-room collaboration bridge).

> This decision was executed on 2026-07-25 but was not recorded anywhere — the ops/repos.md (`이전 Liiiiv 문서: ops/repos.md`) backlog marked it as "an ADR candidate because it explains why it was abandoned." It is being recorded during the cleanup for [ADR 0012](0012-docs-repo-doc-allowlist-and-absorption.md).

## Background

mew had a sidebar for conversing with a Claude Code agent in the browser — `packages/agent-panel` (client), `server/agent.ts` (SDK headless execution), and `server/mcp.ts` (MCP wiring).

Symptom: only when running inside the production server (`server/serve.ts`), the SDK's first message stalled for about 20 seconds, and the client received `Failed to fetch`. Running the same code standalone outside the server did not reproduce the issue.

The cause could not be found. With the issue narrowed down only to occurring in the `serve.ts` context, the user directed that the feature be removed.

## Options

1. Keep investigating the cause — Pros: restores the feature. Cons: reproduction is limited to "inside the production server," making isolation difficult, and substantial time has already been spent. This is an auxiliary feature unrelated to mew's core value (document editing).
2. Keep the feature but disable it — Pros: easy to restore later. Cons: dead code remains, causing future contributors to spend time asking "why won't this turn on?" The security exposure (an agent running with `bypassPermissions`) also remains.
3. Remove it entirely — delete the related packages and server modules, leaving only the terminal.

## Decision

Adopt option 3. Remove `packages/agent-panel`, `server/agent.ts`, and `server/mcp.ts` entirely, leaving only the terminal (tmux). To use an agent in the browser, launch Claude Code directly in the terminal.

Do not re-add or reinvestigate it. Reintroducing it requires a new ADR that supersedes this one. — 2026-08-04 [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) is that new ADR.

### Do not confuse these — what must not be removed along with it

The disk-to-room collaboration bridge is a working feature unrelated to this decision. It injects AI edits to `.md` made in the terminal into an open Yjs room in real time with an `agent` cursor, through a separate path from the removed agent panel. The `appWrites` echo ledger protects normal user typing. Do not remove it just because the names are similar.

## Rationale

- Do not spend unlimited time on an auxiliary feature. mew is an internal tool, and the terminal replaces 100% of the agent panel's functionality. Chasing unresolved bugs in a feature whose replacement is already on the same screen is not worth the cost.
- Why "disable and retain" was not chosen: dead code looks like "something to fix" to the next contributor. Without this ADR, that would actually have happened — because removal leaves no trace in the code (an example of write-back trigger 7 in [README.md](../../README.md)).
- Security side effect: the removed agent ran at the workspace root with `--permission-mode bypassPermissions`. This eliminated one path that allowed file changes and command execution without approval (an item identified in [ops/mew/security-review-2026-07-21.md](../security-review-2026-07-21.md) §4).

## Results

- Verified on 2026-07-27 — `packages/` contains no `agent-panel`, and there are no references anywhere in the source. However, `mew/README.md` was still documenting this package (two days after removal). A real example of the drift addressed by ADR 0012.
