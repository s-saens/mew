---
title: "Mew.run homepage and Mewlink entry"
description: "Design and implementation contract for the Mew homepage, including the curl-first quickstart, Mewlink setup, light and dark themes, accessibility, and the separate link.mew.run sign-in entry."
created: "2026-11-11"
updated: "2026-11-25"
---

# Mew.run homepage and Mewlink entry

The original homepage deployed on 2026-11-11. The current setup guide and theme switch have been verified locally. The [work record](../work/mew-run-homepage.md#2026-11-11-authorized-production-deployment) records production verification and remaining account/native-device gates. Future application follows the request authorization in the [execution rules](../development/getting-started.md#execution-and-verification).

## Purpose and scope

Give first-time visitors a clear introduction to Mew and a credible way to start. Existing users enter Mewlink through `link.mew.run`. The public homepage is one page, independent of account state. It must communicate the existing product: a browser workspace for documents, code, Git, and AI agents, backed by files on the user's machine.

The homepage does not create a hosted workspace, sell a plan, or advertise an unpublished installer. Use source installation for regular setup. The published curl installer is a release preview while clean-platform acceptance is pending. The [release procedure](../operations/cli-release.md) owns installer status. Use “Source available” consistently with the [license](../../../LICENSE).

The [domain decision](../decisions/0167-homepage-and-mewlink-subdomain.md) owns origin separation and migration. The [remote access contract](../development/remote-access.md) continues to own authentication and P2P behavior.

## Visual direction

Use warm ivory and diffuse blue light in light mode. Use a deep blue canvas, pale ink, and restrained highlights in dark mode. Let the real product screen supply detail. Avoid template-like rows of identical feature cards, invented adoption numbers, stock testimonials, animated gradient blobs, and decorative badges.

| Element | Design |
| --- | --- |
| Canvas | Warm ivory `#f5f3ed`; broad, static sky-blue light behind the main visual |
| Ink | `#162a39`; secondary copy `#566875`; blue action accent `#245bdb` |
| Glass | White at roughly 64% opacity, bright 1px edge, `blur(22px) saturate(120%)`, subtle blue-gray shadow |
| Surfaces | Frosted navigation, large product-image surround, and a generous Mewlink panel; denser copy sits on more opaque material |
| Shape | Main panels approximately 28px radius, interior details 14–18px, pill actions; vary scale and composition |
| Typography | Existing local IBM Plex Sans and Mono assets; large tightly spaced headline, readable 18px supporting copy, restrained monospace labels |
| Layout | Approximately 1200px content width, generous section rhythm, asymmetric hero, and full-width product evidence |
| Motion | Optional short hover/focus transitions; content visible immediately without scroll animation or JavaScript |

Use a solid translucent fallback when backdrop filtering is unavailable. Avoid nested full-viewport filters and fixed animated backdrops. Text contrast must remain readable over the light source.

## Page composition and copy

1. **Navigation.** Mew wordmark, Mewlink entry, Get started, and the theme switch. The navigation is a small floating glass surface. Source links remain in the workflow and footer. On narrow screens, retain clear access to Mewlink and getting started without a JavaScript menu.
2. **Hero.** Headline: “Make room for your work.” Supporting text: “Documents, code, and AI agents. Together in a browser workspace, with your files on your own machine.” Primary action: Get started. Secondary action: Try in browser. Supporting platform text: “Linux · macOS · Windows via WSL 2.” A small offset glass note introduces the relationship between files, writing, and implementation.
3. **Setup guide.** Place the curl command first in a selectable code block with a copy button. Use a published, versioned installer and label its preview status. Link to the source installation instructions for regular setup. Alongside it, show how to register the host, copy its address, and sign in from another device with the host’s local Mew credentials. Preserve `#start` and `#mewlink` as direct links.
4. **Product evidence.** Show a real, repository-owned workspace screenshot at its natural aspect ratio. Reuse an existing tracked screenshot; keep the source path explicit in the asset preparation script. Do not fabricate an application screen or add a second browser frame around an image that already includes one. Provide descriptive alt text, intrinsic dimensions, and a compact caption.
5. **Workflow.** Three numbered editorial rows: “Write it down.”, “Build beside it.”, and “Review what changed.” Explain document editing beside code, terminals and AI agents, and Git review in one short paragraph each. Use rules and typography rather than repeating equal cards.
6. **Footer.** Include documentation, source, license, and Mewlink links.

Use English homepage copy initially, matching the public README. Keep UI text separate from operational configuration.

## Interaction and destinations

| Action | Destination |
| --- | --- |
| Get started | `#start` |
| Full installation guide | `https://github.com/s-saens/mew/blob/main/docs/guides/getting-started-en.md` |
| Source | `https://github.com/s-saens/mew` |
| Try in browser | `https://link.mew.run/demo` |
| Open Mewlink | `https://link.mew.run/` |
| Documentation | `https://github.com/s-saens/mew/tree/main/docs` |

The homepage performs no central account request and loads no dashboard, connection, or installed-workspace bundle. Standard links and the selectable install command work with JavaScript disabled. The page follows the device theme initially. The header switch stores the visitor’s choice in the browser. A local script also copies the install command when clipboard access is available. See [ADR 0216](../decisions/0216-homepage-local-controls.md). It does not show a login form or redirect signed-in visitors away from the homepage.

## Responsive and accessibility requirements

At 390px, stack the hero and offset note, preserve 44px primary touch targets, and fit the screenshot without horizontal page scrolling. At 768px, allow a quieter two-column composition where content fits. At 1440px, use the full product visual with a bounded reading width. Also inspect a narrow 320px viewport.

Provide a skip link, semantic landmarks, one H1, sequential headings, descriptive link text, visible keyboard focus, sufficient contrast, and reduced-motion support. Page zoom remains available. Images have intrinsic dimensions to prevent layout shifts; fonts have fallbacks. Decorative surfaces and diagrams are hidden from assistive technology.

The navigation logo contrasts with the active glass surface in both themes. The browser tab icon follows the browser’s color scheme. The setup panels stack on phones, and the command wraps within its block.

## Delivery and project ownership

Retain the existing Mewlink Workers + Static Assets deployment, D1 database, and per-device Durable Objects. Serve a distinct static homepage entry at the apex; keep the central frontend and P2P runtime independent. This avoids introducing another hosting project merely to serve one page.

The private `mewlink/` Git repository owns homepage source, packaged public assets, and Worker routing. The public parent repository owns host integration and these canonical documents. Version changes in each repository separately. Do not include existing notification or other unrelated edits in task commits.

Implementation entrypoints: `mewlink/public/homepage/index.html` and `styles.css` contain the static page; `mewlink/src/homepage.ts` selects the exact homepage/asset routes before legacy redirects. `mewlink/scripts/homepage-assets.mjs` copies the existing tracked `docs/assets/screenshots/split.png` and IBM Plex Mono font into the central build. The existing launcher build provides Sans fonts, favicon, and font licenses. `controls.js` handles theme selection and command copying.

The parent `.mew/project-actions.json` exposes **Build Mew workspace**, **Build homepage and Mewlink**, and **Publish homepage and Mewlink**. The central build emits `mewlink/dist/homepage-preview.html` as a downloadable single-file preview with inline controls, styles, image, fonts, and font license. It opens without an asset server; published navigation still uses the actual destinations. `.mew/project-pipelines.json` saves the operator's **Publish Mew.run and Mewlink** flow with the real destination URL. The deploy script includes its own builds; the flow does not run redundant build steps or invent an available local preview server.

Configure Mew build/deploy actions only against existing scripts. A configured action alone does not execute deployment. Deploy on or an explicit request authorizes the task’s documented deployment under the [execution rules](../development/getting-started.md#execution-and-verification). Do not mutate live DNS or attach `link.mew.run` before compatible code is deployed: the currently deployed Worker rejects that origin.

## Acceptance criteria

- Apex GET returns the homepage, HEAD returns matching metadata without a body, and central cookies do not change its content.
- Homepage resources load independently; no account API or dashboard bundle is requested.
- New Mewlink root shows login when signed out, redirects signed-in owners to `/{username}`, and shows username setup when needed.
- Owner dashboards remain private; another account receives 404. Public device links still begin without central login.
- Existing device, share, dashboard, registration, OAuth, and signaling paths retain the compatibility defined by the domain decision.
- Existing registration origins, signing keys, immutable identities, D1 bindings, and Durable Object namespaces remain intact.
- Native iOS origin validation and saved links follow the new canonical entry; physical-device validation remains an explicit release gate.
- Browser checks cover desktop/mobile layout, theme switching and persistence, keyboard access, exact clipboard text, links, image loading, and absent management requests. Worker tests cover host routing and migration.
- Required parent build, applicable central build/type/tests/lint, and documentation checks pass, or actual blockers are recorded.
