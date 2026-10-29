---
title: "mew documentation navigation entry point"
description: "The agent entry point for Mew's own instructions, English documentation policy, description-based discovery of current documents, and local decisions."
created: "2026-10-06"
updated: "2026-10-27"
---

Read the project [README](../../README.md), [AGENTS](../../AGENTS.md), [documentation rules](README.md), and [execution and verification rules](development/getting-started.md). Mew's own instructions govern; navigating or updating parent workspace documents is not required.

From the repository root, run `node server/document-descriptions.ts` to list the paths and descriptions in the configured `.mew/docs`, then read only the relevant document bodies. Check current decisions in `decisions/` and historical evidence in `history/` only when needed. There is no obligation to navigate or register in a MOC. When changing code, features, or operations, update the owning document and its description in the same task and check them with `npm run check:docs`.

Use English for this repository's project-owned documentation; follow the [documentation language policy](README.md#documentation-language).
