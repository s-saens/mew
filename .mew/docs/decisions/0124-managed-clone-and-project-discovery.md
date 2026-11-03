---
title: "Managed repository cloning and nested project discovery"
description: "Extends the shared catalog with name-derived managed clones, account-scoped GitHub repository listing, public GitHub/GitLab HTTPS cloning, and bounded nested Git/Mew discovery. Records credential isolation, provider limits, and catalog membership guarantees."
created: "2026-11-03"
updated: "2026-11-03"
---

## Status

Accepted. Extends [ADR 0118](0118-shared-project-registry.md) with managed clone registration and nested discovery. Its instance-wide catalog, personal shortcuts, and per-account active-root boundaries remain.

## Context

The inline project panel needs Git cloning before a project is open. The old external-folder clone flow requires a destination path and uses the host OS environment. Connected GitHub credentials already belong to individual Mew accounts, while nested repositories and Mew projects need to appear beneath their registered parents.

## Decision

Add cloning to the existing project-registry API. Derive the managed destination from the repository name, reserve a fresh directory, and register and pin the result only after Git succeeds. Clean up failed clones. Keep repository files intact. Permit public GitHub/GitLab HTTPS URLs without an account connection; use the existing account-scoped helper for connected GitHub clones. Disable inherited credentials/configuration, prompts, redirects, hooks, templates, and non-HTTPS transports.

List connected GitHub repositories through the authenticated user endpoint with owner, collaborator, and organization membership, all visibility, and full pagination. Keep the API origin fixed and check the connection identity before delivering a result. GitLab private authentication remains outside the registered provider contract.

Catalog reads import existing direct managed folders and discover nested Git/Mew roots with bounded, link-free traversal. Register discoveries before they can become My Projects shortcuts. Store their discovery origin and compute their nearest catalog ancestor for display. Personal-list reads filter orphan paths; unavailable registered folders remain present.

## Alternatives and rationale

- Reusing external-folder cloning would preserve path entry and host credentials. Managed cloning instead matches name-first creation and existing account ownership.
- Adding GitLab OAuth now would require a new provider, authorization flow, and credential contract. Public GitLab cloning is useful within the existing transport boundary; private support remains explicit future work.
- A hierarchy only in browser state would allow shortcuts absent from the shared catalog. Registering discovered roots keeps one canonical project set across accounts.
- Unbounded scans or following symlinks could traverse dependencies or unrelated filesystem roots. Bounded scans omit those paths and allow explicit linking when automatic discovery does not reach a project.

## Consequences

The project panel can create, clone, and link projects without asking users for the managed storage path. Catalog listing may discover and persist new entries, but never pins them automatically. Permission rules after selecting a root remain in force. Private provider access depends on account authorization and organization SSO. Other Git hosts, GitLab private authentication, and live external-provider verification remain outside this implementation.

[Architecture](../development/architecture.md#shared-project-registry-and-my-projects) owns schema, APIs, discovery limits, and failure behavior. [Git connections](../development/git-connections.md#managed-project-cloning-and-repository-listing) owns credential and provider boundaries.
