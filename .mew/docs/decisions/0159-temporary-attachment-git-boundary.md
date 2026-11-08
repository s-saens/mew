---
title: "0159 — Save temporary attachments without incidental Git commits"
description: "Accepts saving temporary editor and agent attachments independently of Git staging and hooks, while preserving existing project ignore rules, tracked files, and ordinary file-upload behavior."
status: accepted
created: "2026-11-09"
updated: "2026-11-09"
---

## Context

[Decision 0055](0055-project-temp-attachments.md) places new attachments under `.mew/temp/assets/`, where projects can exclude temporary files from Git. An existing project may not have that ignore rule. Incidental upload commits then stage the image and run project Git hooks after the image is already saved. A failing hook reports the upload as failed and can leave the image staged, even though the attachment is available on disk.

## Decision

Save uploads under `.mew/temp/assets/` without staging or creating an incidental Git commit. This applies to editor and agent attachments. Keep the project's Git configuration, ignore rules, index, already tracked files, and existing history intact. Ordinary uploads elsewhere retain their existing commit behavior. The [Git execution contract](../development/git-connections.md#git-execution-boundaries) owns those boundaries.

## Alternatives and rationale

- Keep committing and surface hook failures: preserves incidental history but makes temporary attachment use depend on unrelated repository checks.
- Add an ignore rule to every existing project: prevents these commits but modifies user-owned configuration and does not cover already tracked files.
- Skip incidental commits for temporary uploads: preserves user-owned configuration and lets attachment saving succeed independently of Git. Users can still manage these files through their own Git settings.

## Consequences and status

The decision is accepted. Temporary attachments can appear as untracked changes when the project does not ignore them. Document references to these files require the files to be retained and shared separately when the ignore policy excludes them. This decision refines the Git behavior around Decision 0055 without changing its storage locations or compatibility requirements.
