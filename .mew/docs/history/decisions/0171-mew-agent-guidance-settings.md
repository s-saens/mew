---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "A record of the decision on selecting default guidance, editing Markdown source, and protecting against conflicts in the agent panel. The shared storage scope is changed to per-account storage by subsequent ADR 0202."
title: "0171 — Agent default guidance settings and the Markdown canonical source"
created: 2026-09-23
updated: 2026-09-23
---

- Date: 2026-09-23
- Status: Adopted
- Subsequent decision: [0202](0202-mew-account-agent-settings.md) — per-login-account storage of default guidance, runtime settings, and model defaults; existing editing, permission, and delivery boundaries remain
- Partially supersedes: [0165](0165-mew-common-agent-guidance-file.md) — settings entry point and source file format; retain the server-wide scope, permissions, and ACP delivery timing
- Decision maker: User request

## Decision

- Remove the shared guidance row from the sidebar and place a default guidance settings button next to Skills and MCP in the agent panel. Preserve the server file permission (`serverFiles`) boundary.
- The canonical source is `DATA_DIR/agent-guidance.md`. If an existing TXT file is present, create it initially by copying that file's contents unchanged. Preserve the existing TXT file, but use MD for subsequent reading and editing. Do not overwrite an existing MD file.
- Store commit method, response language, and response length as plain guidance sentences in marked sections for each item within the MD file. Do not create a separate settings copy. Replace only changed items and preserve the rest of the manually written source.
- Use View File to edit the source in the existing editor. The settings dialog reads selected values from the source and distinguishes custom wording. If the source has changed, do not save against an older revision.
- Apply shared settings starting with the next actual ACP request. Preserve the boundaries for disabling automatic project guidance, additional project guidance, and direct terminal input.

## Rationale

Provide a selection UI for frequently used guidance while retaining unrestricted source editing. Use a single source so existing user guidance is not lost during migration or settings changes.
