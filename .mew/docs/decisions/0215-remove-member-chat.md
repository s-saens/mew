---
title: "0215: Remove member chat"
description: "Retires group chat, direct messages, read receipts, and chat notifications. Preserves legacy chat history on disk and keeps document comments and mentions available."
status: accepted
date: "2026-11-25"
---

# Remove member chat

## Context

Members rarely used the separate group chat and direct messages. Chat required its own Dock panel, permission, notifications, API, and message ledger. Comments and replies already give members a place to discuss specific passages in documents.

## Decision

Remove group chat, direct messages, read receipts, the chat notification flow, and the chat permission from both Mew and the demo. Remove the Dock entry, the `Alt+C` action, the `/api/chat` and `/api/chat/read` routes, and chat presence signals. Ignore legacy chat entries in saved Dock preferences and workspace layouts. Leave stored shortcut preferences in place.

Keep member mentions in [document comments and replies](../features/collaboration-comments-chat/comments-replies-and-member-mentions.md). The comment composer still offers member suggestions. A mention stays in the comment or reply and sends no direct message. Shared notes, collaborative editing, active sessions, and agent conversations keep their existing interfaces.

This supersedes [ADR 0050](../history/decisions/0050-mew-chat-dm-and-read-receipts.md) and the chat portions of [ADR 0049](../history/decisions/0049-mew-team-chat-and-inline-comments.md). The [former feature contract](../features/collaboration-comments-chat/group-chat-direct-messages-and-read-status.md) preserves the previous scope and assessment.

## Alternatives and consequences

Hiding the Dock entry alone would leave the chat API, permissions, and delivery code in service for a feature members rarely use. Removing them ends in-app access to old conversations. Existing `MEW_DATA_DIR/chat.json` files remain on disk because deleting the feature does not authorize deleting private messages. Follow the [stored-data guidance](../../../docs/operations/security.md#stored-data) when handling those files and their backups.
