---
title: "Separate search indexing for the workspace and public product site"
description: "Apply noindex metadata and response headers to the host workspace while allowing robots to crawl it. The decision assigns canonical URLs, sitemaps, and AI citation settings for the public product introduction to a deployment with a verified primary URL and ownership."
created: 2026-10-23
updated: 2026-10-23
---

# Workspace search indexing boundaries

Status: Approved.

## Background

Diagnosis of the SEO configuration request found that the host HTML is the entry point for a React app handling login and guest access, with a different role from a product introduction site. Installation URLs are not fixed, and documents, code, and conversations vary by user, so creating an arbitrary public canonical URL or file sitemap would mix search targets with private workspaces.

## Decision

- Apply `noindex, nofollow` to responses from direct and development hosts and to app HTML. Preserve these headers and HTML metadata in P2P forwarding through the same HTTP server as well.
- Allow crawling in robots so crawlers can read `noindex`. Do not use indexing policy as a substitute for authentication or file permissions.
- Align the title and description with the product's actual definition. Do not create canonical URLs, sitemaps, public documents for AI, or blogs based on assumptions before the public primary URL and ownership are verified.
- The central Mewlink public introduction, device, and dashboard pages are managed under a separate policy for the central deployment. This decision does not change permissions for existing device access or guest sharing.

## Rationale and Impact

[Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing) explains that crawling must not be blocked by robots if crawlers are to read indexing exclusion metadata and headers. The same search boundary can apply even when hosts are installed on multiple domains, and search traffic to a public introduction can be managed by its owning deployment.

Documents readable by guests also follow the host's search exclusion policy. Operating public documents as destinations for search traffic requires a separately designed public-document deployment and indexing policy. The [search policy operations document](../../../docs/operations/search-discovery.md) owns the current response contract and post-application verification procedure.
