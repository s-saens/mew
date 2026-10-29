---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Run Prime Agent as a local ACP compatibility fork. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0076 — Run Prime Agent as a local ACP compatibility fork"
created: 2026-08-24
updated: 2026-08-24
---

- Date: 2026-08-24
- Status: Superseded by: 0089
- Decision maker: Song Sanghoon (directive)
- Related: [ADR 0036](0036-mew-agent-session-controls-and-usage.md), [ADR 0060](0060-mew-shared-agent-runtime-registry.md)

## Background

Prime Agent 0.8.0 includes an ACP server in its main repository at `packages/coding-agent/src/modes/acp/` and runs through `prime-agent --mode acp`.
There is no separate ACP adapter repository. However, this version advertises
`loadSession: false` and does not implement `session/list`, `session/load`, or model state and changes, so conversation history
and the model selector do not appear in the mew agent window. Prime's
internal connection layer already has `listSavedSessions`, `switchSession`, `getAvailableModels`, and `setModel`; only ACP exposure is missing.

Directly interpreting Prime's JSONL storage format or TUI commands within mew for features whose upstream acceptance is uncertain would break the existing
decisions (0036, 0060) establishing ACP as the common interface, and both implementations would become outdated together.

## Decision

- Keep a local clone of Prime Agent itself at `/home/saens/dev/prime-agent-acp` without overwriting the official installation.
- The local branch `feat/acp-session-history-models` adds the following compatibility features to the main ACP implementation.
  - `session/list` and `session/load`, with the corresponding capability advertisement
  - Replay loaded transcripts through ACP `session/update`
  - Pass the model list as `modelsJson` in the Prime namespace of `_meta`
  - `session/set_model` compatible with the existing mew client
- In mew's `<DATA_DIR>/agent-settings.json`, set `prime.cmd` to the local build
  at `/home/saens/dev/prime-agent-acp/packages/coding-agent/dist/bundle/cli.js`. Do not add secrets to either this configuration or the
  documentation.
- mew does not read Prime's saved files directly. History and model operations continue to use only the ACP wire protocol.
- Installing or updating the official `prime-agent` does not automatically change the local build used by
  mew. Explicitly rebase, validate, and rebuild upstream updates according to the operational procedure at the time (`ops/mew/prime-agent-acp-fork.md`, file currently absent; see [ADR 0089](0089-mew-prime-agent-official-rpc-adapter.md) for the subsequent decision).

## Removal conditions

Once upstream Prime Agent releases equivalent `session/list`, `session/load`, and ACP model configuration support, stop replicating the local patches. Drop
the corresponding commits, revert the `prime.cmd` override to the official executable, and supersede this ADR. If only some
changes land upstream, remove the overlapping local commits first.

## Results

- History and model selection are available in mew's Prime tab.
- Upstream updates are not followed automatically; if ACP files change, a person must resolve rebase conflicts.
- The local fork is a deployment dependency, so mew's runtime configuration must be changed before deleting it or changing its path.
- Propose upstream contributions for history and modern ACP `configOptions` model support separately. Do not demand that
  `modelsJson` and `session/set_model`, which support older mew versions, become the upstream contract as-is.
