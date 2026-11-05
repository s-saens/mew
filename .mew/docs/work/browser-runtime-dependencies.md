---
title: "Browser runtime dependency preparation"
description: "Records Mew-owned Chrome and pinned Chromium preparation across source and prebuilt launch, shared configuration loading, 76 passing focused tests, successful build/lint and WSL checks, and existing documentation-link failures. Distinguishes fixture verification from clean-host, native-login, and deployment gates."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

Make Chrome and Chromium explicit Mew runtime dependencies so a clean installation prepares external browsing, localhost browsing, and UI automation. Current commands and platform boundaries follow the [browser dependency contract](../development/browser-dependencies.md); [ADR 0139](../decisions/0139-browser-runtime-dependencies.md) records the decision.

Source setup/update prepare missing dependencies after npm installation. Source start/restart checks them without installing; restart performs the check before stopping the current server. The prebuilt CLI runs the runtime's installer before the host process and its readiness timer. Preparation reuses ordinary Chrome and explicit overrides, installs the Playwright-pinned Chromium when needed, and checks Linux browser libraries before requesting package installation.

## Verification and limits

The focused Node suite passed 56 tests across the dependency manager, executable discovery, source setup/start/restart/update, release packaging, and remote desktop setup compatibility. It covers missing and pinned binaries, headless shell repair, override validation, native-library repair, settings-file loading, and immediate child cancellation/handler cleanup. The release graph fixture also executes the compiled read-only checker with fixture executables without starting the host or a browser.

`npm run test:cli` passed 20 tests, including browser preparation before host startup, failure/cancellation gating, lock release, and required installer manifest/file validation. `npm run build` passed TypeScript and Vite verification with the existing bundle-size warning. `npm run lint` exited successfully with existing repository warnings.

On the current WSL host, `npm run browsers:check`, `npm run browsers:install`, and another check all passed. Both browser roles and their native libraries were already installed; preparation reused them without downloading or replacing Chrome. This verifies readiness and repeat preparation, not installation on a fresh host.

`npm run check:docs` validated 710 descriptions with no metadata errors, then failed on 42 existing missing links. Missing targets include `decisions/README.md` and removed MOC paths. The changed installation and deployment guides retain their existing missing MOC references; added links resolve. No unrelated documentation structure was changed. `git diff --check` passed.

No deployment, release publication, launcher execution, or server lifecycle operation was performed. macOS and native Windows dependency installation and browser launch remain unverified. Linux arm64 requires a compatible external-browser executable. Native login display/capture prerequisites and real provider authentication remain separate. Cancellation forwards signals to the immediate installer subprocess and waits for it; fixture checks do not establish cleanup of every privileged package-manager descendant.
