---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: projects own their icons. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0177 — Projects own their icons"
created: 2026-09-29
updated: 2026-09-29
---

- Date: 2026-09-29
- Status: Adopted
- Partially supersedes: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — per-account storage of project icons
- Decision maker: User instruction

## Background

The sidebar and standalone project tabs read different icon registries, displaying the same project differently. The user requested storing icon information in each subproject's `.mew` and sharing it between both views.

## Decision

- `.mew/project-icon.json` at the project root is the single canonical source for SVG, emoji, and line icon selections. The sidebar and project tabs read the same file. Nested projects also have their own files.
- Save icon changes to the project file. Retain per-account storage of the open tab list, order, and groups, but do not save new copies of icons.
- Migrate existing sidebar registry values to project files. Use existing account tab icons as a fallback source only when the file is absent; always prioritize the project file when it exists. Record explicit resets as null so old icons do not reappear.
- Preserve existing SVG validation and the owner's absolute-path access permissions. Renaming also moves the icon file inside the folder.
- Do not reintroduce separate sidebar and tab icon registries. Write a follow-up decision to change this.

## Rationale

Keeping the canonical source in the project itself displays the same icon regardless of how the tab is opened, the account, or the parent project, and the icon follows the folder when it moves.
