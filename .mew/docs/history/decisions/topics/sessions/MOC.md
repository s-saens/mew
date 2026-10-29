---
title: "Mew ADR — Conversations, tabs, supervision, and queues"
created: 2026-09-11
updated: 2026-09-21
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0205 — Aggregate agent budget based on available memory](../../0205-mew-dynamic-agent-memory.md)

- [0198 — Inline feature title editing](../../0198-mew-inline-feature-title.md)

- [0197 — Device-specific workspace layout](../../0197-mew-device-local-workspace-layout.md) — Changes layout, document tabs, and panel restoration priorities in 0094 and 0134

- [0196 — Feature filenames, document hierarchy, and a simplified panel](../../0196-mew-file-backed-feature-tree.md) — Changes titles, hierarchy, and detail display in 0161 and 0194

- [0194 — Read-only feature panel](../../0194-mew-readonly-feature-panel.md)

- [0192 — Automatic resumption after memory recovery](../../0192-mew-agent-memory-auto-resume.md)

- [0186 — Continue running the pending queue after canceling a task](../../0186-mew-cancel-active-continues-queue.md)

- [0182 — Conversation SQLite, IndexedDB, and incremental synchronization](../../0182-mew-incremental-conversation-storage.md)

- [0173 — Inline specification editing and task intake in the feature hierarchy](../../0173-mew-inline-feature-edit-dispatch.md)

- [0164 — Memory limits and task deferral](../../0164-mew-agent-memory-protection.md)

- [0161 — Markdown feature documents as the canonical source](../../0161-mew-feature-markdown-source.md)
- [0159 — Project feature ledger and agent implementation requests](../../0159-mew-feature-driven-development.md)
- [0153 — Shared AI and CLI execution queue](../../0153-mew-agent-cli-shared-queue.md)
- [0152 — CLI commands and persistent output records in agent conversations](../../0152-mew-agent-cli-command-records.md)
- [0140 — Release the previous writer at the Codex /clear boundary](../../0140-mew-codex-clear-releases-writer.md)
- [0122 — Loading Codex history replaces the writer](../../0122-mew-codex-history-load-restarts-writer.md)
- [0118 — Queued agent messages lock execution while being edited](../../0118-mew-agent-queue-edit-lock.md)
- [0103 — /clear is a session boundary in the prompt queue](../../0103-mew-queued-clear-session-boundary.md)
- [0099 — Start a new conversation from agent panel history](../../0099-mew-agent-history-new-conversation.md) — New conversation in history; entering /clear is covered by 0103
- [0097 — Remove the working directory input bar from the agent panel](../../0097-mew-agent-panel-removes-cwd-bar.md)
- [0096 — Create agent tabs after selection is complete](../../0096-mew-agent-tabs-created-after-selection.md)
- [0095 — Agent sets are tab startup presets](../../0095-mew-agent-sets-as-tab-presets.md)
- [0093 — Project and agent tab state belongs to the account](../../0093-mew-account-synced-project-and-agent-tabs.md) — Per-account tab ledger; UI state extensions are covered by 0094
- [0092 — Switching root projects does not terminate agent tasks](../../0092-mew-agent-survives-root-project-switch.md)
- [0091 — Scheduled sends in agent tabs return to the original session](../../0091-mew-agent-tab-scheduled-prompts.md)
- [0087 — Separate agent tabs by root project](../../0087-mew-agent-tabs-per-root-project.md)
- [0079 — Agent tabs automatically restore the last session even after idle shutdown](../../0079-mew-agent-tabs-resume-after-idle.md)
- [0077 — Agent tabs can select working directories outside the workspace](../../0077-mew-agent-tab-working-directory.md) — cwd session key; the directory change UI is removed in 0097
- [0062 — Start sessions after runtime selection](../../0062-mew-agent-tab-runtime-gate-and-install.md) — No execution before selection and installation boundaries; tab creation is covered by 0096
- [0048 — The supervisor process owns the agent lifecycle](../../0048-mew-agent-supervisor-process.md) — Independent supervision; surviving root project switches is covered by 0092
- [0047 — Session list from disk and nonblocking connection](../../0047-mew-agent-session-list-from-disk-and-nonblocking-connect.md)
- [0046 — One tab is one session](../../0046-mew-agent-panel-tabs-one-session-per-tab.md) — Tab = session; subsequent decisions apply to creation, storage, and execution surfaces
- [0036 — Session controls, prompt queue, and usage](../../0036-mew-agent-session-controls-and-usage.md) — Basic session and queue contract; subsequent decisions apply to lists, clear, and writer
