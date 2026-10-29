---
title: "Operations and Recovery"
created: "2026-09-11"
updated: "2026-10-29"
description: "Connects security requirements before sharing, server deployment checks, installation locations and access boundaries, and agent memory recovery. Distinguishes superseded DOM browser experiments as historical verification evidence."
상위파일: "../README.md"
---
# Operations and Recovery

Checklists and recovery guidance used repeatedly in actual operations.

| Required Task | Document |
| --- | --- |
| Checks before and after public release, updates, and deployment | [Deployment Operations Runbook](deployment.md) |
| Check account sharing, roles, guests, device revocation, and data retention | [Security Operations Standards](security.md) |
| Check installation locations, ports, and OS execution boundaries | [Access Model](access-model.md) |
| Set up agent memory limits, diagnose issues, and resume work | [Memory Protection and Recovery](agent-memory.md) |
| Diagnose Windows connectivity and WSLg crashes | [User Troubleshooting](../guides/troubleshooting.md) |

[Security](security.md) owns the product's role and permission standards, [Environment Settings](../configuration/environment.md) owns configuration values, and [Deployment](../deployment/_deployment.md) owns installation procedures.

## Historical Verification Evidence

The [DOM Browser Google OAuth Experiment](../../.mew/docs/history/browser-dom-oauth.md) describes the execution method and verification conditions as of 2026-09-11. Current login follows the [Login Virtual Desktop](../../.mew/docs/development/login-desktop.md).
