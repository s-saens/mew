---
name: chinese-technical-docs
description: "Connect Simplified Chinese technical documentation work to installed specialized skills: use documentation to design the structure and tech-doc-style-chinese to polish the source text; after confirming the source, translate directly into the requested language, applying translation, target-language polishing, and reviewing-translations in that order."
---

# Simplified Chinese Technical Documentation Skill Integration

This skill selects the stage and language. For both polishing and translation, read and apply the existing specialized skills installed with the package rather than replacing their rules with this entry point.

1. Use the [shared workflow](../technical-docs-common/workflow.md) to determine the scope, audience, and source language. New documents default to mew's actual response language; explicit document language requirements and existing project and file rules take precedence.
2. Read [documentation](../.vendor/documentation/SKILL.md) when designing the source structure. Preserve existing formats for internal specifications and development contracts.
3. Use [tech-doc-style-chinese](../.vendor/tech-doc-style-chinese/SKILL.md) to polish the Simplified Chinese source. Read references on controlled technical writing, terminology formatting, and other topics as appropriate for the document's purpose, and preserve the established structure. Verify conditions, technical meaning, code, and links before confirming the source.
4. When the user requests translation, follow the [translation integration sequence](../technical-docs-common/translation.md). For Simplified Chinese translations, first apply `translating-chinese`, then polish with `tech-doc-style-chinese`, and finally use `reviewing-translations` to compare the translation against the finalized source.

If Simplified Chinese is only the target language, start from the entry point for the actual source language. Do not substitute summaries for the specialized skills' SKILL.md files. Resolve shared file paths relative to the actual location of this SKILL.md.
