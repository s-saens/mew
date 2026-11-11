---
title: "Build and Deploy request authorization correction"
description: "Records the correction of composer Build/Deploy precedence over older saved bans/defaults, related repository instruction updates, regression checks, and the distinction between context application and host server-code reload."
created: "2026-11-11"
updated: "2026-11-11"
---

# Build and Deploy request authorization correction

The user reported that enabling Deploy still left the homepage unpublished, then explicitly requested fixing Build/Deploy instructions and performing deployment. [ADR 0168](../decisions/0168-request-build-deploy-authorization.md) records the priority reversal. The [guidance contract](../development/agent-guidance.md#per-message-execution-options) owns behavior.

The previous generated text deferred to older project bans, and Build off still retained mandatory project builds. The correction treats the captured choices as explicit current-request instructions and places them after saved project text. Build off removes the generated verification block from effective context. Saved guidance, custom sections, revisions, and delayed-message snapshots remain intact. Target/credential checks, tests, type/lint/docs checks, and separate server lifecycle limits remain in force.

Repository AGENTS, README, additional project instructions, execution rules, and affected current feature/usage/operations documents now follow the same contract. Historical decisions retain their original reasoning and link to the new superseding decision.

## Verification

Regression-first checks produced four expected failures for the previous priority, Build off wording, and generated fallback block. After implementation, the focused execution-options, agent-context, and agent-guidance suites passed 37 tests. Scoped lint and whitespace checks passed. The required `npm run build` passed, including TypeScript; existing bundle-size notices remain. `npm run check:docs` found 803 descriptions with no metadata errors and the same 39 pre-existing missing/invalid-link errors. No new documentation link failure was introduced.

## Application scope

The current request explicitly authorizes the homepage deployment. Context files are read at request construction, while changed server modules require the host's normal application/restart procedure. No launcher or host server lifecycle operation is authorized merely by the deployment toggle. Actual public-site deployment evidence belongs to the [homepage work record](mew-run-homepage.md).
