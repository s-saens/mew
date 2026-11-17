---
title: "November 2026 startup performance investigation"
description: "Records the November 16–17 loading investigation, single-use workspace handoff, entry download reduction, nonblocking host discovery, and repeatable installed-artifact measurements. Separates isolated checks and build application from live server-source reload and real-device verification."
created: "2026-11-16"
updated: "2026-11-16"
---

## Objective and boundaries

Investigate reported severe loading delays, improve measured bottlenecks, and continue verification through November 17 at 03:00 Asia/Seoul (November 16 at 18:00 UTC). Preserve existing uncommitted project work. Follow the [execution rules](../development/getting-started.md): builds update served UI assets, while application server starts, stops, and restarts require separate authorization.

The [browser startup contract](../development/browser-startup.md) owns loading boundaries. [Scoped workspace sessions](../development/workspace-sessions.md) owns actual/logical root isolation. [Architecture](../development/architecture.md) owns project discovery.

## Observed bottlenecks

Read-only, unauthenticated loopback requests to the already running instance showed HTML responses of 820–1,093ms and authentication responses of 209–544ms in five samples each. Parallel requests to HTML, authentication, and a small static module also stalled together. One process wait-channel observation was `p9_client_rpc`, consistent with synchronous filesystem work on WSL-mounted Windows paths. These observations establish shared host stalls; they do not attribute every delay to a single function.

The installed initial JavaScript dependency closure was 634,292 bytes raw and 199,944 bytes with independent gzip compression. Keyed application translations were included before authentication began. `WorkspaceApplication` then fetched workspace information before mounting an editor that fetched it again. This added a sequential request even when the first response already confirmed the same account-selected workspace.

Project registry HTTP reads performed synchronous nested discovery. GPU executable discovery also synchronously probed Windows PATH entries before launching an asynchronous query. Agent runtime discovery has the same synchronous PATH-probing pattern. Direct static asset responses accepted Brotli/gzip but returned the full identity body without a content-encoding header.

## Implemented behavior

- Download `I18nProvider` alongside authentication/bootstrap; wait for it before rendering localized application content. Shared synchronous `uiText` translations keep their existing API.
- Isolate UUID and recovery primitives so native authentication cannot acquire the workspace through a tiny shared dependency. Preserve optional-tool and editor boundaries.
- Request the optional workspace UI envelope in the shell's first workspace read. Pass that accepted response only to the matching editor or compatibility fallback, once. Recovery and subsequent workspace changes read fresh state. Permission invalidation discards unused initial metadata; file bodies, account tabs, and collaboration retain their own validation.
- Run HTTP project discovery asynchronously, coalesce concurrent scans, and merge newly discovered roots into the latest ledger so another request's changes survive.
- Probe Windows GPU executables asynchronously and reuse a successful executable between samples. A failed command discards that discovery for a later retry.

- Prepare Brotli/gzip sidecars during production builds. Serve negotiated direct static assets with existing immutable caching, representation-specific validation, and identity byte ranges. Retain compatibility with older builds without sidecars.

## Verification log

The first combined `npm run build` passed and refreshed `dist/`. `npm run lint` completed with zero errors and existing warnings. Focused initial-workspace, snapshot-validation, and workspace-application tests passed 23 checks, including desktop/mobile usable shells with editor code held, one initial workspace request, fresh recovery reads, mode round trips, worktree identity, and project replacement. Existing browser fixtures needed their current Wiki label, browser-context exports, and an explicit wait for the completed navigation's React commit.

Initial `npm run check:docs` found 829 valid descriptions and 39 existing link errors, including removed MOC/decision-entry paths, moved tasks, and a task attachment using an API URL. These errors preceded this task. Keep them distinct from new document errors; do not restore deleted user materials as part of performance work.

## Repeatable measurements

Run `node server/startup-performance-benchmark.mjs` against an already built artifact. `MEW_BENCH_DIST` selects another artifact, `MEW_BENCH_ROUNDS` controls samples, and `MEW_BENCH_OUTPUT` writes the JSON evidence outside the repository. API delay, asset delay, download rate, and CPU slowdown are explicit model settings. The script uses test-owned Chromium and a temporary loopback fixture with example account/project data; it never starts Mew, edits real files, or reuses real account credentials.

Measure real installed JavaScript and CSS with synthetic API responses, inert noncollaboration sockets, and a Plain document. Record menu, tree DOM, and editable editor at the next animation-frame opportunity, along with transferred bytes and the request waterfall. Cold samples use fresh browser contexts; warm samples reload the same context with HTTP caching. These measurements exclude real P2P signaling, Internet routing, physical-device CPU, and collaboration readiness. They are neither pixel-paint nor production latency guarantees.

