---
title: "Browser Storage and Automatic Cleanup"
description: "Defines explorer anchor restoration; storage scopes by local user ID and instance verified through current P2P authentication results; password and external login session boundaries; per-device persistent login; access revocation; automatic recovery; origin cache budgets; 7-day lifetimes; automatic cleanup; draft/settings preservation; server storage of account themes; cross-device synchronization; browser cache migration; DB popup view settings; preservation of old shortcut values; and global skin migration. Also describes individual dismissal settings for installation and fullscreen startup guidance, a separate IndexedDB cache for file bodies and migration from localStorage, static code revalidation caches, and the demo's in-memory storage boundaries. Stored values for the removed internal browser are preserved but unused, and compatibility reads do not create default shortcuts."
updated: "2026-10-26"
상위파일:
  - "../MOC.md"
  - "MOC.md"
---
[ADR 0133](../history/decisions/0133-mew-browser-cache-budget-and-retention.md)

`@mew/ui/browser-storage` manages shared budgets and lifetimes for localStorage caches that can be regenerated from the server. Settings, open tabs, splits, and drafts in progress are not subject to cache cleanup. Authentication cookies, other apps' keys, server sessions, and actual files are not deleted either. Cleanup does not use `localStorage.clear()`.

The general internal browser and shortcuts UI have been removed. Previous `mew:browser-shortcuts` stored values are neither read nor displayed, and are not deleted in bulk. [Port Preview](port-preview.md) owns the storage boundaries for localhost apps.

Even when the existing shortcut compatibility utility is called directly, it returns an empty list if stored values are missing or corrupted. It does not create a default entry for a specific development address, and preserves valid user-saved lists and normalization and save behavior.

New agent transcripts and pending queue snapshots are stored in a separate IndexedDB. Account isolation, the 4MiB/32MiB budgets, the 7-day lifetime, and range synchronization follow the [Conversation Storage Contract](conversation-storage.md). The 2MiB target below applies to regenerable localStorage caches. Draft and settings storage locations remain unchanged.

The new persistent cache for file bodies is written asynchronously to scoped IndexedDB `mew-file-content`. Limits of 2MiB and 256 entries per DB, 40 entries per account/root, and a lifetime of 7 days after writing apply; these budgets are separate from the localStorage total below. Only valid entries in the existing `mew:content:*` are migrated asynchronously, and successfully migrated originals are deleted. The memory cache, conditional body retrieval, permission checks, and behavior on migration failure follow [File Body Retrieval and Cache Restoration](file-loading.md).

## Demo Memory Storage

Optional settings in `setBrowserStorageScope` allow injection of the `Storage` backend for localStorage and sessionStorage and whether to use persistent caches. Normal and P2P connections retain existing browser storage and IndexedDB. The [Browser Demo](demo.md) selects a dedicated memory backend before importing the app. Themes, fonts, and shortcuts that read `globalBrowserStorage`; settings, drafts, and caches that read `scopedBrowserStorage`; and break progress and window identifiers that read `globalSessionStorage` are all isolated from actual storage. Shared cache budgets and cleanup also use only the selected backend.

The demo uses `persistentCaches: false` to avoid opening the IndexedDB databases for file bodies, agent history, scheduled items, and legacy skins. It starts with fresh example state after initialization or refresh and does not delete keys or databases for other connections. `src/demo/storage.test.ts` and browser checks of the actual work screen verify isolation.

## Account Themes

The per-account `theme` in `DATA_DIR/user-ui-state.json` is the canonical source for the selected theme and custom list. They are shared across projects, devices, and connection addresses for an account on the same Mew instance. Only logged-in users use `GET /api/user-ui/theme` and `PUT /api/user-ui/theme`, and the owning account is determined from the server session. Account identifiers in requests are not used. GET accepts `{state: ThemeSettings | null}`, PUT accepts `{state: ThemeSettings, initialize?: boolean}`, and they return the saved `{state}`. Input is limited to 64KiB and passes through shared palette normalization. Invalid top-level formats, palettes, or lists and oversized input are rejected with 400, preserving existing stored values.

The browser's existing selection is imported through `initialize: true` only when the first query returns empty. This save returns an account theme created earlier by another device without overwriting it. Subsequent server queries always take precedence over existing browser copies. Explicit selections and custom additions, edits, and deletions apply immediately on screen, and save requests are serialized within the device. Concurrent changes across devices follow the full settings last saved by the server. Late query results and earlier save responses do not change a newer user selection; another query after saving checks for changes from other devices. Save failures are reported with a toast, retaining the current selection and unsaved changes for retry on the next change, return, or reconnection. Previous responses are not applied after an account switch or unmount.

