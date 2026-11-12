---
title: "Project results and publishing"
description: "Defines the results/publishing screen opened from the project command menu, editable action/provider pipelines, destination review, durable run recovery, and scoped external connections. Links the delivery design and artifact contract."
created: "2026-11-11"
updated: "2026-11-11"
---

## User contract

Provide a project-level results and publishing entry inside the [command menu](project-command-buttons.md), together with the [Build and Deploy controls](project-build-deploy-actions.md). Lead with the available result and actions to prepare another result or publish the project. Keep pipeline editing, command editing, and provider credentials in settings rather than the ordinary execution path. Use the shared UI components and retain compact mobile/desktop light/dark layouts.

Read-only discovery offers workflows from actual local actions and saved external connections. A saved empty pipeline list remains empty. Unsupported or malformed setup exposes recovery and agent assistance without preventing project work. Viewing or saving configuration never executes a workflow.

Publishing first shows its resolved destination. Confirmation carries the reviewed plan revision; reject execution if a referenced command or provider target changed in the meantime. Remote repository workflows use the version already uploaded to the selected branch; Mew does not automatically commit, push, or upload local changes. Follow the actual configured steps and provider status. A configured address does not certify service health, and a successful remote workflow is not automatically a deployed website. Use neutral execution-complete wording when no application result is known.

The [delivery design](../../development/project-delivery.md) owns architecture and capability boundaries. [ADR 0165](../../decisions/0165-project-delivery-pipelines.md) records the decision.

## Configuration

Project-owned `.mew/project-pipelines.json` version 1 stores named ordered pipelines with purpose `preview` or `publish`. Each step has a stable ID and name, and either `type: "action"` plus `actionId`, or `type: "provider"` plus `connectionId`. An optional `resultUrl` must be an HTTP(S) address. Action references resolve through `.mew/project-actions.json` and its existing discovery rules. Provider connections are private to the current account and canonical project root.

```json
{
  "version": 1,
  "pipelines": [{
    "id": "website-preview",
    "name": "Prepare website",
    "purpose": "preview",
    "steps": [{ "id": "build", "name": "Build website", "type": "action", "actionId": "npm:build" }]
  }]
}
```

The editor selects named existing actions and connections. It does not invent a testing step when the project has not configured one. More steps can be added and reordered without changing the ordinary results/publishing controls.

## Execution, results, and recovery

Resolve and snapshot all steps before dispatch and reserve the canonical project root. Reject overlapping pipeline or manual action starts. Run steps sequentially, stop after failure or uncertain execution, and skip remaining steps. Record source Git commit/dirty information when available; execution uses the current trusted working folder rather than an isolated checkout.

Persist bounded account-visible pipeline records in private installation data before work starts and as state changes. Bind history to the directory identity and account creation identity so recreated folders/accounts do not inherit prior records. Recheck current execution permissions before starting later steps. Preserve completed action and ZIP authorization metadata for result downloads. Existing artifact rules still apply: files are not immutable copies, and changed ZIP inputs reject downloads. A restart marks unfinished orchestration interrupted and does not replay it. Keep recorded provider execution IDs available for explicit status refresh without resuming later steps. Recover a missing provider link using its exact stored request ID. A confirmed remote step result remains openable even if the overall pipeline stayed interrupted.

Local commands time out after 30 minutes, with owned process-group cleanup before another pipeline is allowed to start. After restart, a recorded live group blocks new work, including legacy action starts. A crash before PID metadata is saved can still leave execution uncertain; startup does not automatically kill or repeat work. History retains at most 20 runs and 32 MiB per project identity; definitions allow 30 pipelines, each with at most 12 steps, in a 256 KiB configuration. Remote orchestration polls for at most 20 minutes and stops after repeated status failures; a provider can continue running independently.

The connected page watches active runs and sends completion/failure notices through existing preferences. Notices retain the originating project after switching or closing its controls. This is not background server push when no page is connected. Logs and detailed records remain secondary to files and real result links.

## External connections

The initial adapters support dispatchable GitHub Actions workflows, Git-connected Cloudflare Pages deployments, and existing Google Cloud Build triggers. Display actual provider stages only when supplied. Google individual build steps may remain pending until its whole build completes; do not invent intermediate progress. Provider console links remain available when no application URL is returned.

Connection settings include a label, provider target and branch/reference, and a token stored separately from project files. A saved token means credentials are present, not that remote permission has been verified. Tokens are encrypted, bound to account/project identity, omitted from API state, and revoked with account credentials. Changing a target prevents older runs from being queried with the new target. Dispatch records use exact remote IDs, persist before the external request, and never retry an uncertain request automatically.

The first connection settings require existing provider resources and a suitable token. Google tokens can expire and require replacement. OAuth/resource-selection onboarding, Workers deployment, direct asset upload, remote artifact ingestion, and provider-native rollback/cancel are subsequent capabilities. Agents and MCP can help configure a supported target but do not bypass the adapter or authorization contract.

## API and implementation

All routes preserve project, directory `path`, optional `workspacePath`, the workspace session boundary, and owner/manager terminal permission. Responses are private and not cacheable.

| Route | Behavior |
| --- | --- |
| `GET /api/project-pipelines` | Return definitions, readiness/revisions, bounded current-account runs, and warnings |
| `PUT /api/project-pipelines` | Validate and save definitions without executing |
| `POST /api/project-pipelines/discover` | Merge supported discoveries without replacing malformed or custom settings |
| `POST /api/project-pipelines/run` | Run the selected definition; publishing requires its reviewed `expectedRevision`; return `{run}` |
| `GET /api/release-providers` | Read private connection summaries and remote run records without external dispatch |
| `PUT /api/release-providers/connection` | Save provider configuration and optionally replace its private token |
| `DELETE /api/release-providers/connection/:id` | Remove the scoped connection |
| `POST /api/release-providers/refresh` | Refresh a recorded execution without creating another |
| `POST /api/release-providers/run` | Explicitly dispatch a connection with an idempotent request ID |

Shared models live in `shared/project-pipelines.ts` and `shared/release-providers.ts`. Pipeline services/routes, scoped request handling, provider adapters, and encrypted storage live in the corresponding `server/project-pipelines*`, `server/project-scope.ts`, and `server/release-providers*` modules. `ProjectRelease*` components and the workspace API supply the outcome screen, settings, completion notices, and retained request scope.

See the [user guide](../../../../docs/guides/commands.md#results-and-publishing) for ordinary operation and the [work record](../../work/project-delivery-pipelines.md) for actual local verification and remaining limits.
