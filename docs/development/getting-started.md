---
title: "Development setup"
description: "Contributor prerequisites, development commands, validation, and links to contribution conditions and repository-specific agent execution rules."
updated: "2026-10-29"
---

# Development setup

Install the prerequisites in the [installation guide](../guides/getting-started-en.md), then run commands from the repository root:

```bash
npm ci
npm run dev     # Private development UI, port 4999
npx tsc -b      # Type checks without an application bundle
npm test
npm run lint
npm run check:docs
```

The server serves `dist/` directly. An application build changes the files served by a running instance. Apply builds and server changes according to your environment.

Read the [contribution requirements](contributing.md) before submitting changes. Implementation contracts and repository-specific agent execution rules live in the [project development rules](../../.mew/docs/development/getting-started.md). Project documentation starts at the [agent entrypoint](../../.mew/docs/AGENT.md).
