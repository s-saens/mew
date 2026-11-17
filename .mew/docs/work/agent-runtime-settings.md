---
title: "Agent runtime settings improvements"
description: "Records the runtime settings dialog clarification, explicit override and environment variable removal, local verification, and remaining host CLI readiness limits."
created: "2026-11-17"
---

# Agent runtime settings improvements

The runtime settings dialog now groups installation and account actions separately from advanced execution settings. Claude and Codex describe the connector status and the distinct CLI and login requirements. Saved command and argument overrides can be cleared, and individual environment variables can be removed without replacing other masked values. New values are concealed during entry. See the [runtime settings contract](../../../docs/configuration/agent-runtimes.md).

Local verification covered settings merge, clearing and removal, asynchronous runtime status checks, and a 390px browser interaction with mocked runtime APIs. The project build and lint were run. The documentation checker found existing missing links across the repository, including the pre-existing MOC reference in the runtime guide. The settings screen does not check the host Codex CLI or install it; connector presence alone remains the selection criterion. Real provider installation and login were not exercised, and the server was not restarted or deployed.
