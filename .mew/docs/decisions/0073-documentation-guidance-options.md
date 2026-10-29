---
title: "Configure Documentation and Recordkeeping Instructions per Account"
description: "Decision to separate default instructions from delegation to project instructions for document updates, ADRs, work records, writing, descriptions, links, and checks, and to migrate existing fixed wording without destructive changes."
created: "2026-10-26"
updated: "2026-10-26"
---

Status: Adopted

## Background

Mew's shared instructions required owning document updates, descriptions, and link corrections through fixed wording. ADR creation criteria and implementation and verification records depended on project rules. The user requested shared defaults for documentation and recordkeeping that could be changed individually.

## Decision

Provide 7 independent settings for canonical document updates, decision records (ADRs), work and verification records, writing style, descriptions, links, and document checks. The default is **Apply Default Instructions**, and the other value is **Follow Project Instructions**. Apply them to all projects in the account starting with the next request; existing project requirements and explicit user requests take precedence.

ADRs record significant architectural and technical choices, shared contract changes, and reversals of existing decisions. Do not create a new ADR for every simple change. Work records capture implementation purpose, results, actual checks, and remaining constraints, and distinguish whether changes have been applied to production. Follow the existing project's document formats, locations, and ownership.

Do not overwrite existing stored source text. On request, replace only standalone wording that exactly matches the old defaults with configurable guidance so it does not conflict with delegation to project instructions. Preserve user edits, settings sections, and code examples. Do not automatically repair damaged sections or insert duplicate defaults.

## Alternatives and Rationale

A single setting that turns all documentation on or off cannot independently control ADRs, records, and metadata. Changing only the new template would not apply defaults to existing accounts, while bulk editing existing files could damage manually edited instructions. Use per-item settings together with supplementation on read.

## Impact

Change values in the collapsed **Documents** group in settings; do not automatically create checking tools or documentation folders. These settings are agent instructions, not an enforcement gate that guarantees recordkeeping or check execution. Do not automatically delete project-specific documentation rules.

[Usage](../../../docs/guides/project-setup.md#documentation-guidance) owns the specific scope, the [Session Contract](../development/agent-sessions.md) owns storage, migration, and APIs, and the [Work Record](../work/agent-documentation-guidance.md) owns verification results and application status.
