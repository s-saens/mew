---
title: "iOS hybrid client implementation and verification"
description: "Records the November 10 iOS hybrid client plan, implementation stages, native storage/direct transport/Mewlink boundaries, and actual verification results. Separates Linux checks from pending Xcode, signing, device, central rollout, and remote-push work."
created: "2026-11-10"
updated: "2026-11-11"
---

# iOS hybrid client implementation and verification

## Purpose

Implement the requested saved-connection iOS client while retaining Mew's existing React interface and browser behavior. Move retained static-code storage out of browser cache budgets. Write reviewable contracts and a decision before final integration; track implementation and evidence here rather than duplicating current contracts.

## Plan and dependency order

1. Inspect the existing startup, AppRuntime, Mewlink resource verification, notification ownership, and execution rules. Preserve the dirty main checkout and excluded central repository changes.
2. Record [ADR 0162](../decisions/0162-ios-hybrid-client.md), the [implementation contract](../development/ios-client.md), [feature acceptance](../features/appearance-accounts-operations/ios-client.md), and [operating guide](../operations/ios-client.md).
3. Implement the standalone SwiftUI project: saved endpoints, connection chooser, native file cache, navigation boundaries, WKWebView lifecycle, and local OS notification bridge.
4. Implement Mewlink native storage at the existing resource-verification boundary. Keep current-host confirmation and ordinary browser CacheStorage unchanged.
5. Implement direct local entry loading, custom scheme resources, native HTTP/WebSocket bridge, and AppRuntime selection. Isolate accounts/connections and preserve existing browser paths.
6. Add behavior regressions for integrity/revalidation, isolation, cancellation, socket lifecycle, notifications, and missing native capabilities. Review native/web protocol agreement.
7. Run relevant tests, required build, lint and document checks. Record actual failures and prerequisites; do not infer iOS results from Node tests.
8. Review the final task-only diff, record change intent, and commit only this task's files. No push, deployment, launcher execution, or server lifecycle operation.

## Architecture findings

A URL-only WebView does not bypass web storage policy. A direct service-worker cache also cannot reliably cover arbitrary user hosts under iOS App-Bound Domains. The selected design preserves the existing Mewlink origins and moves direct connections to local HTML with a native same-host transport. The [ADR](../decisions/0162-ios-hybrid-client.md) explains alternatives and consequences.

The current checkout contains unrelated tracked/untracked changes, including current notification and storage documentation. This task adds focused owning documents rather than overwriting those edits. The referenced decisions README is already deleted; it is not recreated by this work.

## Implementation status

Source implementation and Linux verification are complete. The deliverable is an Xcode project and shared web integration, not a compiled or accepted iOS release. No Xcode or Swift toolchain is available in this Linux environment; native compilation, XCTest execution, signed installation, and physical iPhone acceptance remain incomplete.

Implemented source:

- `apps/ios/Mew.xcodeproj`, shared **Mew** scheme, SwiftUI saved connection UI, four existing UI languages, endpoint validation, app lifecycle and recovery controls, and an app privacy manifest.
- Native static-code files under Application Support with a 512 MiB total LRU bound, 16 MiB decoded resource bound, integrity/MIME/path validation, explicit cache removal, and separate endpoint namespaces.
- Direct fresh entry HTML, local scheme resource loading, native HTTP/WebSocket ownership, cancellation/limits, scoped account storage, public URLs, and native-only bootstrap. Prefer verified account IDs so a recreated same-email account does not reuse old browser state.
- Mewlink native storage adaptation at the existing live-host verification boundary. No excluded central repository files changed; central frontend application remains separate.
- In-session native notification permission/show/close/tap integration, per-delivery native IDs, asynchronous completion isolation, and foreground permission refresh.
- Regression fixes found during independent review: bounded background cache reads release write slots after stalled streams, and older same-ID notification completions cannot remove newer notices. These have automated tests.
- Native XCTest source includes a real WKWebView test for local app-bound loading, ES modules, dynamic import, module Worker, and frame identity; `.github/workflows/ios-client.yml` runs native tests on a macOS simulator after publication/manual dispatch. Neither XCTest nor the workflow ran in this environment.

## Verification performed

| Check | Outcome |
| --- | --- |
| `npm run build` | Passed; includes `tsc -b` and production Vite build. Existing large-chunk guidance remains |
| Focused combined Node/Chromium run | 72 tests passed, 0 failed, 0 skipped; includes native bridge/runtime/cache/notifications, existing resource worker and notification behavior, AppRuntime, API bundle boundary, and desktop/mobile workspace startup |
| Additional existing workspace/scope/reconnect regressions | 40 tests passed during direct runtime integration |
| `npm run lint` | Exit 0; existing repository warnings remain |
| Native property lists and Xcode scheme XML | 3 files parsed successfully; native Node tests also check project source/resource references |
| `npm run check:docs` | Metadata validation passed; repository-wide links failed with 40 errors in documents outside this task, including previously missing MOCs/decisions README and moved task links |
| Task-owned document links | No errors in the changed canonical documents; the app README links were also inspected directly |
| Xcode build / XCTest / physical iPhone | Not run: no macOS, Swift compiler, or Xcode SDK available |

The focused combined command was:

```bash
node --test apps/ios/bridge.test.mjs src/runtime/native-runtime.test.ts \
  src/runtime/app-runtime.test.ts src/utils/native-ui-cache.test.ts \
  src/utils/native-notifications.test.ts src/utils/remote-ui-cache.test.ts \
  src/utils/remote-resources.test.ts src/utils/notification-delivery.test.ts \
  src/api/client-bundle.test.ts src/workspace-startup.browser.test.ts
```

The build updated local `dist/` assets under the repository's required build rule. No deployment, server lifecycle operation, launcher execution, push, or central application occurred. Unrelated staged/unstaged/untracked changes remain outside the task commit.

## Remaining release and feature gates

- macOS/Xcode build and XCTest; signed installation and physical iPhone acceptance from the operating guide.
- Separate user-managed Mewlink central frontend application for changed root resource imports. Host build is not central rollout.
- App Store policy review and distribution assets/signing; no publication performed.
- Server-generated APNs remote notifications after suspension/termination. Local notification delivery is a separate, narrower capability.
