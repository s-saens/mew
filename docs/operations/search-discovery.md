---
title: "Search policy for the public introduction and workspace"
description: "Explains noindex and robots responses for installed Mew workspaces and their scope for direct, development, and P2P access. Links separately to product site visibility plans and dated assessments."
created: 2026-10-23
updated: "2026-10-29"
---

# Search policy for the public introduction and workspace

A Mew host is a workspace for documents, code, and agents. Distinguish the public product introduction intended to attract search traffic from the installed workspace. The product's current public primary source is the [official repository README](https://github.com/s-saens/mew#readme), and Mewlink's role follows the [project introduction](../../README.md#open-it-from-another-device) and [domain decision](../../.mew/docs/decisions/0005-mewlink-domain-and-private-dashboard.md).

## Current workspace policy

Under the [indexing boundary decision](../../.mew/docs/decisions/0057-workspace-search-indexing.md), direct HTTP and Vite development responses from the host return `X-Robots-Tag: noindex, nofollow`. HTML entry points also include the same robots metadata and provide a title and description explaining the product. P2P uses the same host HTTP handling and preserves `X-Robots-Tag` in the forwarded header list. Users must build and apply the new UI for installed HTML to include the robots metadata.

`GET /robots.txt` and `HEAD /robots.txt` respond with `text/plain`, 200, and `Cache-Control: no-cache`. The content is as follows.

```text
User-agent: *
Allow: /
```

Crawling requests themselves are allowed so crawlers can read the page's `noindex`. Using `Disallow: /` together with `noindex` may prevent crawlers from seeing `noindex`. This is based on [Google's guidance on blocking indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing). robots and noindex are search policies that crawlers follow; existing [authentication and file permissions](security.md) enforce access permissions.

Documents and files allowed for guests, as well as unknown SPA paths, also follow the host response policy. The SPA's 200 fallback is retained for routing compatibility. The browser demo's existing `noindex` is also retained. The separate central service's public introduction, dashboard, and device connection pages, and responses from `app.mew.run`, are outside the scope of this host middleware and must be checked separately.

Visibility plans for the product introduction site are maintained in the [business operations document](../../.mew/docs/business/search-discovery.md), and the assessment at the time is maintained in the [research record](../../.mew/docs/research/search-discovery-baseline.md).
