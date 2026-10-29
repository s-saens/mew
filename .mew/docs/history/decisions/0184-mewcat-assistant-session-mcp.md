---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: dedicated Mewcat assistant sessions and automatic MCP. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0184 — Dedicated Mewcat assistant sessions and automatic MCP"
created: 2026-09-30
updated: 2026-09-30
---

- Date: 2026-09-30
- Status: Adopted
- Partially supersedes: [0157](0157-mew-native-agent-harness-management.md) — Add automatic per-session injection of the built-in MCP dedicated to Mewcat while preserving the original MCP management contract
- Decision makers: user (requested Mewcat conversations, direct actions, and automatic MCP), Codex (implementation)

## Background

Users must be able to ask questions and execute actual features from the existing Mewcat notification and resource popup so they can start projects without studying Mew configuration.

## Decision

- Mewcat uses a dedicated ACP conversation per account, browser tab, and runtime. The working directory is fixed to a dedicated folder in the data directory, and the current project is passed separately with every request. Do not mix it with conversations for project work.
- Reuse the existing independent supervisor and conversation storage and restoration. Inject Mew's built-in stdio MCP into session/new and session/load without changing the external runtime's global or project configuration files. Users select and authenticate an agent without separately installing or connecting MCP.
- The MCP bridge connects to the app server through a Unix socket restricted to the local user. Recheck the original web session's account and permissions on every call. Request navigation in the corresponding browser and complete the tool only after receiving the actual result. Do not report success on disconnection, permission revocation, or timeout.
- The initial tool scope covers current context and product help, creating and opening projects, initialization that preserves existing documents, opening files and panels, and opening conversations for project work. No deletion, deployment, or update tools are provided.
- UI, status, error, hint, and accessibility text, along with new document templates, support four languages. Every request instructs the AI to respond in the current UI language. Existing conversations, documents, and user names are not automatically translated.

## Rationale

ACP's per-session MCP delivery allows use of the runtime's existing tool invocation path without manual configuration. Separating server features from screen actions allows reuse of existing API permissions and UI state restoration while confirming execution completion. The agent's own shell and file access follows existing execution permissions; MCP does not serve as an OS sandbox.

Current contract: [Mewcat assistant](../../specs/mewcat-assistant.md).
