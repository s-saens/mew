---
title: "Separate commit message language from response language"
description: "Decision to add English as the default commit language, four supported languages, and options to follow the Mew UI or agent response language to per-account Git guidance, passing the same selection to ordinary conversations and AI automatic commits."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Accepted. Adds a commit language setting while retaining the storage, permissions, and precedence of existing account-wide guidance.

## Background

Writing messages based only on the response language or the language of recent commits makes it difficult to express a preference for English commits while conversing in Korean. The ordinary agent and Git panel AI automatic commits must use the same setting.

## Decision

Add **Commit language** to the Git group in agent default guidance. Default to English and offer Korean, English, Japanese, Simplified Chinese, and options to follow the Mew UI language or agent response language. Apply it to the title and body while retaining repository prefixes and formats, explicit user requests, and project guidance.

Use an independent settings section in the account-specific `agent-guidance.md` as the canonical source. If the section is absent from an existing file, supplement it with English-default guidance only when reading, preserving the source, revision, direct edits, and damaged sections. Do not change the response language.

For ordinary requests, resolve the UI and response languages when passing the request. For AI automatic commits, resolve the UI language and account settings from the starting request and fix them in the task input. Saved settings apply to subsequent message composition and do not rewrite past commits.

## Rationale and Impact

Users can choose conversation and commit languages independently, and the selection is retained during automated Git processing. Do not bulk-modify existing user files or create separate settings storage. The [session contract](../development/agent-sessions.md#passing-project-context) owns specific options, fallback, and APIs; the [project settings guide](../../../docs/guides/project-setup.md#edit-the-shared-guidance-file) owns usage; and the [owning feature document](../features/projects-files-search/project-documentation-guidance-and-initialization.md) owns UI and verification.
