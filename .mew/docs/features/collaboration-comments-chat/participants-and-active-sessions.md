---
id: "mew-collaboration-presence"
parent: "mew-collaboration"
title: "View participants and active sessions"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-19"
status_hash: "64bc964f2ebbcdcec2bc83390c7f91ba8bb519df4201a59f54d46848f619d368"
files: ["src/components/active-sessions-button.tsx", "src/components/PresenceDots.tsx", "server/presence.ts", "server/presence-history.ts", "src/components/session-history.tsx"]
commits: []
description: "A feature contract covering the total active session count in the header's square icon, each user's sessions, devices, projects, and files, work participants, and connection history by date. It explains filters, graphs, a unified single-row timeline per person, hover details, Excel export, and hiding paths based on viewing permissions."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- Check current connections and where each user is working, and view and export connection history by date.

### Scope

- Show the total active session count inside a square icon in the header. Clicking it shows each user's sessions, devices, projects, current files, and work participants.

- Store connection history in the DB and provide date, person, and time filters, graphs by time of day, per-person timelines, and Excel downloads.

### Boundaries and limitations

- Do not expose project or file paths that the viewing account lacks permission to view.
- The session list is distinct from the list of running agent tasks.

### Detailed contracts

- [Collaboration usage](../../../../docs/guides/collaboration.md)

<!-- mew:implementation:start -->
## Implementation details

- Displays the total number of active sessions inside a 16×16px square outline like the fullscreen icon. The header count is `presence?.sessions.length ?? 1`: 1 if the list is not yet available, and 0 if the list is actually empty. Multiple devices and tabs for the same account, as well as guests, are counted individually. Counts of 100 or more are abbreviated as **99+** inside the icon, while the accessible name and tooltip provide the actual count. The scope of aggregation and session details follows the [presence contract](../../development/collaboration.md#active-mew-sessions-presence).

- Persist connections and observed-state intervals in SQLite, and on restart close unfinished intervals at their last observed timestamp.
- In the History tab, query by local date, person, and time, and download an actual `.xlsx` using the same permissions and filters.
- Provide a graph of connected tabs by time of day, a unified single-row timeline per person, foreground indicators, and a detailed list.
- Display all session intervals for the same person on a single-row daily timeline, drawing foreground intervals on top where intervals overlap. Do not impose a 100-session display limit.
- Hovering over an interval shows a shared tooltip with the session's observed time range, device and browser, interval time, foreground/background state, observation duration, project and file, and number of working agents. Do not merge adjacent intervals with the same state, because their file or agent information may differ. Display the tooltip inside the dialog and retain the detailed list.
- Clicking the active sessions button in the header opens the existing connections/history dialog. The total connection counts in the header and dialog use the same session unit. Follow the [Shared header UI](../../development/ui-contracts.md) for header height, color, hover, and focus.
- Display the number of working agents reported by each connected tab.
- Exclude idle agents and regular terminals, and display unreported or stale values as `—`.
- Removed JS memory display and collection from the work status view, and do not reintroduce them until the user requests it.
- Follow the [Collaboration guide](../../../../docs/guides/collaboration.md#active-mew-sessions) for reporting frequency and scope.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-19 square session icon: Passed 1 test each in `server/active-sessions-ui.test.ts` and `server/header-controls-ui.test.ts`, along with TypeScript and lint (existing warnings). Captures in light/dark themes on 1100px PC and 390px mobile confirmed the total session count and consistent size, color, and alignment of surrounding buttons. No build or server restart was performed.

- Previous profile display verification (2026-10-19): Passed 3 tests in `src/utils/active-session-people.test.ts` and 1 test in `server/active-sessions-ui.test.ts`. At that time, verified my profile image and fallback, deduplication of other accounts, exclusion of my account's multiple devices, guest aggregation, hiding **+ n** when there were 0 people or while connecting, and the existing connections/history dialog. TypeScript, lint (existing warnings), and documentation checks also passed. No build or server restart was performed.

- Automated verification: `presence-history.test.ts` (storage, recovery, filters, permissions, XLSX), `presence-sessions.test.ts` (actual WebSocket), `active-sessions-ui.test.ts` (themes, mobile, unified single-row timelines per person, overlapping foreground intervals, hover details/boundaries, filters, export, errors/empty states).
- User verification criteria:
  - Verify on mobile and desktop that the total session count appears inside a square outline matching the fullscreen icon's size, and that multiple devices and tabs for the same account, as well as guests, are each counted separately.
  - Verify that it displays 1 when the list is unavailable and 0 when the list is actually empty, and provides **99+** with an accessible name and tooltip containing the actual count when the count is 100 or more.
  - Verify that date, person, and time filters match the scope of downloaded results and that history persists after a server restart.
  - Verify that connections and disconnections across multiple devices are reflected and that restricted paths are not exposed to other users.

<!-- mew:validation:end -->