After saving, a content-free `{type:'theme'}` is sent only to the same account through the existing presence socket. `usePresence` forwards it as a `mew:theme-changed` event, and `useAccountTheme` queries again. Queries also run when the screen becomes visible again, when restored from bfcache, and at `mew:permissions-changed` on returning online or reconnecting presence. Applying query results alone does not write back to the server.

The browser's per-account copy is stored in `mew:themes:<JSON 계정 ID>` in scoped localStorage. P2P also follows the existing account and instance scope. Global `mew:themes` and `mew:theme` are copies for the initial screen before authentication, not the account's canonical values. Global `mew:themes:legacy-account` remembers the account that first inherited the previous browser theme to prevent migration to other accounts in the same browser. Existing mode and theme color migration continues to follow the [Theme Contract](ui-contracts.md#theme-colors-and-derived-accents). These copies and migration markers are user settings and are excluded from automatic cache cleanup. Browser storage failures do not block server synchronization. Other device settings, including language, fonts, and Dock, retain their existing storage scopes. Demo account state and caches are stored only in memory.

Verification uses actual HTTP, per-account WebSockets, and independent Chromium contexts in `server/account-theme.test.ts`, plus migration, response race, save failure, and lifecycle checks in `src/utils/account-theme.test.ts`. The rationale is recorded in [ADR 0030](../decisions/0030-account-themes.md).

## Don't Show Again for Startup Guidance

**Don't show again** for installation and fullscreen guidance is stored separately in localStorage in `scopedBrowserStorage`. The logical keys are `mew:startup-guide:install:hidden` and `mew:startup-guide:fullscreen:hidden`, respectively. Checking the box immediately writes the string `1`, and unchecking it writes `0`; the corresponding guidance is hidden on the next load only when the value is `1`. Selecting this for one guide does not hide the other.

Direct connections follow the existing origin scope, and P2P follows the current local account and instance scope. These settings do not sync across devices and are excluded from automatic regenerable cache cleanup because they are user settings. If storage is unavailable, the selection is retained for the current app lifetime, but permanent hiding after refresh is not guaranteed. Closing without checking the box is remembered only in memory. Display order and installation mode detection follow the [Startup Guidance Contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#app-installation-and-fullscreen-guides-at-startup).

Browser drafts for removed feature panels are no longer read or written and are not automatically deleted.

## DB Popup Display Settings

Standalone DB popups store the view mode, grouping and date columns, and card display properties in scoped localStorage `mew:db-layout:<DB UUID>`. These are user settings scoped to the account and instance and are excluded from regenerable cache cleanup. DB references within documents store display settings in the corresponding Markdown node, separately from popup preferences. The boundary between data and display settings follows the [DB Feature Contract](../features/document-databases/document-databases-and-catalog.md#saving-view-settings).

## Managed Data and Budgets

Files in server-global `DATA_DIR/mewpet/skins/` are the canonical source for the Mewpet skin list, images, frame counts, and names. The API for the same Mew instance is read regardless of project, workspace, account, or device; P2P also uses that instance's server files. The browser stores the selected ID in existing scoped localStorage `mew:mewcat-skin`. Size, visibility, and selection remain per-browser preferences.

Existing scoped IndexedDB `mewcat-sprite-skins` is preserved as the migration source. After the owner saves a valid skin to the server, `mewpetImported` is marked; if uploading fails, the original is retained and retried on the next query. If the server already has the same ID, the skin is marked as migrated without overwriting it. Accounts other than the owner, and migration failures, display existing local images. Items deleted globally after successful migration are not registered again from the originals. These originals, selections, and sizes are user settings and are excluded from automatic cache cleanup. The [Mewpet Skin Contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#skin-selection) owns image validation, save failure, deletion, and playback rules.

The normal Mewpet display size is stored as a number in scoped localStorage `mew:mewcat-size`. It is a per-account, per-instance user setting and is excluded from automatic cache cleanup. The [Mewpet Display Contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#detailed-behavior) owns immediate application, restoration after refresh, defaults, ranges, and save failure indications.

PDF annotation drafts store the original version and vector strokes in `mew:pdf-draft:<계정>:<PDF URL>`. They are unsaved work rather than body caches and are not automatically cleaned up. Save failure indications, restoration conflicts, and removal after successful saving follow the [PDF Contract](pdf-viewer.md#drafts-and-lifetime).

Unsaved task changes and the last input draft are retained in `mew:task-draft:<계정>:<루트>:<창 ID>` using the shared `writeBrowserStorage` and excluded from automatic cleanup. They are isolated from values retained by other windows, and only the corresponding changes are cleaned up after a successful server save. This follows [Task Lifecycle and Recovery](task-list.md#client-lifecycle-and-errors).

| Type | Key | Per-entry limit |
| --- | --- | --- |
| Legacy file bodies (new writes discontinued) | `mew:content:*` | 256KiB (valid entries migrate to IndexedDB) |
| Legacy agent transcripts (new writes discontinued) | `mew:agent-events:*` | 512KiB |
| Agent model and permission display cache | `mew:agent-controls:*` | 32KiB |
| Folder child lists | `mew:tree-children:*` | 256KiB |
| Successfully sent input history | `mew:agent-input-histories`, `mew:tmux-input-histories` | Latest complete entries, each within 128KiB |

- The localStorage cache target across all roots, accounts, and types is **2MiB**, and the total origin usage target is **4MiB**. The UTF-16 size of keys and serialized values is calculated, and up to 64KiB is reserved for management metadata. This measurement is not identical to each browser's actual quota measurement.
- There are at most 256 entries, retained for **7 days** after the last write. When the total cache exceeds the limit, the oldest entries are removed first. Sent input history retains only complete strings within the latest 100 entries per tab; individual inputs exceeding 16KiB are excluded from this convenience history. This limit does not apply to drafts before sending.
- Space is freed **before** writing a new cache. Edits in memory and server files are retained even when large bodies are not cached. If a replacement body exceeds the limit, the old disk cache is removed to prevent previous content from reappearing.
- If saving important state or drafts fails, only the specified regenerable caches are cleaned up, and saving is retried once. Saving may still fail if important data itself fills the space or the browser prohibits storage; drafts are not truncated or deleted to resolve this.

## Execution Timing

Cleanup runs in `src/main.tsx` before the first React render. Checks then run **every 5 minutes**, on `visibilitychange` (hiding and returning), and on `pagehide`. Even if termination events are missed or background timers are delayed, checks run again at the next startup and when saving caches. The entire cache is not unconditionally deleted on exit, preserving initial screen restoration on reconnection.

On the first run after an update, old regenerable caches without dates are removed. Existing agent transcripts are retained if `savedAt` is valid and they fit within the budget. The managed date list is also limited in count and size and retained only for caches that actually remain.

When an agent tab is explicitly closed, **all runtime and cwd transcripts and control caches for that tab** are deleted after child components finish their final flush. Transcript and control caches for tabs found missing after querying the server account ledger also use the existing cleanup path. Drafts are deleted only through existing explicit tab termination and send actions, never automatically because they are old or absent from the ledger.

## Explorer Restoration and Virtual Rows

Tree account state stores the full list of open folders, child list caches, pixel scrollTop, and the `{tree,path,fraction}` center anchor. It does not store the rendering range or DOM rows. If virtualization means the anchor row does not yet exist, `mew:tree-materialize` finds the list with the same tree key, creates and centers that row, and then continues existing row-based restoration. Revealing a file tab's location uses the same path, and user scrolling and keystrokes follow existing rules for interrupting restoration. `server/explorer-performance-ui.test.ts` verifies an offscreen center anchor and tab location reveal with 1,000 entries.

## Storage Scope for Remote Local Account Connections

Before importing the Workspace App, the P2P bootstrap on the internal app origin receives the instance ID and current authentication result from the parent's connected MessagePort to determine the storage scope. If no authentication result is available, it checks through P2P `/api/auth/me`; downloading the lightweight authentication entry point overlaps with this preparation. The current authentication result is not persisted. The connection's random subject and central account ID are not data scopes. Physical localStorage keys and IndexedDB names include the local user ID and instance ID, with a separate scope for unauthenticated state. Existing email users keep their email IDs, while passwordless users use separate immutable IDs. Password and Mewlink logins linked to the same local user use the same personal storage. Login, logout, and account switching clean up existing work and screens and restart the app frame to avoid reusing another account's module caches or React state. When the scope changes, open IndexedDB connections are closed and the new scope's DB is opened. Normal local connections use existing keys and DB names. Installed static code copies, which are separate from account content, follow the [P2P Hash Revalidation Cache](remote-access.md#static-asset-compression-and-revalidation-caching).

The central launcher stores trusted session tokens for devices that consented to **Stay logged in in this browser → Remember** in per-device localStorage on the central origin. A new `x-mew-session` is initially kept in sessionStorage while the previous persistent token is removed, and is promoted to localStorage only after `trustedDevice` confirmation from `/api/auth/me` or a successful trust request from the central parent. Normal sessions before consent remain in sessionStorage, while existing 30-day tokens in localStorage retain compatible resumption. Trusted sessions are issued through a local password or approved external login, bound to the current account, authentication method, credential ID, and browser key, and expire after 90 days of inactivity. They are extended immediately on resumption and at most once a day during valid session checks on open connections. Trust registration revokes the previous bearer session.

An Ed25519 CryptoKeyPair for browser identity is generated and stored per host instance in IndexedDB on the central origin. The private key is non-extractable, and browser tabs for the same host share the key. Separate keys are used for different hosts to reduce visit correlation. If storage is unavailable, the connection uses a non-extractable key in memory, so key retention for the next visit is not guaranteed. Keys and tokens are excluded from regenerable cache cleanup. The internal app origin cannot read central storage, and app transport provided to the exact launch frame also excludes private keys, session tokens, central cookies, and launch proofs. The app bridge rejects `/api/auth/remote-device` to prevent bypassing the central parent's consent, and `x-mew-session` is removed from app response headers after storage. Passwords are not stored.

The saved session is resumed in the first transport authentication message of the next connection, and the server-side session, account, credentials, and key fingerprint are revalidated. Trusted external sessions resume even after the central cookie expires if the host's approved connection and key remain valid. Normal external logins before consent do not create password session tokens and check the central session lifetime. Explicit external login skips resumption of existing local sessions. Logout, `access-revoked`, and explicit authentication rejection remove the stored token for that device and stop automatic retries. Keys are preserved to maintain revocation identification, and other hosts' keys and tokens are left untouched. If the key is lost through IndexedDB deletion or browser data removal, the token alone cannot resume the session, and authentication is required again.

Automatic recovery from a temporary disconnection preserves the existing app iframe and unsaved input. After confirming the same local account and authentication method on the new connection, it switches transports; if the account or authentication method differs, it cleans up the existing scope and restarts the app frame. In-flight requests on the previous connection are canceled, and saves and commands are not rerun. Frame restart rules for initial login, logout, and explicit account switching remain in effect. This follows [Browser Trust Decisions](../decisions/0015-trusted-browser-access.md) and [Connection Lifecycle](remote-access.md#connection-authentication-and-revocation).

The cache budget of 2MiB and total origin budget of 4MiB aggregate all remote scopes. Regenerable caches are identified by logical keys with scope prefixes removed, and per-scope write timestamps are combined in a shared cleanup ledger to delete only old caches. Connecting to multiple A instances does not increase the budget per A. On disconnection, regenerable localStorage body caches, transcripts, and input history for the current scope are cleaned up, while unsent agent and terminal drafts, PDF annotation drafts, open tabs, and settings are preserved. The detailed connection lifecycle follows [Account-Based Remote Access](remote-access.md).

## Verification

- `packages/ui/src/browser-storage.test.ts`: Total budgets, time-based expiration, legacy cleanup, draft/settings preservation, quota retries, input history limits, periodic/lifecycle events, and aggregate budgets across multiple remote scopes.
- `src/utils/agentEventCache.test.ts`: Transcript limits, replay merging, and tab termination cleanup.
- `server/remote-access-storage.test.ts`: Isolation of localStorage/IndexedDB by central account and A instance, and switching scopes for open databases in an actual browser.
- Local `mewlink/test/trusted-browser.browser.test.ts`: Verified non-extractable keys and same-host key reuse, sessionStorage-only storage for normal bearer tokens and persistent storage and revocation of trusted tokens, preservation of the same iframe and drafts, and command execution 1 time(s) in Chromium with mocked central and RTC responses. This was not an actual network disconnection check.
- `server/editor-pane-ui.test.ts`: Opening files after initial browser cleanup and keeping the editor alive when saving fails.

Browser data is specific to each user device. Code changes alone do not change storage in older pages that are currently open; first-run cleanup applies when the user builds and refreshes.


Fast restoration of root projects uses a limited in-memory snapshot inside the logged-in App, separate from this disk cache. Lifetime, capacity, permission invalidation, and server requery criteria follow the [Fast Switching Contract](ui-contracts.md#fast-root-project-switching).
