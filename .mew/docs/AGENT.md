---
title: "Mew documentation entry point"
description: "Agent boot route and scoped commands for finding current Mew contracts by description. Links documentation ownership, English authoring, execution rules, and same-task write-back."
created: "2026-10-06"
updated: "2026-11-03"
---

Read the repository [README](../../README.md), [AGENTS](../../AGENTS.md), [execution rules](development/getting-started.md), and [documentation rules](README.md). Mew owns these policies. Write project documentation in English.

Choose paths and descriptions before opening bodies:

```bash
node server/document-descriptions.ts                        # Current project knowledge
node server/document-descriptions.ts .mew/docs/development # Shared contracts
node server/document-descriptions.ts .mew/docs/features    # Feature behavior
node server/document-descriptions.ts docs                  # Public guidance
```

Narrow the directory further when the topic is known. Read only relevant current documents and decisions. Load history or research when needed for provenance; do not recursively load them. MOC navigation and registration are optional.

Update the owning contracts and descriptions with code or behavior changes. Record decisions and actual verification in their existing owners. Run `npm run check:docs`; follow the execution rules for implementation checks.
