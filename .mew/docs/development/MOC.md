---
title: "Development contracts"
created: "2026-09-11"
updated: "2026-10-14"
description: "Links development setup, architecture, shared UI, and implementation contracts for documents, storage, agents, permissions, collaboration, and remote access by area."
상위파일: "../MOC.md"
---
# Development contracts

Before changing code, read [Development environment, execution restrictions, and validation rules](getting-started.md). [Feature specifications](../features/_features.md) owns feature-specific requirements and acceptance criteria.

## Getting started and shared contracts

- [Development environment, validation, and required UI rules](getting-started.md)
- [Server structure and state files](architecture.md)
- [Shared packages](packages.md)
- [UI design, panels, input, and keyboard shortcuts](ui-contracts.md)
- [Prebuilt CLI execution, data, and updates](cli-distribution.md)
- [Windows native execution layer](windows-native.md)

## Documents and storage

- [Documents parent and child documents and representative files](document-pages.md)
- [Document link graph and backlinks](document-graph.md)
- [PDF rendering, handwriting, and saving](pdf-viewer.md)
- [Browser storage, cache, and drafts](browser-storage.md)
- [Task panel and Markdown storage](task-list.md)

## Agents, accounts, and collaboration

- [Agent sessions and communication](agent-sessions.md)
- [Conversation storage and segment synchronization](conversation-storage.md)
- [Skills and MCP management and APIs](../../../docs/configuration/agent-harness.md)
- [Per-account feature and file permissions](access-control.md)
- [Per-account Git connections, OAuth, and commit authors](git-connections.md)
- [Collaboration rooms and member chat](collaboration.md)

## Remote access

- [Mewlink, P2P remote access, and authentication](remote-access.md)
- [Network usage aggregation](network-usage.md)

Check each document for the current contract and scope of verification on actual devices. Research and work records are preserved in [work](../work/_work.md), and previous implementations in [history](../history/MOC.md).
