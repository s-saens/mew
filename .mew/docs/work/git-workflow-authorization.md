---
title: "GitHub workflow push authorization"
description: "Investigation and local correction of missing GitHub OAuth workflow scope for Git panel pushes, including verification and runtime application limits."
created: "2026-11-17"
updated: "2026-11-17"
---

# GitHub workflow push authorization

The reported push reached progress before failing with a generic remote error. The connected account had repository push access, but its OAuth token lacked `workflow` while the pending commits changed a GitHub Actions workflow. A dry-run push succeeded; it does not exercise server-side receipt and cannot establish the actual rejection. The prior Git stderr was not retained.

Mew now requests the additional scope at device authorization and recognizes GitHub's workflow-scope rejection without exposing raw Git output. [Decision 0186](../decisions/0186-github-workflow-scope.md) records the permission change; the [connection contract](../development/git-connections.md) describes the behavior and reauthorization boundary.

Local verification: 31 Git connection, authentication, workbench, and error-classification tests passed; targeted lint and `npm run build` passed, with a Vite chunk-size warning. `npm run check:docs` accepted all 860 descriptions but reported 39 existing link errors outside this change. The running server was not restarted, and actual reauthorization and push remain unverified. Existing connections require user approval of the added scope after the server code is applied.
