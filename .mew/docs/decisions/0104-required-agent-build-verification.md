---
title: "Require agent build verification without server restarts"
description: "Replaces Mew's source-repository agent build prohibition with mandatory builds after implementation changes, while retaining deployment and server lifecycle restrictions and keeping the policy out of global Mew guidance."
created: "2026-10-31"
updated: "2026-10-31"
---

## Status

Accepted at the user's explicit request. Supersedes the previous build prohibition in the repository execution rules; historical verification records remain unchanged.

## Context

Agents previously checked types, tests, and lint but could not run the production build. A reported build error could therefore remain unverified even when those checks passed. The user requested that agents be required to build, while keeping server restarts prohibited.

## Decision

After code, feature, dependency, or build configuration changes, agents must run `npm run build`, fix failures, and rerun it before reporting completion. A genuine blocker must be reported as incomplete work. Applicable tests, lint, and documentation checks remain required. Documentation-only work does not require an app build.

Agents must not deploy, run the `mew` launcher, or start, stop, or restart servers. These operations remain with the user. The required build updates `dist/`, which the running instance serves directly; it does not reload server-side code. These are Mew source-repository instructions and must not become global defaults for other projects.

## Alternatives and consequences

Allowing optional builds would retain the verification gap, so the rule requires a build. Delegating all builds to the user was rejected by the explicit request. Starting or restarting the server is unnecessary for build verification and remains outside authorization.

Build results must be distinguished from deployment and runtime verification. The [execution rules](../development/getting-started.md) own the current commands and scope; [the work record](../work/agent-build-verification.md) records the actual check.
