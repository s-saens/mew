---
title: "0027 — Demo with a complete public file listing and on-demand content"
description: "Decision to split the demo's curated copy into a file listing from the full public commit and a small initial copy, and fetch fixed static source content on demand. Defines initial size, content caching, virtual Git state, blocking of external connections, and deployment implications."
created: "2026-10-20"
updated: "2026-10-20"
---

# 0027 — Demo with a complete public file listing and on-demand content

Status: Adopted

## Background

The existing demo starts quickly with only a small copy of code and documents, but does not allow browsing the rest of the repository's files and attachments. Including all source content in the app bundle would transfer and retain in memory even files that users will not open when starting the demo. Users need to browse the entire public repository while keeping initial entry costs limited.

## Decision

Retain the shared UI, per-visitor virtual state, and in-memory storage from [ADR 0020](0020-browser-demo-runtime.md). Split file preparation into a metadata listing from the full public commit and the existing small initial copy. Folder browsing and filename search use the listing; content absent from the initial copy is fetched when a file is opened or content search or download is explicitly invoked.

Generate the listing and content from the same fixed commit. Package content as hash-identified demo static artifacts. Do not connect to GitHub, actual Mew APIs, or the host file system from the browser, and do not use the working tree, stage, or untracked files as sources for the public copy. Apply public file inclusion/exclusion criteria and task account removal during generation.

Check the sizes of the initial copy and listing separately. Keep fetched source content in a bounded memory cache and manage concurrent requests and cancellation. Separate the source content cache from edits and virtual Git history so that fetching or evicting content does not create Git changes. Edits and virtual history are not lost because of source content cache size limits.

## Rationale and Impact

Separating the information needed to browse all files from the content currently being read eliminates the need to transfer all source content on the first screen as public files grow. Source content is served from the same demo origin as the app, avoiding dependence on external repository responses and request limits and allowing verification that file contents match the fixed commit.

Broad content searches and downloads still require substantial data and time. This cost occurs during the corresponding user action and is distinct from the initial browsing cost. The source content cache limit applies to unedited bodies and does not claim to limit edits, Git history, or all browser viewer memory.

Deployment artifacts must also include the source content files corresponding to the listing. Listing updates, app builds, and public deployments are separate operations; changes to source code and isolated tests alone do not update the public demo. The [browser demo](../development/demo.md) owns the current inclusion criteria, budgets, generation commands, and verification.
