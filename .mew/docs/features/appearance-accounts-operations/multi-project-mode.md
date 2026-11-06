---
title: "Multi-project mode"
description: "Planned optional desktop mode with independent compact project panels, a shared app header and background, and separate single-project layout restoration. Defines terminology, panel interactions, lifecycle, design defaults, and acceptance criteria; implementation has not started."
status: planned
created: "2026-11-06"
updated: "2026-11-06"
---

# Multi-project mode

Status: proposed design; implementation pending. This document owns the proposed behavior. [ADR 0152](../../decisions/0152-multi-project-workspace-sessions.md) explains the architecture, and the [implementation plan](../../work/multi-project-mode.md) defines the sequence and verification gates.

## Purpose and terminology

Desktop users can work in several projects at once. Each project occupies a compact workspace with the same tools and interaction structure as the mobile workspace. Different project panels can show different tools at the same time.

| Term | Meaning |
| --- | --- |
| Single-project mode (`싱글프로젝트모드`) | The existing desktop workspace and its tool docking layout. |
| Multi-project mode (`멀티프로젝트모드`) | An optional desktop layout containing several independent project panels. |
| Project panel (`프로젝트 패널`) | One project's header, current tool surface, and Dock within the multi-project workspace. |
| Project selection panel (`프로젝트 선택패널`) | The existing My/All project list used to choose, create, import, or manage projects. This replaces its former name, project panel. |
| Tool panel | The editor, agent, terminal, Git, tasks, or another tool inside a project workspace. |

Existing My Projects shortcuts and the set of open project panels serve different purposes. Opening or closing a project panel does not add or remove a personal shortcut unless the user invokes the existing import or shortcut action.

## Required behavior

### Modes and initial state

- The desktop Layout control offers both modes. Single-project mode remains the initial mode for existing installations; its saved layouts and presets remain valid.
- First entry into multi-project mode opens the current project as one narrow, full-height panel at the left. The remaining workspace shows the shared background, as in the supplied one-panel reference.
- Additional panels can occupy multiple columns and rows, as in the supplied multi-panel reference. The reference's repeated project and agent screens are examples of placement; real panels can show different projects and tools.
- The actual mobile viewport continues to show one mobile workspace. A narrow project panel on desktop uses compact presentation while retaining desktop mouse and keyboard behavior.
- Mode selection and each mode's layout are remembered separately for the account, Mew instance, and browser device. Changing modes must not overwrite the other mode's layout or the mobile layout.

### Shared and local controls

The app header owns resources, runtime controls where available, active sessions, Layout, fullscreen, and the hamburger menu. Render these controls once above the project board. Account settings, notifications, and Mewpet also have one app-level owner.

Each project panel contains its project icon/name, existing project command action when permitted, and an X button. The X closes that project panel. It is distinct from closing a tool or a document tab. Project-specific actions target that panel's working root.

Each panel has its own tool selection and Dock. For example, project A can show an agent while project B shows Git and project C shows a document. Changing tools or projects in one panel leaves the others' selections and work intact.

Use the existing themed panel surfaces and separators. Paint the page background or gradient once behind the board; individual panels must not restart the gradient. Preserve opaque popup surfaces, theme contrast, translated accessible names, and shared tooltips under the [UI foundations](../../development/ui-foundations.md) and [overlay rules](../../development/ui-overlays.md).

### Project selection, movement, and resizing

The project selection panel remains the owner of My/All browsing and project management. It receives an explicit destination: replace a named project panel, or open a new project panel. The board's compact plus action opens it in the latter mode; the plus inside the selector retains its existing create/import meaning.

Proposed title interaction: click the project name to choose that panel's project; drag the title area to move the panel. A movement threshold suppresses the click after dragging. Commands, X, and other interactive descendants never start a drag. This interpretation was requested for clarification during design and remains a default until answered.

Project panels support column and row arrangement, boundary resizing, and keyboard-accessible movement. Movement changes layout only. It does not reopen a project, reconnect an agent, or transfer document tabs to another project. Initial placement and minimum geometry follow the design defaults below.

### Closing, switching, and recovery

