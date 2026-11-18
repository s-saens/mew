---
title: "Address agent replies by conversation message ID"
description: "Records the decision to use stored bubble IDs and structured reply references in agent conversations. Covers targeted history retrieval, runtime context, and existing Markdown quotes."
created: "2026-11-18"
updated: "2026-11-18"
---

# Address agent replies by conversation message ID

## Status

Accepted.

## Context

Mew copied the full selected text into each reply as a Markdown quote. Long answers then appeared twice, and the reader could not jump from the reply to its source. The live transcript loads the latest turns first and fetches older ranges on demand. A display position can change when Mew reconciles its transcript with provider history. [Conversation storage](../development/conversation-storage.md).

## Decision

Give addressable user and agent bubbles persistent IDs within the conversation. Store the target ID, source kind, and a bounded excerpt with each linked reply. Resolve an on-screen target locally and request an older target through the existing authenticated history connection. Keep the runtime's reply context separate from the display body. [Reply reference contract](../development/conversation-storage.md#reply-references).

## Alternatives and rationale

A shortened quote saves room but provides no reliable way to locate the source when two messages share the same text. An event offset depends on the current history generation. A stored ID gives Mew a target independent of text and position, while a bounded excerpt identifies the source in a small space. A targeted history request keeps network traffic and rendering independent of the distance to the source.

## Consequences

Replies keep their source links when Mew restores the corresponding transcript records. Older replies stored solely as Markdown remain ordinary quotes. Target lookups use the permissions and scope of the open conversation. [Reply behavior](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#reply-to-a-message).
