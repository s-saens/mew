---
title: "Consolidate attachments and drawings under the project's temporary path"
description: "The decision stores new attachment and drawing board files under .mew/temp while preserving read compatibility with existing paths. Defines the boundaries for Git exclusion and preservation of existing files."
created: "2026-10-23"
updated: "2026-10-23"
---

# Consolidate attachments and drawings under the project's temporary path

Status: Approved.

## Background

Agent attachments and drawing records are committed alongside source changes. Collect generated files under `.mew/temp`, which the project already excludes.

## Decision

Store new attachments in `.mew/temp/assets/` and drawing board SVG and JSON files in `.mew/temp/drawings/`. Supersede only the storage locations in [0008](0008-agent-vector-drawing.md). Continue reading existing `.mew/assets/` attachments and `.mew/drawings/` records without moving or deleting them, and preserve file permissions and safe path checks.

## Rationale and Impact

Collecting generated files under one path allows them to be excluded together by the `.mew/temp` rule in `.gitignore`. Do not change files already tracked by Git or past commits. Do not add automatic deletion or expiration.

[Input and attachments](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) and the [drawing board](../features/terminals-agents-automation/agent-drawing-editor.md) own the current storage and retrieval contracts.
