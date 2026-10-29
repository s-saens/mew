---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew assets are stored in the project's .mew directory. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0120 — mew assets are stored in the project's .mew directory"
created: 2026-09-07
updated: 2026-09-07
---

- Date: 2026-09-07
- Status: Adopted
- Follow-up decision: [0150](0150-mew-account-feature-and-file-permissions.md) — Public read-access boundary for UUID attachment links
- Decision makers: Song Sanghun (direction), Codex (comparison against the current implementation and documentation)

## Background

Images, audio, and video pasted or uploaded into mew's editor were stored in a Cloudflare R2 bucket, with public URLs inserted into the body. In
addition to deploying the app and workspace, this architecture required separately preparing an R2 bucket, S3 credentials, and a public
domain, complicating native installation and server migration. Project files and assets also had different backup and recovery
boundaries.

## Options

1. Keep R2 and improve only installation automation — Makes it easy for multiple servers to share the same assets, but still requires an external account, bucket, credentials, and separate backups.
2. Store assets in `MEW_DATA_DIR` as app data — Reduces deployment dependencies, but assets cannot be moved or restored with the project through Git.
3. Store them in each project's `.mew/assets/` — May increase project size and Git history, but makes code, documents, and assets a single deployment unit.

## Decision

Adopt option 3.

- Store new editor assets in `<프로젝트>/.mew/assets/<uuid>.<확장자>`. Use the original name selected by the user only as the display name of the link in the body.
- Only logged-in accounts can upload, and existing file-size and upload-count limits remain in place. Saved assets are committed immediately if the project is a Git repository and its ignore rules do not exclude them.
- The body links to an `/api/asset` URL on the same mew server. The URL is a bearer link containing the project and UUID path. To preserve the same sharing behavior as R2 public URLs, anyone who knows the link can read the asset without logging in, but this route permits only UUID files under `.mew/assets/`.
- Remove R2 environment variables, installation prompts, and SDK dependencies. Replace R2 links in existing documents with local links during the initial migration, and retain remote bucket objects to allow rollback.
- Do not retry R2 storage as the default path. If a need arises for multiple mew instances to share the same assets immediately without Git synchronization, reevaluate remote storage or a CDN layer in a separate ADR.

## Rationale

mew's supported deployment is a native installation, and the recovery unit for work is already `MEW_WORKSPACE` ([ADR 0111](0111-mew-native-deployment-and-supervisor.md)). Putting assets in the project ensures uploads always work without separate
Cloudflare configuration, and the body and its assets move together when the project is cloned, pulled, or backed up. UUID filenames
prevent collisions and path injection based on original filenames while preserving the sharing properties of existing
public URLs.

## Results

- New deployments require no R2 account, bucket, or public-domain configuration.
- Large binaries may increase Git repository size. Retain the current 25MB file limit and client-side image compression; if repository size becomes an actual production issue, make a follow-up decision on Git LFS or a separate media policy.
- Downloaded 22 existing R2 links (unique objects) to `.mew/assets/` and replaced all document links with local `/api/asset` links. Remote objects were not deleted.
