---
title: "Product search visibility operations"
description: "Configuration conditions for search and AI citations on the public product site, plus procedures for production rollout and remeasurement. Distinct from the noindex contract for installed workspaces."
updated: "2026-10-29"
---

## Configuration conditions for the public product site

Confirm the primary public address and ownership of the site's source and deployment, then configure it in the following order. Do not create arbitrary canonical URLs, sitemaps, or `llms.txt` for workspaces installed at different addresses on each host.

1. Provide the product's actual features, installation instructions, and source links in HTML received without logging in. Do not include private work documents, conversations, or device lists.
2. Add unique title, description, canonical, and sharing metadata to actual public pages. Match structured data to facts visible on the page.
3. Include only public canonical URLs in the sitemap and link to it from robots. Verify that nonexistent public pages actually return 404.
4. The operator determines policies for allowing search and real-time retrieval crawlers and training crawlers. List only verified product, installation, and support documentation in `llms.txt`. The existence of this file alone does not guarantee AI citations.
5. The operator verifies ownership in Google Search Console, Bing Webmaster Tools, and Naver Search Advisor and submits the sitemap. Do not mark registration complete without an account or verification token.

Create a public blog after defining real recurring questions to answer, original sources, reviewers, and a publishing cadence. Do not mass-generate question-specific pages or publishing schedules without search query or inquiry data.


## Production rollout and remeasurement

The agent checks source code and performs isolated checks; the operator builds the app, restarts servers, and deploys centrally. Passing local checks does not mean changes have been applied to production or have achieved search results.

On 2026-10-23, the isolated HTTP fixture was checked with `curl` to verify robots' 200 and text body, and HTML's `X-Robots-Tag`, title, description, and robots metadata. The 5 checks in `server/search-indexing.test.ts`, `server/remote-ui.test.ts`, and `server/vite-config.test.ts` also passed, along with type checking, linting of changed TypeScript, and documentation description/link checks. The P2P checks cover the actual dispatcher forwarding installation HTML metadata and headers; they did not verify deployment or search crawling of the central public service.

Immediately after rollout, the operator checks the following at the public entry point. Use the address of a host you manage for `HOST`.

```bash
curl -sS -D - "$HOST/robots.txt"
curl -sS -I "$HOST/"
curl -sS "$HOST/" | rg '<title|name="(description|robots)"'
```

robots must return the text response above, and `X-Robots-Tag` in HTML and file responses must contain `noindex`. For P2P, check the HTML metadata and forwarded headers of the same installation separately. For the central public introduction, verify in its owning deployment that it does not inherit the host's `noindex`.

Assuming rollout on 2026-10-23, the proposed first remeasurement date is **2026-11-06**. No automatic schedule was created. If the actual rollout date differs, adjust it to 14 days after that date.

| Measurement target | Baseline immediately after rollout | Check after 14 days |
| --- | --- | --- |
| Workspace | `noindex` in HTML and headers, guest/login permissions | Check exclusion status if you have Search Console access. Do not enter private paths into public search boxes. |
| Public site SEO and Naver | Record impressions, clicks, and indexing status for the past 28 days in GSC, Bing, and Search Advisor | Compare the same metrics and pages, excluding the most recent 2~3 days for which aggregation is incomplete. |
| Public site AI citations | Record 5~10 actual product and installation questions and the source URLs from ChatGPT search, Perplexity, and Naver | Record citation presence and URLs again for the same questions and services. |
| Public content | Record the URL, target question, original source, actual modification date, and impressions/clicks for each article | Check the proportion of articles that received impressions or citations and whether facts need updating. |

Current impression, click, and citation counts are **unmeasured**. Do not record them as 0 or claim improvement.
