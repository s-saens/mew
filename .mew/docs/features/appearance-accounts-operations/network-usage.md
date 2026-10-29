---
id: "mew-network-usage"
parent: "mew-settings"
title: "Network usage"
status: "implemented"
created: "2026-10-07"
updated: "2026-10-14"
files: ["src/components/network-usage-panel.tsx", "src/utils/network-usage.ts", "src/utils/network-tracking.ts", "src/utils/desktop-connection.ts", "src/main.tsx", "src/App.tsx", "src/components/SystemStatsModal.tsx"]
commits: []
description: "Contract for displaying the current tab's cumulative uploads/downloads and per-second rates in the system resources popup, broken down into remote desktop, other, and total. Explains continued accumulation after closing the popup, reset on refresh, and the limitations of browser estimates."
---

## Requirements

- Remove the upload/download totals and speed button from the top bar and the separate network popup, and integrate them into the system resources popup.
- Show totals and per-second speeds below CPU, memory, and GPU and above the process list. Distinguish the upload and download columns with arrow icons.

## Detailed behavior

- Display separate upload and download totals since the current Mew tab was opened, with one decimal place and B, KB, MB, GB, or TB units. Use the same format for speeds, with `/s` appended.
- The system resources popup provides tables for cumulative usage and network speed. Each table has Remote Desktop, Other, and Total rows and Upload and Download columns. Refresh the network tables approximately every 1 second while the popup is open, and calculate speeds using the actual elapsed time between samples. When communication stops, speeds return to 0 and totals are preserved.
- Preserve totals when a remote connection ends or the user switches projects. The top display in a remote session shows per-connection values, while the system resources popup aggregates all remote sessions.
- Reset on refresh and do not combine traffic from other tabs, devices, or accounts. Indicate in the popup that the values are estimates for the current tab.
- Display the tables even at the default 0.0 B and 0.0 B/s, and support desktop, mobile, both themes, and all four languages. Follow the system resources popup behavior for closing, outside clicks, Esc, Back, and focus restoration. Display the network tables even while server resources are loading or their retrieval has failed.
- Include regular Mew HTTP traffic, WebSockets for collaboration, terminals, agents, and other features, and remote video and input. Exclude transport-layer headers and bytes the browser does not expose; values may differ from OS or carrier billing totals. Follow [Aggregation, deduplication, and limitations](../../development/network-usage.md).

## Implementation entry points

The shared tracker in `main.tsx` updates the store, and `NetworkUsagePanel` subscribes within the system resources popup. Closing the popup cleans up the speed sampling timer, but totals continue to accumulate. Reopening it displays current speeds starting with the first new sample. Remote connections add only increments from their per-connection totals to the same store. The network tables require no additional server requests, new permissions, or persistent data files.

## Verification criteria

- Regular traffic and remote connections appear in their respective rows, and the total upload/download volumes and speeds match the sums of all categories.
- Previous usage remains after multiple remote sessions are opened and closed, and the same sample is not counted twice. Speeds reflect actual elapsed time and current traffic even with delayed samples, idle periods, and resubscription.
- Upload, WebSocket, and ongoing SSE data update while normal response, input, and cancellation behavior is preserved.
- Verify that the tables in the system resources popup do not overflow on 320px mobile screens or desktop, and check language switching, keyboard operation, Back, and focus restoration.

2026-10-07: Passed 10 related unit and shared translation checks, 1 network popup scenario and 2 WebRTC viewer scenarios in isolated Chromium. Verified actual HTTP, WebSocket, and SSE traffic, cancellation, clone, deduplication, preservation of totals after closing the remote viewer, 320/390/1100px layouts, both themes, all four languages, Esc, and focus restoration, and reviewed desktop and mobile captures. Targeted lint, document description, and document boundary checks passed. The frontend type check initially passed, but the final recheck encountered type errors in Git UI changes outside this task, and the full type check failed due to errors in `server/remote-access-agent.ts` outside this task. No production build, server restart, or verification on actual remote devices was performed.
