---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Agent sets are tab startup presets. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0095 — Agent sets are tab startup presets"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Adopted
- Follow-up decision: [0159](0159-mew-feature-driven-development.md) — Retain set presets and add a separate project feature task system
- Follow-up decision: [0096](0096-mew-agent-tabs-created-after-selection.md) — Timing of new tab selection and creation
- Supersedes: [0052](0052-mew-agent-sets-router-dispatch.md) — Remove its unique decisions or incorporate them into this ADR; see the body for shared boundaries that remain
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0052](0052-mew-agent-sets-router-dispatch.md) treated agent sets as unattended work units, with a router in a separate window assigning prompts to the target set's server queue. This added a routing turn and split the workflow from the agent window where an agent works with a person in a single conversation.

## Options

1. Keep the router and queue in a separate window — unattended division of work remains, but tab conversations and the selection flow remain separate.
2. Convert sets into tab startup presets — select a runtime or set in the same way in a new tab and start a conversation immediately.

## Decision

Adopt option 2.

- An agent set is a `런타임 + 선택 모델 + 역할` information object. Its role is prepended once as system instructions before the first user prompt in that tab's ACP session.
- Place a `런타임 | 에이전트셋` toggle at the top of the new tab runtime selection screen. Runtime shows the existing list; agent sets shows the list of saved sets with a final `+ 새 에이전트셋 추가` entry.
- Either selection opens an ACP session in the same agent window tab. A set fixes the runtime, model, and role for that tab; a tab with only a runtime selected uses the existing runtime defaults.
- The set list has no router, and the router, server-owned task queue, and separate agent set window are removed. If older saved values contain a router, exclude it when reading them.
- Retain set definition CRUD and discovery of model candidates for each runtime. If no model candidates are available, discover them or enter one manually on the create/edit screen as before.

## Rationale

This fits the model in [ADR 0046](0046-mew-agent-panel-tabs-one-session-per-tab.md), where one tab represents one conversation between a person and an agent. A preset is simply configuration for starting a conversation and creates no separate task lifecycle or queue, bringing selection, progress checks, and stopping into one screen.

## Results

- Only agent set definitions persist after a server restart; running tab sessions follow the existing agent window supervision and restoration contract.
- Unattended routing and per-set task history are not provided. If needed again, they will be addressed through a separate task system rather than by extending this preset model.