- Clicking or focusing a panel makes it the target of project-scoped shortcuts and global actions that operate on a project. Opening a global modal preserves that target until the action completes.
- Switching a panel prepares and validates the destination before replacing its session. Only the latest selection can complete the handoff. Failed selection retains the previous usable project and shows an error in the affected panel.
- A delayed save or mutation retains the project and working root captured when it began. Pending drafts and save failures remain recoverable. A project switch, panel close, or mode change cannot silently discard them.
- Closing a project panel removes its view and releases view subscriptions after the save boundary. Running agents and terminals follow their existing lifecycle; closing the panel does not issue a stop command or delete their shared tabs.
- Switching from multi to single displays the active project's session. Returning restores the board and each panel's tool selection. Mode changes preserve editor state and agent input; they must not restart running sessions.
- An unavailable or deleted project, lost permission, or failed lazy module affects the relevant panel. Retain a local recovery surface and the ability to choose another project or close the panel. Never silently substitute another root for a failed explicit scope.
- Account changes dispose the prior account's mounted views, subscriptions, and identity-sensitive caches. Preserve its saved board under its account key, following the storage contract. Existing file, feature, and role permissions remain authoritative.

## Design defaults

These defaults fill gaps in the visual references. They are implementation choices, not additional user requirements.

| Topic | Initial choice and reason |
| --- | --- |
| First panel width | Start near 400 CSS pixels, clamped to available width. Tune the exact width with the compact UI fixture. A sole panel does not expand across the whole screen. |
| Arrangement | Columns with adjustable widths; rows within each column divide its height by weights. This supports the reference's rows and columns without extending tool docking into a new general window manager. |
| Adding | Place a new panel in remaining horizontal space; otherwise add a row in the active column. Minimum dimensions take precedence over fitting every panel on screen; the board can scroll. |
| Duplicate project | In the first version, selecting an already-open logical project focuses its panel. Avoid two local writers for the existing account/project tab ledger. Independent views of the same logical project require a later view-state decision. |
| Worktrees | One logical project's panel can switch its working root using the existing worktree action. Its tab identity stays with the logical project. Simultaneous independent worktrees of the same logical project are outside the first version. |
| Empty board | Closing the last panel leaves the background and a compact add-project-panel action. It does not recreate a closed panel or replace the account's personal project list. |
| Shared tools | Notes, chat, and remote desktop retain their existing shared or app-level data ownership. Native Browser and login retain one account session and one app-owned viewer under the [browser contract](../../development/browser-desktop.md#permissions-profiles-and-lifecycle). Project Docks invoke that shared surface rather than mounting competing viewers. Localhost app tabs retain their separate proxy/viewer path. |
| Initial scope | Arrange project panels; reuse the current compact tools inside them. Cross-project document-tab dragging, floating project windows, and arbitrary nested project docking are outside this first version. |

## Acceptance criteria

1. Existing single-project layouts and presets restore unchanged; the desktop mode control can enter and leave multi-project mode.
2. First entry shows one compact panel at the left and unused shared background at the right. Restoring an intentionally empty board keeps it empty.
3. At least three different projects can show different tools concurrently. The 5-column, 2-row reference arrangement can be represented when the viewport supports usable panel sizes.
4. A header command, shortcut, file operation, or tool selection affects its intended panel. Pointer and keyboard focus route actions consistently; global dialogs retain normal Esc/Back and focus behavior.
5. Two projects containing the same relative filename can load, edit, autosave, upload, and display images without cross-project data or events. Root switches and worktree switches retain the same guarantee.
6. Reordering, resizing, project changes, and single/multi round trips preserve unsent agent text, editor changes, and live execution sessions. Closing a panel does not terminate its sessions.
7. Background gradients remain continuous; resources, notifications, active-session accounting, settings, and Mewpet are owned once per browser workspace.
8. Desktop compact panels work with mouse, touch, external keyboards, IME, and accessible labels. Actual mobile layout and its restoration remain independent.
9. Reload, remote reconnect, permission changes, project deletion, corrupt local layout data, and failed saves have explicit recovery paths. Local and Mewlink transports preserve the same project boundary.

Implementation evidence belongs in the [work record](../../work/multi-project-mode.md). These criteria are requirements, not claims of passing checks.
