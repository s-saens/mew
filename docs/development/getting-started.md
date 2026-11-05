---
title: "Development setup"
description: "Contributor prerequisites, managed browser preparation, development commands, validation, and links to contribution conditions and repository-specific agent execution rules."
updated: "2026-11-05"
---

# Development setup

Install the prerequisites in the [installation guide](../guides/getting-started-en.md), then run commands from the repository root:

```bash
npm ci
npm run browsers:install
npm run dev     # Private development UI, port 4999
npx tsc -b      # Type checks without an application bundle
npm test
npm run lint
npm run check:docs
```

Browser preparation installs missing ordinary Chrome and the pinned Playwright Chromium, including required Linux browser libraries. System package installation may request sudo. Use `npm run browsers:check` for a read-only readiness check. See the [browser dependency contract](../../.mew/docs/development/browser-dependencies.md) for overrides and platform limits.

The server serves `dist/` directly. An application build changes the files served by a running instance. Apply builds and server changes according to your environment.

Read the [contribution requirements](contributing.md) before submitting changes. Implementation contracts and repository-specific agent execution rules live in the [project development rules](../../.mew/docs/development/getting-started.md). Project documentation starts at the [agent entrypoint](../../.mew/docs/AGENT.md).
