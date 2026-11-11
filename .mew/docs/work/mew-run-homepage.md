---
title: "Mew.run homepage and Mewlink subdomain work"
description: "Records the design-first homepage and Mewlink origin split, read-only infrastructure findings, implementation stages, actual local checks, and operator-owned domain/deployment and native-device limits."
created: "2026-11-11"
updated: "2026-11-11"
---

# Mew.run homepage and Mewlink subdomain work

## Purpose and design

The user requested a public homepage and a separate Mewlink entry, then specified design documentation before implementation and a polished one-page layout using translucent and blurred containers. The [homepage specification](../features/mew-run-homepage.md) defines composition, content, material, and acceptance criteria. [ADR 0167](../decisions/0167-homepage-and-mewlink-subdomain.md) records the origin and compatibility decision.

## Investigation

- Read project entrypoints and execution restrictions, then selected current remote access, central operations, browser testing, and domain decisions by document descriptions.
- Confirmed both parent and private central checkouts use `main`; both contain unrelated pending work. Preserve that work and commit only task-owned changes.
- Read-only Cloudflare MCP inspection found active apex/app Custom Domains on `mewlink` and no `link.mew.run` binding or DNS record. Current deployed central settings still use the apex. No infrastructure was changed.
- Code inspection found existing login/root/dashboard behavior that can be retained, legacy protocol preservation requirements, a single-redirect host address resolver, and native iOS origin allowlists that require coordinated source updates.
- The linked decision-index path `.mew/docs/decisions/README.md` is absent in the current working tree and already appears as a pre-existing deletion. The existing numbered decision directory is present; no replacement index was invented.

## Implementation and verification

Design documentation was written and committed before implementation (`dfea27d`). The implementation keeps one Worker with a script-free apex homepage, distinct homepage asset routing, the new canonical central origin, exact legacy protocol support, and the original app/OAuth/identity/key/database boundaries. Existing saved host registrations are unchanged. New registrations and displayed public addresses use `link.mew.run`.

The homepage uses local typography, a real tracked split-workspace screenshot, translucent navigation and note panels, editorial workflow rows, and a larger frosted Mewlink panel. It loads no management script or account request. A route-collision regression preserves a valid old `/homepage/laptop` device address instead of treating every `/homepage/*` path as a public asset.

The parent Mew settings expose independent host and central builds plus an operator-only publishing action/pipeline. The private central build copies its screenshot/font dependencies from the matching parent checkout and emits a downloadable single-file HTML preview with embedded assets and license, so visual inspection needs no application server. Native iOS source normalizes saved old-domain URLs while preserving IDs/labels, updates app-bound domains and origin checks, and retains the isolated app-frame boundary. A new endpoint namespace revalidates its static cache; browser authentication can require sign-in again.

The initial `npm run check:docs` found 801 descriptions with no metadata errors and 39 existing link errors, primarily missing MOC/index paths and a moved repository-split task. None named the three new design documents. Those unrelated missing paths were preserved.

| Check actually performed | Outcome |
| --- | --- |
| New homepage Worker tests before implementation | Three expected failures: old apex redirected instead of serving the page |
| Host/iOS affected behavior before implementation | Expected failures in old canonical addresses, registration defaults, and domain declarations |
| Parent `npm run build` | Passed, including TypeScript; existing large-chunk notices remain |
| Central `npm run build` | Passed; homepage HTML/CSS and screenshot/font assets emitted |
| Central `npm run types` and `npm run check` | Passed |
| Focused central suites: homepage, domain split, preconnect, origin migration, username, OAuth bridge, email login | 42 tests in 7 files passed |
| Host address, registration-network, and agent-startup tests | 43 tests passed |
| `node --test apps/ios/bridge.test.mjs` | 7 tests passed |
| New homepage browser test against built artifacts | Passed with JavaScript disabled at 1440, 768, 390, and 320px; image loading, touch size, overflow, keyboard skip link, absence of management requests, and server-free downloadable preview assets/license checked |
| Visual inspection of browser captures | Desktop and mobile layouts inspected; mobile connection illustration spacing adjusted and browser test rerun |
| Parent `npm run lint` | Passed with existing warnings; scoped changed code lint passed without warnings |
| Mew actions/pipeline schema and action references | Three actions and one publishing pipeline validated without execution |
| iOS `Info.plist` parsing and scoped whitespace checks | Passed |
| Final `npm run check:docs` | 801 descriptions, 0 metadata errors; the same 39 pre-existing link errors, with no new link failures |

Browser fixtures load built assets with intercepted requests; they test layout and resource behavior. Worker tests separately verify CSP, cookie stripping, public caching, and HEAD behavior. An independent read-only code review found no blocking routing, security, or packaging issue.

The full parent test suite and the full central browser/P2P suite were not run. These focused checks do not establish real OAuth-provider login, external-network direct connectivity, or native iOS runtime behavior.

The private central implementation is recorded in commit `ad25e62`. The parent records host/native compatibility, Mew actions, and canonical documentation separately. Mixed files were staged by task-only patches; existing notification, image, documentation, and other pending changes were preserved. No push was performed.

## Remaining operational boundaries

The repository prohibits agent deployments, launcher execution, and server lifecycle operations. Live domain attachment before compatible code is applied would expose a rejected origin. Domain/certificate application and production acceptance belong to the operator. Central and host builds are separate; native iOS physical-device and signed release checks require the appropriate platform.

This Linux environment has neither Swift nor Xcode. XCTest, native iOS builds, and physical-device login/P2P checks were not run. The added native tests remain a release gate rather than a claimed pass.
