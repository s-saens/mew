---
name: korean-technical-docs
description: "Connect technical documentation work that uses Korean as the source or target language. Design the structure with the installed documentation skill and edit sentences with korean-writing-reviewer. For requested translations, apply translating-core, document protection, target-language specialized skills, and reviewing-translations in order."
---

# Korean Technical Documentation Integration

This skill is an entry point for selecting the stage and language. Perform sentence editing and translation by reading the original text of the included existing specialized skills.

1. Use the [shared workflow](../technical-docs-common/workflow.md) to determine the source language, requested scope, and audience. The default source language for new documents follows mew's actual response language. Explicit document language requirements and existing project and file rules take precedence.
2. Read [documentation](../.vendor/documentation/SKILL.md) when designing the source structure. Preserve the project's format for internal specifications and development contracts.
3. Edit the Korean source using the technical documentation profile in [korean-writing-reviewer](../.vendor/korean-writing-reviewer/SKILL.md). Use `improve` without scores for revision requests and `review` for review requests. Finalize the source after cross-checking the source text, conditions, code, and links.
4. Follow the [translation integration sequence](../technical-docs-common/translation.md) for requested translations. If Korean is the target language, apply `translating-korean`, refine the wording with `korean-writing-reviewer`, and finally compare it against the finalized source with `reviewing-translations`.

If Korean is not the source language, start with the entry point for that source language. Do not substitute summarized rules for reading the specialized skills. Locate shared references relative to the actual location of SKILL.md.
