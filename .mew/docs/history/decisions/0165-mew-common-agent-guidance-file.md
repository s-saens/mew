---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Record of the decision on the existing common agent guidance file, reading it at ACP request time, and permissions. The file format and entry point are subsequently changed by ADR 0171, and the storage scope by ADR 0202."
title: "0165 — mew shared agent guidance file"
created: 2026-09-22
updated: 2026-09-22
---

- Date: 2026-09-22
- Status: Adopted
- Subsequent decision: [0202](0202-mew-account-agent-settings.md) — per-login-account storage of default guidance, runtime settings, and model defaults; existing editing, permission, and delivery boundaries remain
- Subsequent decision: [0171](0171-mew-agent-guidance-settings.md) — settings entry point in the agent panel and Markdown canonical source; shared scope, permissions, and delivery timing remain
- Partially supersedes: [0155](0155-mew-project-agent-context.md) — source storage and editing path for shared guidance; project settings and ACP delivery boundaries remain
- Decision maker: User request

## Decision

- The canonical source for server-wide shared guidance is `DATA_DIR/agent-guidance.txt`. The repository's `server/prompts/agent-guidance.txt` provides defaults for initial creation; updates do not overwrite existing user files.
- Display the shared guidance file above Documents in the sidebar and open it in the existing server file editor. Visibility and editing require `serverFiles`, the same permission as the server file explorer.
- Read the file immediately before ACP execution. Saved guidance applies starting with the next request, regardless of project or session. Combine project paths, document entry points, and additional instructions separately.
- If the file is missing, create the default file when executing or opening it. Settings previews read the defaults without creating the file. An empty file clears only the shared text; do not hide read errors.
- Guidance remains a separate ACP text block and does not impersonate a system role. Retain the boundaries for disabling automatic guidance per project and for direct terminal input.

## Rationale

Allow editing shared text without code changes while avoiding per-project copies and loss of user edits during deployment. Reuse the current file editor's save and tab behavior.
