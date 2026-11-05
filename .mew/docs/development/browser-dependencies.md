---
title: "Browser runtime dependencies"
description: "Defines Mew-owned installation and readiness checks for ordinary Google Chrome and pinned Playwright Chromium. Covers source and prebuilt startup integration, overrides, host libraries, download boundaries, and platform limits."
created: "2026-11-05"
updated: "2026-11-05"
---

Mew prepares both browser roles defined in [ADR 0137](../decisions/0137-browser-purpose-routing.md): ordinary Google Chrome for external browsing and login, and Playwright Chromium for loopback apps and UI automation. `server/browser-dependencies.ts` owns installation and readiness checks. Missing browsers are an installation problem rather than a prerequisite users must discover by opening a panel.

## Commands and installation boundaries

Run these from a source checkout after installing npm dependencies:

```bash
npm run browsers:install
npm run browsers:check
```

`browsers:install` installs missing browsers and necessary Linux browser libraries, then checks readiness. `browsers:check` only inspects the selected executables and libraries; it does not download or install them. Errors identify the missing dependency and repair action. Invalid executable overrides fail rather than silently selecting another browser.

The command reads the same host `config.env` and application `.env` as the server, without creating server data or changing Windows directory permissions. Browser overrides and `PLAYWRIGHT_BROWSERS_PATH` therefore apply to both preparation and runtime. Pinned browser paths are queried in a subprocess using the resolved environment.

| Entry point | Dependency behavior |
| --- | --- |
| Source `./mew setup` and `./mew update` | Run installation after `npm ci`, before the application build and server launch |
| Source `./mew start` and `./mew restart` | Run a read-only readiness check; restart checks before stopping the existing server. On failure, direct the operator to `npm run browsers:install` |
| Prebuilt CLI launch | Run the runtime's installer child before forking the server host or starting its 60-second readiness timeout |

These are user-facing execution paths. Agents still follow the repository's [execution restrictions](getting-started.md#execution-and-verification); dependency verification does not authorize running the launcher, starting a server, or publishing a release.

## Executables and updates

The installer invokes the locally installed, version-pinned Playwright CLI. It never downloads a newer CLI through `npx ...@latest`.

- For the automation role, install the Chromium revision and headless shell selected by the runtime's `playwright-core` dependency. An existing system Chromium does not satisfy the default pinned-revision requirement. `MEW_CHROMIUM_EXECUTABLE` can select a compatible explicit executable instead.
- For external browsing and login, reuse installed ordinary Google Chrome. If absent on a supported platform, invoke the pinned CLI's `install chrome`. Preserve an existing Chrome installation. Google Chrome follows its OS/vendor update mechanism rather than Playwright's pinned Chromium revision.
- Validate and honor `MEW_CHROME_EXECUTABLE` and `MEW_CHROMIUM_EXECUTABLE`. The compatibility variable `MEW_BROWSER_EXECUTABLE` remains below each purpose-specific override. Operators must supply a browser compatible with the requested role; automatic preparation does not replace a configured executable.

Browser downloads live on the host in the vendor or Playwright browser installation locations. They are not committed to Git or embedded in the npm package or runtime archive. The runtime ships the installer and pinned Playwright tooling needed to prepare them.

## Host requirements and platform limits

On Linux/WSL, inspect executable shared-library dependencies with `ldd`. Run the pinned CLI's `install-deps chromium` only when required browser libraries are missing. Installing system packages and ordinary Chrome may require root or sudo, network access, and the host package manager. Run preparation interactively with an account allowed to install these dependencies before using an unattended service. A failed preparation blocks readiness and reports the repair command.

Automatic ordinary Chrome installation on Linux/WSL is limited to x64. Linux arm64 requires an explicit compatible executable through `MEW_CHROME_EXECUTABLE`; otherwise preparation fails with an actionable message. Windows Chrome does not satisfy a WSL installation. On macOS and native Windows, browser shared-library dependencies are handled by the OS; this implementation does not establish successful installation or launch on those platforms.

Login's Xvfb, FFmpeg, Python, libX11, and libXtst preparation remains separate. Browser readiness alone does not establish that the [native login screen](login-desktop.md) is ready, that a provider accepts a login, or that remote desktop permissions are granted.

Current consumers: [DOM browser](port-preview.md#internal-dom-browser), [UI tests](browser-testing.md), [login screen](login-desktop.md), and [prebuilt CLI](cli-distribution.md). Rationale follows [ADR 0139](../decisions/0139-browser-runtime-dependencies.md); actual checks and limits belong in the [work record](../work/browser-runtime-dependencies.md).
