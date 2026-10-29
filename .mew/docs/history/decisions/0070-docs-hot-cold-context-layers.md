---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate current routing documents from history source texts. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0070 — Separate current routing documents from history source texts"
created: 2026-08-21
updated: 2026-08-21
---

- Date: 2026-08-21
- Status: Adopted
- Decision maker: User (draft: Codex)

## Background

The docs contain approximately 410,000 tokens, of which ADRs, support program source materials, and completed work records account for approximately 310,000 tokens. The total volume itself is only a preservation cost, but the root MOC and routine entry documents contained detailed lists and explanations that led to unrelated documents being selected for each task. Some current documents also retained facts from overturned ADRs.

Compressing all document bodies would lose reasons for failure, rationale, and citations, while creating separate summaries would produce two canonical sources. What is needed is to exclude history from default search and reading paths, rather than reduce storage volume.

## Options

1. Compress all document bodies — reduces context, but causes loss of evidence and substantial review costs.
2. Maintain separate current summaries — fast, but creates a second SSoT that diverges from the originals.
3. MOC routing + current/history separation — preserves the originals and reduces only the default path.
4. Introduce RAG alone — improves discoverability, but does not resolve incorrect current facts or duplicate source texts.

## Decision

Adopt option 3 and add option 4 only as a supplementary search layer on top of it.

- Routine entry documents contain only rules and routing. Move detailed lists, completion history, and explanations to child MOCs or document bodies.
- The root MOC points only to child MOCs for company, platform, product, program, and operations. Do not list product specs directly at the root.
- MOCs place `current` first and `history/raw` afterward. Agents read only current by default and open history only when decision rationale or retrospectives are needed.
- Maintain a single current canonical source. Do not delete earlier drafts or submitted versions, but classify them as history/raw so they are not automatically selected as evidence for current facts.
- If a completion list occupies more than half of a current document, move it into a separate history document. Leave only a link and the current status in the current document.
- Do not mechanically shorten old sentences. Distill content only when link routing is insufficient and duplicate current canonical sources are confirmed.
- The RAG index is a derived cache. Markdown in Git is the only SSoT, and the entire index must be regenerable if lost.

## Rationale

- ADRs and source materials can be preserved while excluded from default context.
- MOCs do not duplicate body summaries, so they do not add update points.
- The current/history metadata can be reused directly for future search filters, freshness checks, and the default RAG scope.
- Correct current facts before adding RAG to avoid the counterproductive effect of retrieving outdated conflicts faster.

## Results

- Register new or moved documents in the nearest child MOC, rather than the root.
- Default RAG searches prioritize current/reference and include history/raw only when explicitly requested.
