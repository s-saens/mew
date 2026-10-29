---
name: japanese-technical-docs
description: "Connect Japanese technical documentation work to existing specialized skills. Design the structure with documentation and polish the Japanese text with yomiyasu. After finalizing the source, translate directly into the requested language and apply the specialized skills for translation, the target language, and final review in that order."
---

# Japanese Technical Documentation Skill Integration

This skill is an entry point for selecting the work stage and language. For polishing and translation, read the original text of the existing specialized skills included in the package.

1. Use the [shared workflow](../technical-docs-common/workflow.md) to determine the scope, audience, and source language. The default language for new documents follows mew's actual response language, with explicit requests and existing project and file rules taking precedence.
2. Use [documentation](../.vendor/documentation/SKILL.md) to design the source structure. Preserve existing formats for internal specifications and development contracts.
3. Polish the Japanese source with [yomiyasu](../.vendor/yomiyasu/SKILL.md). Select the tech or business references as appropriate for the document, and run the included checks when saving. Verify conditions, meaning, code, and links before finalizing the source.
4. When translation is requested, follow the [translation integration sequence](../technical-docs-common/translation.md). For translation into Japanese, apply `translating-japanese`, then refine the wording with `yomiyasu`, and finally use `reviewing-translations` to compare it against the finalized source.

If Japanese is only the translation target, start from the entry point for the actual source language. Do not substitute summaries for reading the specialized skills. Resolve shared files relative to the actual location of this SKILL.md.