The preserved baseline's corrected five-round medians, using an 80ms API delay, were:

| Viewport | Cache | Menu (ms) | Tree DOM (ms) | Editable Plain next frame (ms) |
| --- | --- | ---: | ---: | ---: |
| Desktop, 1100px | Cold | 296 | 563 | 683 |
| Desktop, 1100px | Warm | 217 | 413 | 504 |
| Mobile, 390px | Cold | 292 | 546 | 635 |
| Mobile, 390px | Warm | 213 | 398 | 492 |

The first controlled comparison alternated baseline/current artifact order over five rounds. The 80ms API model produced these editor medians:

| Viewport | Cache | Baseline (ms) | First improved artifact (ms) |
| --- | --- | ---: | ---: |
| Desktop, 1100px | Cold | 662 | 572 |
| Desktop, 1100px | Warm | 498 | 416 |
| Mobile viewport, 390px | Cold | 622 | 537 |
| Mobile viewport, 390px | Warm | 494 | 410 |

With 180ms API delay, 20Mbps download, and four-times CPU slowdown, the medians were 2,016→1,840ms desktop cold, 1,343→1,213ms desktop warm, 1,824→1,677ms mobile viewport cold, and 1,244→1,083ms mobile viewport warm. Menu times remained essentially unchanged. The warm waterfall moved account-tab requests from 305 to 224ms and the file read from 404 to 324ms by removing the second workspace request. Total gzip JavaScript transfer remained approximately 1 MB, including background restoration; this slice primarily removed a sequential API wait.

The benchmark reuses one test-owned Chromium process while making fresh contexts for cold samples. It does not claim fresh-process cold behavior. Reports are `/tmp/mew-startup-first-comparison.json` and `/tmp/mew-startup-first-constrained-comparison.json`; their artifact digests distinguish this slice from later builds. Further comparisons and remaining payload analysis are in progress.

## Host responsiveness checks

HTTP runtime presence now uses asynchronous executable checks, shares only concurrent matching scans, and rereads presence after completion. Installation commands for Claude, Codex, tmux, and Prime avoid launch-only host lookup. Saved command rules and the existing synchronous install/remove flow are preserved. The [agent session contract](../development/agent-sessions.md#runtime-installation-presence) owns this behavior; the [system resource contract](../features/appearance-accounts-operations/system-resources-and-processes.md#gpu-queries-under-wsl) owns asynchronous GPU discovery and reuse.

Synthetic directory discovery with 2,000 directories and no project markers took 93.7ms synchronously, with a 93.0ms maximum timer gap. The bounded asynchronous scan took 340.0ms, allowing 335 timer callbacks with a 3.51ms maximum gap. This improves availability to other requests while trading greater total catalog-scan time. The held-read tests also verify that concurrent callers share discovery and that shortcut changes and permanent deletion survive the final ledger merge.

A direct WSL filesystem check using the new GPU discovery and a simulated GPU command took 7.86ms for first discovery and 0.045ms when reusing the executable; a 1ms timer continued with a maximum 1.65ms gap. No real GPU command or application-server operation was started for this check. Three runtime-status comparisons against the original source, isolated from account state, took 1.21–2.39ms for the original synchronous lookup and 4.64–6.21ms for asynchronous lookup. The asynchronous calls allowed five or six timer callbacks each, with maximum gaps of 1.03–1.23ms. These isolated executable lookups did not reproduce the previously observed 500ms–1s host stalls; they establish removal of blocking work, not definitive attribution of the live delay.

The server-side focused suite passed 69 checks across runtime installation/presence, GPU samples and caches, system resources, registry/access/deletion, workspace snapshot parsing, and explicit workspace scopes. `npx tsc -p tsconfig.node.json --noEmit` and targeted Oxlint checks passed. Initial authoritative editor-tab envelopes are optional, account-scoped, revision-validated, and share the 64 KiB UTF-8 budget with workspace UI; API checks retain logical project keys across worktrees, legacy migration freezing, known-empty state, account separation, guest rejection, and omission on oversized input. The client adoption path and complete build remain separate verification steps.

## Remaining verification and application

Continue installed-artifact comparisons, constrained network/CPU models, targeted regressions, and final build/docs checks through the requested deadline. No application server lifecycle operation or deployment has been performed. UI changes reach the running source installation through the build; server-side fixes remain pending a separately authorized restart. Real external access and physical-device measurements remain separate gates.
