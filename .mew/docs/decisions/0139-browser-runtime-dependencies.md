---
title: "0139 — Own browser runtime dependency preparation"
description: "Makes ordinary Chrome and pinned Playwright Chromium managed Mew runtime dependencies. Extends ADR 0137 with installation, read-only source startup checks, prebuilt preflight, host-library repair, and platform limits."
created: "2026-11-05"
updated: "2026-11-05"
status: "accepted"
---

## Context

[ADR 0137](0137-browser-purpose-routing.md) separates ordinary Chrome for external pages and login from Chromium for localhost apps and UI automation. Executable discovery alone leaves a new installation without a reliable way to prepare either browser. Users should not need to infer these runtime dependencies from a failed browser panel.

Source and prebuilt installations need the same version-aware preparation while preserving existing Chrome and explicit executable choices. Browser downloads can take longer than the CLI's application readiness timeout.

## Decision

Mew owns browser preparation through one installer and a read-only readiness mode. Source setup/update invoke installation after npm dependencies and before build/start. Ordinary source start/restart checks readiness without mutating the host and provides a repair command; restart checks before stopping the current server. The prebuilt runtime must declare `browserDependencies: "server/browser-dependencies.js"` and include that required file; obsolete or incomplete runtimes are rejected. The CLI runs it before forking the application host and starting the host readiness timer.

Use the pinned local Playwright CLI to install its matching Chromium and, when missing, ordinary branded Chrome. Preserve existing ordinary Chrome and explicit compatible overrides. Default automation readiness requires the pinned Chromium revision even when a system Chromium exists. Install Linux browser libraries only when dependency inspection finds missing libraries. Browser binaries remain host downloads outside Git, npm packages, and runtime archives.

Keep browser selection and native-login display dependencies separate. Linux/WSL Chrome automatic installation supports x64; arm64 requires an explicit compatible external-browser executable. macOS and native Windows installation and launch remain platform verification gates.

## Alternatives and rationale

Manual installation leaves a core feature inconsistently prepared. Downloading browsers only when a panel opens shifts package installation and privilege prompts into interactive browsing. Bundling browser binaries in every runtime archive increases release size and couples ordinary Chrome updates to Mew releases. Allowing any system Chromium to satisfy default readiness loses the revision contract between Playwright and its browser.

A shared installer gives source and prebuilt flows the same preparation rules. Running the prebuilt installer before the application host prevents browser download time from consuming the server readiness budget. Source start remains predictable and read-only, with setup/update and the explicit repair command owning changes to the host.

## Consequences

Initial installation may require network access and system package privileges. Unsupported Linux Chrome architectures and invalid overrides fail clearly. Existing Chrome receives vendor/OS updates; Chromium follows the pinned Playwright dependency. Login video still needs its separate X server and capture dependencies. These changes do not establish provider authentication, production application, or successful installation on every supported host.

This extends ADR 0137's dependency ownership without changing its browser-purpose routing. The [browser dependency contract](../development/browser-dependencies.md) owns current commands and platform behavior; the [work record](../work/browser-runtime-dependencies.md) owns actual verification.
