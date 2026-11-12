---
title: "Parallel browser startup authentication"
description: "Records the local browser authentication and bootstrap parallelization, regression checks, existing verification failures, and unmeasured runtime performance."
created: "2026-11-12"
updated: "2026-11-12"
---

The ordinary workspace entry previously waited for the bootstrap module and its React effect before requesting authentication. It now starts the authentication request alongside the bootstrap import and passes the result into the existing identity and permission setup. The [startup contract](../development/browser-startup.md) describes the route and failure boundaries.

The browser regression held the bootstrap download and confirmed that authentication started before its release. It also exercised the existing guest fallback, remote authentication, and workspace loading gates. `npm run build` passed, including TypeScript; `npm run lint` passed with warnings. The complete startup test file also reported a workspace chunk-graph assertion for `recovery-policy.ts`; the same assertion failed with the original entry file in the current working tree. `npm run check:docs` found 39 existing local link errors, while the description check passed.

These checks do not measure the reported device or network. The build updates `dist/`, which a running server can serve; no server lifecycle operation or deployment was performed. Actual connection time and the contribution of authentication, asset transfer, and workspace initialization remain unmeasured.
