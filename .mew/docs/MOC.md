---
title: "Mew project documentation"
created: "2026-09-11"
updated: "2026-10-29"
description: "Connects the Mew project's current features, implementation contracts, decisions, and maintenance with tasks, work, investigations, and history. Directs readers to a separate documentation home for public installation and usage guides."
상위파일: "../../README.md"
---
# Mew project documentation

The project documentation home for finding current features, shared implementation contracts, decisions, maintenance procedures, and evidence from work and investigations. For installation, operation, and configuration, follow the [public documentation](../../docs/README.md).

## Development, deployment, and operations

| Goal | Document |
| --- | --- |
| Check execution and verification rules before changing code | [Getting started with development](development/getting-started.md) |
| Look up requirements and verification criteria for a specific feature | [Feature specifications](features/_features.md) |
| Look up storage, communication, permissions, and UI implementation contracts | [Development contract](development/MOC.md) |
| Check native Windows implementation and release conditions | [Windows execution contract](development/windows-native.md) · [CLI releases](operations/cli-release.md) |
| Maintain central services and repositories | [Mewlink](operations/remote-central.md) · [Repository](operations/repository-maintenance.md) |
| Check access management, diagnostics, recovery, and rollout | [Operations](../../docs/operations/MOC.md) |
| Check authentication, roles, and guest access boundaries | [Security](../../docs/operations/security.md) |

## Work and evidence

Check feature specifications and the development contract for current behavior. Tasks track work to do and completion status; work records retain evidence of design, implementation, and verification. Successful verification of work does not mean it has actually been applied to production.

- [Tasks](../tasks/_tasks.md)
- [Implementation plans, investigations, and verification records](work/_work.md)
- [Research and performance measurements](research/_research.md)
- [Comparison of description and MOC navigation costs](research/desc-moc-benchmark.md)
- [Mew decision records](decisions/README.md)

## Documentation authoring and agent navigation

[Documentation authoring and ownership rules](README.md) · [Agent navigation sequence](AGENT.md) · [Default documentation skill](../../docs/configuration/agent-harness.md#language-specific-documentation-skills)

Agents use `node server/document-descriptions.ts` to select the current documents they need. This home helps people find topics in the Documents screen; it is not a mandatory index covering every file.

## History / raw

- [Previous implementations, removed features, and original verification records](history/MOC.md)
- [Previous Specs path — relocation notice](specs/MOC.md)
- [Comparison of RAG, MOC, and regular file search](research/document-discovery-benchmark.md)
- [Previous Electron remote desktop investigation](research/remote-desktop-latency.md)
- [Startup latency investigation before the switch to a resident host](research/remote-desktop-startup.md)
