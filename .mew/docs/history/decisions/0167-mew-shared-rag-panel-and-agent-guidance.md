---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew shared RAG settings, panel, and agent search guidance. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0167 — mew shared RAG settings, panel, and agent search guidance"
created: 2026-09-22
updated: 2026-09-29
---

- Date: 2026-09-22
- Status: Superseded by: 0176
- Subsequent decision: [0176](0176-mew-remove-local-rag.md) — Remove all local RAG functionality
- Decision maker: User request
- Related: [0071](0071-mew-embedded-lancedb-local-rag.md) · [0165](0165-mew-common-agent-guidance-file.md)

## Decision

- All projects on the same Mew server share the RAG usage and agent guidance settings in `DATA_DIR/rag-settings.json`. Both default to on. `MEW_RAG_ENABLED=0` is an overriding disable setting and cannot be cleared through the UI.
- Place the RAG panel at the far right of the default mobile bottom dock and in the desktop menu. Provide model, DB identifier, indexed file, and chunk information for the current project/linked Documents, along with search and reindexing. Shared settings do not grant permission to search other projects' documents.
- Attach a runtime-neutral local CLI search command to ACP requests with shared guidance enabled. Instruct agents to find relevant documents and check the original text for tasks requiring project knowledge; agents decide whether to run searches. Retain the boundaries for disabling project automatic guidance and for direct terminal input. Do not overwrite existing user shared guidance files.
- The CLI uses project, Documents, and data paths bound to the session and accepts JSON stdin. It runs with existing shell permissions and does not create a separate HTTP path that bypasses authentication. It uses the same LanceDB index as the web API and serializes reads and writes through interprocess locking.
- The panel API retains login and file permissions, and changing settings or reindexing requires the `system` feature permission. Requests during project switches are pinned to the original root or rejected with 409. Search and listings are limited to currently visible files.

## Rationale

Provide search usage guidance without per-project settings copies, and let users inspect the derived DB actually in use. Retain built-in local search, original-text SSoT, and permission boundaries.
