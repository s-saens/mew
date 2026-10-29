Mew is an independent project. This repository's instructions and documentation are authoritative; Liiiiv workspace instructions and documentation update procedures do not apply.

For an introduction and usage instructions, follow [README.md](README.md); for documentation navigation and writing, follow [.mew/docs/AGENT.md](.mew/docs/AGENT.md) and [Documentation rules](.mew/docs/README.md). Use `node server/document-descriptions.ts` to read document `description` values and select only the relevant body text. There is no requirement to navigate or register MOCs.

Write this repository's project-owned documentation in English, regardless of the response language. Follow the [documentation language policy](.mew/docs/README.md#documentation-language).

Before starting work, read and follow the [Execution and verification rules](.mew/docs/development/getting-started.md); before UI work, also read and follow the [Required UI implementation rules](.mew/docs/development/getting-started.md#required-ui-rules) in the same document. When changing code, features, or operations, update the owning document and description in Mew as part of the same work. Keep decision records in [.mew/docs/decisions/](.mew/docs/decisions/README.md).

Restrictions on agent builds, deployments, server startup, and restarts are project instructions for this Mew source repository. Do not distribute them as global Mew default instructions for other projects. Follow the [Execution and verification rules](.mew/docs/development/getting-started.md) for specific restrictions and permitted checks.

Place new Git worktrees in `.worktrees/<브랜치 슬러그>` in the primary checkout. Replace `/` in branch names with `-`, and do not create another `.worktrees` inside the current worktree. Before creating one, check that the primary checkout's `.gitignore` contains `/.worktrees/`. When moving an existing worktree, check running processes and sessions for path dependencies and preserve uncommitted changes with `git worktree move`.
