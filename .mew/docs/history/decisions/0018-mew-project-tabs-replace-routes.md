---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: replace URL routes with tabs for switching mew projects. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0018 — Replace URL routes with tabs for switching mew projects"
created: 2026-07-28
updated: 2026-09-11
---

- Date: 2026-07-28
- Status: Adopted
- Follow-up decision: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — Project tab targets and entry points
- Follow-up decision: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — Browser-only tab storage
- Decision maker: Song Sanghoon (directive)

## Background

mew selected the project (a top-level workspace folder) using the first URL segment — `/` meant docs, and `/{프로젝트}` meant that folder. Switching assigned `location.href`, reloading the page. As a result:

- The entire app reloads whenever you switch projects. Open document tabs, the sidebar, and the terminal reconnect each time.
- Only one project exists on screen at a time. You had to open a popup to see which projects were available.
- The client held the target project as a module constant (`CURRENT_PROJECT`), so the architecture offered no way to change projects without reloading.

This round-trip cost kept getting in the way of actual usage across multiple projects (such as editing documentation and then checking code in a neighboring repo).

## Options

1. Keep routes + SPA navigation (history.pushState) — Pros: the URL represents state, making link sharing and back navigation natural. Cons: projects are still "one at a time." The meaning of back navigation conflicts with document tabs and the panel stack (`useOverlayDismiss` already uses Android's back action).
2. Remove routes and make projects tabs — all projects appear as tabs in the header row, and selecting one only changes app state.
3. A window per project (multiple windows) — rejected. Too much complexity for an internal tool, with no value on mobile.

## Decision

Adopt option 2.

- Remove the `/{프로젝트}` route. The URL is always `/`. When opening an old URL, start with that project, then normalize only the URL to `/` (to avoid breaking existing external links).
- The target project is runtime state. Replaced the `CURRENT_PROJECT` constant with `getProject()`/`setProject()`. Async tasks that outlive a switch (such as autosave debouncing) carry their own project as an argument rather than relying on this value.
- Tab state is maintained per project. Open document tabs, the active tab, scroll positions, and content caches are kept separately for each project and remain intact when you switch away and return.
- All visible projects appear as identically styled tabs. No special position (such as a far-left column) is reserved — initially, a large "boss tab" spanning two rows was added, then removed the same day. There is no reason to give one project special treatment, and a uniform tab row visually connects with the document tab row.
- Long-pressing (right-clicking) a project tab opens the existing grid popup (icons, positioning, creation, renaming, deletion). Since the dedicated popup button was removed from the header, this gesture is the only entry point.
- Each project has its own command button (▶) on its tab. `.mew/cmd-button.json` can now be added, edited, and deleted through the UI (previously, it required manual file editing).

## Rationale

- Authorization (permissions), rather than URLs, enforces project boundaries. The server accepts a `project` parameter on every request, validates paths, and applies guest approval rules ([ops/mew/access-model.md](../../../../docs/operations/access-model.md)). Routes were only a convenience, never a boundary, so removing them does not change the security exposure.
- URL sharing is indeed lost. mew is an internal editor behind a login boundary. There was no actual workflow of exchanging "links to this project," and document-level links (links within the editor) continue to work.
- It is better not to use back navigation for routing. On mobile, Android's back action already closes popups and panels one layer at a time. Adding routes gives the same gesture two meanings.

## Results

- The document tab storage key stays the same (`mew:open-tabs`, with a per-project suffix) — existing users do not lose their open tabs.
- New screen state keys: `mew:project` (active project) · `mew:tmux-open`.
- Project tabs have no close action. All visible projects always appear as tabs — unlike document tabs, which show only open documents, the project tab row serves as a map of the workspace. Folder deletion still uses the popup's existing deletion flow.
- The repo's `mew/README.md` is the canonical source for screen structure and storage key details — these are runtime-coupled contracts that change in the same commit as the code ([ADR 0012](0012-docs-repo-doc-allowlist-and-absorption.md)).
