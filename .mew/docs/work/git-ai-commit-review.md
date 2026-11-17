---
title: "Review AI commit work units"
description: "Records the Git panel change from immediate AI commits to selectable work-unit review, local verification, and application limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The Git panel now analyzes selected files into work units before committing. Users can read each explanation, inspect its paths, see excluded files and reasons, and explicitly select units. Review persists across dialog closure. Execution revalidates the pinned snapshot and connection and preserves unrelated staging. The [feature contract](../features/git-history/project-git-work-panel.md#ai-commit-execution) owns behavior; [ADR 0182](../decisions/0182-review-ai-commit-groups.md) records the change from immediate execution.

Local verification: `node --test server/git-ai-commit.test.ts` passed 28 tests, including an isolated tmux execution and selected-group preservation. `node --test --test-force-exit server/git-ai-commit-ui.test.ts` passed desktop and mobile review flows. `node --test server/mew-skills.test.ts` passed, and `npm run build` passed with a large-chunk warning. Targeted Oxlint reported two existing React warnings and no errors. `npm run check:docs` validated 844 descriptions but reported the same 39 unrelated working-tree link errors observed before this change. These checks do not validate a paid agent's grouping quality.

The build updates the UI assets served by a source installation. The server-side workflow requires a separately authorized application server restart; no server lifecycle operation or deployment was performed.
