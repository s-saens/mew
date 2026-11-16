---
title: "macOS memory usage estimate"
description: "Records the macOS resource monitor memory estimate, regression checks, build results, and remaining real-Mac and server application limits."
created: "2026-11-16"
updated: "2026-11-16"
---

## Purpose and result

The resource monitor could report nearly all RAM as used on macOS because it subtracted only completely free memory from total physical memory. The collector now estimates usage from `vm_stat` anonymous, wired, physical compressor, and purgeable pages. The [system resources contract](../features/appearance-accounts-operations/system-resources-and-processes.md#collection-and-api) describes the estimate and fallback.

## Verification and limits

- `node --test server/system-memory.test.ts server/sysStats.test.ts server/resource-sample-cache.test.ts src/utils/mewcat-notification-rules.test.ts`: 13 tests passed. Fixtures cover page sizes, cached and compressed memory, invalid output, fallback, and existing summary collection behavior.
- `npm run build`: passed, including TypeScript checks; Vite reported large-chunk warnings.
- `npm run lint`: passed with repository warnings.
- `npm run check:docs`: description validation passed; the link check reported 39 existing errors in other documents, including missing MOC targets and an absolute asset URL.

The tests ran on Linux with macOS output fixtures. They do not verify a real Mac or establish exact agreement with Activity Monitor. The server was not restarted or deployed; the running server must load the changed server code before the estimate takes effect.
