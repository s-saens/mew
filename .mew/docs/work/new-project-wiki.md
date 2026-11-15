---
title: "New project wiki location"
description: "Records the initial .mew/wiki default for newly managed projects, compatibility tests, verification failures, and the outstanding repository migration."
created: "2026-11-15"
updated: "2026-11-15"
---

## Scope and verification

New managed projects create `.mew/wiki/`, and discovery recognizes it after explicit and applicable fallback settings and existing `docs/` or `.mew/docs/` directories. [ADR 0175](../decisions/0175-new-project-wiki.md) records the choice.

On 2026-11-15, targeted creation and discovery tests passed, as did targeted oxlint and `npm run build`. The broader `server/project-registry.test.ts` and `server/project-setup.test.ts` run passed 22 of 23 tests; the CLI create preview failed with `프로젝트 폴더를 찾을 수 없습니다`. `npm run check:docs` found 815 valid descriptions and 39 existing missing or invalid links. The server was not restarted; this verifies source behavior locally and does not establish server application.

The Mew repository's own `.mew/docs/` migration, references, and configuration remain outstanding. Existing unrelated modifications within that tree and active editor state must be preserved during migration.
