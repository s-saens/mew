---
title: "Mew ADR — Deployment, Security, Storage, and Documentation"
created: 2026-09-11
updated: 2026-10-07
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0201 — Windows portable management app and WSL execution layer](../../0201-mew-windows-manager-wsl.md) — Standalone Tauri app, dedicated WSL 2, non-administrator server, and localhost

- [0195 — Central account authentication and P2P remote access](../../0195-mew-account-based-p2p-remote-access.md) — mew.saens.kr, one-time server registration, and direct work data connections; design adopted, not implemented

- [0178 — README introduction and usage instructions in four languages](../../0178-mew-multilingual-readme-router.md) — mew README body and documentation entry paths

- [0132 — Project documentation in the owning project, ADRs centralized](../../0132-docs-project-owned-documentation.md)
- [0120 — Store assets in the project's .mew](../../0120-mew-project-local-assets-replace-r2.md)
- [0112 — Security and credential boundaries for public releases](../../0112-mew-public-release-security-and-credential-boundaries.md)
- [0111 — Limit supported deployments to native installation and a supervisor process](../../0111-mew-native-deployment-and-supervisor.md)
- [0023 — Self-contained repository suitable for public release and native installation](../../0023-mew-selfhost-packaging-repo.md) — Self-contained repository and XDG; deployment and assets are in 0111 and 0120
