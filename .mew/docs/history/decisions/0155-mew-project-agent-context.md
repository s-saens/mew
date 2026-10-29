---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Automatic delivery of mew project context and document initialization. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0155 — Automatic delivery of mew project context and document initialization"
created: 2026-09-16
updated: 2026-09-22
---

- Date: 2026-09-16
- Status: Adopted
- Follow-up decision: [0165](0165-mew-common-agent-guidance-file.md) — Move common guidance to a shared server file and edit it in the sidebar; retain project settings and ACP delivery boundaries
- Partially supersedes: [0053](0053-mew-docs-folder-chosen-in-workspace-root.md) — Save the Documents selection primarily in per-project settings; use existing preferences as a fallback
- Decision maker: Codex implementation at the user's request

## Background

Even in new projects, agents must explore Documents and write work results back to the documentation without requiring a separate AGENTS.md. Agents running during project switches must not receive documentation from another project.

## Options

1. Create an agent instruction file for each project — Also works with external tools, but requires initial setup and duplicate maintenance.
2. Have mew deliver common instructions and documentation entry paths with each request — Works automatically within the app, with optional integration for external tools.

## Decision

- Deliver brief mew guidance as a separate text block at the common execution point for all ACP requests. Do not include it in the conversation display or the user's original text. Do not impersonate the system role or guarantee that document reading will be enforced.
- Fix the project root and Documents association for each session and save it with the session ID. Use the same association for screen switches, restoration, queued execution, and scheduled execution. New conversations resolve the current project settings again.
- `.mew/agent-context.json` is the canonical source for each project's Documents path, whether to deliver context automatically, additional documentation entry points, and instructions. Documents selection prioritizes this value, while existing preferences and default paths remain for compatibility.
- Do not impose Liiiiv's company, brand, or ADR organization on other projects. Preserve existing agent instructions and documentation structures, and provide only navigation and write-back principles by default. Do not inject document bodies in bulk.
- The GUI and CLI use the same planning and application module. Initialization creates only missing files and does not overwrite existing documents. Creating an AGENTS.md integration file for external CLIs is an explicit choice.
- Direct terminal input is outside the ACP path and is therefore not subject to automatic injection. It follows the native behavior of tools that use external instruction files.

## Rationale

Reduce setup effort and context cost with brief common instructions. Bind paths to sessions to separate global screen state from execution lifetimes. Use one initialization module to prevent CLI and GUI behavior from diverging.
