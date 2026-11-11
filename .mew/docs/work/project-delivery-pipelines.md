---
title: "Project delivery pipelines implementation"
description: "Records the design and implementation of the outcome-oriented delivery screen, sequential persistent pipelines, and external provider adapters. Tracks local verification separately from live provider deployment and later CI/CD capabilities."
created: "2026-11-11"
updated: "2026-11-11"
---

## Purpose and resulting behavior

Users unfamiliar with build commands need a clear path to inspect or publish their work. The [delivery design](../development/project-delivery.md) and [ADR 0165](../decisions/0165-project-delivery-pipelines.md) were written before implementation. The [feature contract](../features/terminals-agents-automation/project-delivery-pipelines.md) owns the resulting behavior and API.

The implementation adds an outcome-oriented project entry, result/publishing controls, an explicit destination review, editable ordered action/provider steps, durable scoped history, interrupted-run recovery, and encrypted provider connections. Initial remote adapters cover GitHub Actions, Git-connected Cloudflare Pages, and Google Cloud Build triggers. Their tests use synthetic responses and do not dispatch real deployments. The bundled project-setting instructions now describe these pipelines and the distinction between a local result and the remote repository version being published.

## Verification

Tests were written before the corresponding implementations for pipeline execution, provider dispatch, client scope/recovery, and the delivery screen. The focused combined integration run passed 112 tests across pipeline/action services and routes, provider services and routes, account credential lifecycle, the bundled setup skill, existing command buttons, authentication, workspace clients, and action/delivery state and result selection. A later project-deletion/replacement regression was added; the final pipeline/service-route run passed all 17 tests, including that new case. These runs cover 113 distinct non-browser tests.

The three delivery/action browser tests passed with fixture projects and mocked remote executions. Checks cover 1100 px and 320 px layouts in light and dark themes, result access, actual stage transitions, destination/revision review, cancellation without dispatch, advanced step reordering, connection drafts, unavailable Browser handling, and confirmed remote results after interruption. The final light/dark screenshots were inspected locally. No live provider deployment or physical app installation was performed.

`npm run build` passed, including TypeScript project builds, with Vite's large-chunk warning. `npm run lint` passed with existing warnings and no warnings in the delivery files; the last added regression also passed targeted oxlint. `git diff --check` passed.

`npm run check:docs` validated 798 descriptions without errors but failed on 39 existing missing links elsewhere in the working tree. A targeted link check found no errors in the seven changed documentation/skill files. These checks are local verification, not application to the running backend or deployment.

## Operational boundaries

No deployment, launcher execution, or application server lifecycle operation is authorized for this work. Applying backend changes to a running instance remains user-owned. Provider OAuth onboarding/resource discovery, automatic Git/webhook triggers, isolated runners, parallel execution, static app previews, background push, and remote artifact import remain outside this first implementation. Existing tokens/resources are required for the initial provider settings; Google access tokens can expire. Provider credentials and production deployments are not verified by mocked adapter tests. Local crash recovery blocks recorded surviving process groups, but a crash between OS spawn and PID persistence remains an uncertain window; there is no startup process killing or automatic replay.
