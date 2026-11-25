---
title: "Agent runtime settings improvements"
description: "Records the runtime settings redesign, launch overrides, management actions, runtime status synchronization, and the inline runtime picker notices and terminal actions, with verification."
created: "2026-11-17"
updated: "2026-11-25"
---

# Agent runtime settings improvements

The runtime settings dialog now groups installation and account actions separately from advanced execution settings. Claude and Codex describe the connector status and the distinct CLI and login requirements. Saved command and argument overrides can be cleared, and individual environment variables can be removed without replacing other masked values. New values are concealed during entry. See the [runtime settings contract](../../../docs/configuration/agent-runtimes.md).

Local verification covered settings merge, clearing and removal, asynchronous runtime status checks, and a 390px browser interaction with mocked runtime APIs. The project build and lint were run. The documentation checker found existing missing links across the repository, including the pre-existing MOC reference in the runtime guide. The settings screen does not check the host Codex CLI or install it; connector presence alone remains the selection criterion. Real provider installation and login were not exercised, and the server was not restarted or deployed.

## Removal and reset follow-up

The management section exposes execution-settings reset and runtime removal with separate confirmation and explicit scope. Automatic removal remains disabled where no fixed safe uninstall command is registered, including the Claude and Codex connectors bundled as Mew dependencies. No provider runtime was actually removed.

Local checks: the settings browser test exercised reset cancellation and confirmation, unavailable removal, and a supported removal using mocked APIs; settings storage regressions also passed. Lint completed with warnings. The documentation checker reported 39 pre-existing link errors. The project build was run locally. No running server was restarted and no deployment was performed.

## Runtime list refresh after removal

Runtime settings now publish the refreshed runtime list after installation or removal so open selectors and agent setup update their actions. A mocked browser regression reproduced the missing Install button after removal and passed after the fix; it also checks the existing settings dialog. The two targeted browser tests and the project build passed; lint passed with warnings. The documentation check still reports 39 existing link errors. No provider runtime was removed, no server was restarted, and no deployment was performed.

## Runtime settings navigation on 2026-11-18

The previous dialog put install, login, reset, and uninstall actions on the same screen, with a Save button even when no execution settings had changed. The dialog now opens on the installation and account overview. Launch options and management actions each have a dedicated view. The [runtime guide](../../../docs/configuration/agent-runtimes.md#installation-login-and-subscriptions) lists the tasks available in each view.

All 20 focused tests passed. Browser checks at 360px and 1100px covered keyboard navigation, stable tab positions, pending edits across tabs, reset and uninstall confirmations, and the separate Codex connector and CLI statuses. At 360px the Save button stayed within the viewport after ten environment rows were added. The suite also covered account actions, installation progress, updates, settings storage, and shared translations. The browser tests used mocked provider APIs.

The local build passed, including TypeScript, and lint passed with warnings. The project-wide localization check flagged Korean UI literals outside the runtime settings changes. The documentation checker validated descriptions and reported the same 39 broken links as before the edits. Live provider operations and physical-device checks remain unverified.

## Runtime picker notices and terminal actions on 2026-11-25

Warnings and errors now open from colored exclamation icons in the runtime row, keeping long messages from changing the list height. When a new update is available, the picker offers the update action first. The terminal button becomes usable once the job has a session. See the [runtime picker contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md#implementation-details).

An isolated copy of committed main with the task changes passed `npm run build`, including TypeScript. The 11 focused tests passed, covering desktop and mobile warnings, update and install transitions, terminal access, settings, and translations using mocked APIs. Lint passed with existing warnings. Additional new-tab shortcut, Kimi registry, and repository-wide localization checks also failed on the baseline. The documentation checker validated the wiki descriptions and reported 39 existing link errors in the shared checkout. Whitespace validation passed.

The running Mew instance at `127.0.0.1:5000` served the new UI entry point and the reachable agent panel and runtime settings bundles. All returned HTTP 200 and matched local `dist` assets by SHA-256. The server process stayed running throughout the check. Provider installations and physical-device checks remain unverified.
