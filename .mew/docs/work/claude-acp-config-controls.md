---
description: "Records the Claude ACP configuration control mismatch, the model and permission mapping fix, local regression checks, and the remaining macOS verification boundary."
---

# Claude ACP configuration controls

On 2026-11-17, a report described working Claude authentication, quota, and chat but missing model, effort, and permission controls on a Mac mini. The bundled Claude ACP adapter returns its model list in session configuration options, while Mew previously read initial models only from the legacy model state. This identifies a concrete model-control incompatibility; the reported device was not inspected, so the cause of all three missing controls there remains unconfirmed.

`AgentSession` now reads Claude's advertised model and permission options on session creation, restoration, and configuration updates. It sends model selections and per-message model overrides through the advertised configuration option. The [runtime feature contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) describes the current behavior.

Local verification used a simulated ACP adapter: new and restored sessions, grouped model choices, changes, updates, and message-specific model restoration passed. The ACP and queue test files passed 33 tests; lint passed with warnings. The documentation metadata check passed, while the repository link check reported 39 existing missing or invalid links. The project build passed with chunk-size warnings. No real Claude request, Mac mini verification, deployment, or server restart was performed. The running server must load the changed server code before this fix can be checked on the affected host.
