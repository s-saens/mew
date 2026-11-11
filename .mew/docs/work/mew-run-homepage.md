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

Design documentation was written before implementation. Implementation changes and checks will be recorded here when performed; the design itself does not claim built, deployed, or live behavior.

The initial `npm run check:docs` found 801 descriptions with no metadata errors and 39 existing link errors, primarily missing MOC/index paths and a moved repository-split task. None named the three new design documents. Those unrelated missing paths were preserved.

## Remaining operational boundaries

The repository prohibits agent deployments, launcher execution, and server lifecycle operations. Live domain attachment before compatible code is applied would expose a rejected origin. Domain/certificate application and production acceptance belong to the operator. Central and host builds are separate; native iOS physical-device and signed release checks require the appropriate platform.
