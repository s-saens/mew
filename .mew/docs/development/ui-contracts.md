---
title: "Shared UI contract topics"
description: "Entry point for focused UI implementation contracts covering foundations, overlays, editors, workspace layout, project navigation, and recovery. Retains the former section anchors for existing links."
updated: "2026-11-03"
상위파일:
  - "../MOC.md"
  - "MOC.md"
---

[Installation and execution](../../../docs/guides/getting-started-ko.md)

Shared UI contracts are maintained in the references below. Feature documents own feature-specific requirements and public guides own usage instructions.

| Reference | Scope |
| --- | --- |
| [UI foundations, themes, and copy](ui-foundations.md) | Density, icons, themes, scrollbars, copy, and translations |
| [UI overlays, selection controls, and menus](ui-overlays.md) | Selection controls, popups, dialogs, layers, dismissal, and menus |
| [UI editor input, navigation, and shortcuts](ui-editor-input.md) | Mobile input, editor loading and navigation, selection, and shortcuts |
| [UI workspace panels, Dock, and gestures](ui-workspace-layout.md) | Safe areas, panels, Dock, tab motion, and mobile gestures |
| [UI project navigation and file browsing](ui-project-navigation.md) | Project and worktree switching, file exploration, and server paths |
| [UI installation, loading, and recovery feedback](ui-recovery-feedback.md) | Installation, loading, notifications, and recovery presentation |

The following headings preserve existing links; each points to its current contract.

## Device safe areas

See the [current contract](ui-workspace-layout.md#device-safe-areas).

## Installable web app and startup guidance

See the [current contract](ui-recovery-feedback.md#installable-web-app-and-startup-guidance).

## Shared loading indicators

See the [current contract](ui-recovery-feedback.md#shared-loading-indicators).

## Shared scrollbars

See the [current contract](ui-foundations.md#shared-scrollbars).

## Active tab auto-scrolling

See the [current contract](ui-workspace-layout.md#active-tab-auto-scrolling).

## Theme-colored outline shadows

See the [current contract](ui-foundations.md#theme-colored-outline-shadows).

## Popup borders

See the [current contract](ui-overlays.md#popup-borders).

## Mewlink stay-signed-in prompt

See the [current contract](ui-recovery-feedback.md#mewlink-stay-signed-in-prompt).

### Automatic recovery within panels and menus

See the [current contract](ui-recovery-feedback.md#automatic-recovery-within-panels-and-menus).

## Drag reordering motion

See the [current contract](ui-workspace-layout.md#drag-reordering-motion).

## Git diff editor tabs

See the [current contract](ui-workspace-layout.md#git-diff-editor-tabs).

## Design guidelines: spacing and information density

See the [current contract](ui-foundations.md#design-guidelines-spacing-and-information-density).

## Prefer icon buttons

See the [current contract](ui-foundations.md#prefer-icon-buttons).

## Popup coordinates inside modals

See the [current contract](ui-overlays.md#popup-coordinates-inside-modals).

## Dropdowns and selection components

See the [current contract](ui-overlays.md#dropdowns-and-selection-components).

### Text date input and custom calendar

See the [current contract](ui-overlays.md#text-date-input-and-custom-calendar).

## Mobile input focus

See the [current contract](ui-editor-input.md#mobile-input-focus).

### Mobile editor and keyboard

See the [current contract](ui-editor-input.md#mobile-editor-and-keyboard).

### Mobile auxiliary key bar

See the [current contract](ui-editor-input.md#mobile-auxiliary-key-bar).

## Theme Colors and Derived Accents

See the [current contract](ui-foundations.md#theme-colors-and-derived-accents).

## Editor Body Loading

See the [current contract](ui-editor-input.md#editor-body-loading).

## Editor Tab Visits and Document Navigation

See the [current contract](ui-editor-input.md#editor-tab-visits-and-document-navigation).

## Sticky Ancestor Rows in the File Explorer Tree

See the [current contract](ui-project-navigation.md#sticky-ancestor-rows-in-the-file-explorer-tree).

## Workspace Panel Layout

See the [current contract](ui-workspace-layout.md#workspace-panel-layout).

### Mobile Keyboard and Screen Zoom

See the [current contract](ui-workspace-layout.md#mobile-keyboard-and-screen-zoom).

### Desktop Layout Presets

See the [current contract](ui-workspace-layout.md#desktop-layout-presets).

## Git Repository Tabs

See the [current contract](ui-workspace-layout.md#git-repository-tabs).

## Dock and Top Menu

See the [current contract](ui-workspace-layout.md#dock-and-top-menu).

### Mobile Dock and Panel Switching

See the [current contract](ui-workspace-layout.md#mobile-dock-and-panel-switching).

## Overlapping windows and resize boundaries

See the [current contract](ui-workspace-layout.md#overlapping-windows-and-resize-boundaries).

## File explorer touch menus and moving items

See the [current contract](ui-project-navigation.md#file-explorer-touch-menus-and-moving-items).

## File explorer top create buttons

See the [current contract](ui-project-navigation.md#file-explorer-top-create-buttons).

## Editor status bar

See the [current contract](ui-editor-input.md#editor-status-bar).

## Text selection

See the [current contract](ui-editor-input.md#text-selection).

## UI copy

See the [current contract](ui-foundations.md#ui-copy).

## UI translation

See the [current contract](ui-foundations.md#ui-translation).

## Header notifications

See the [current contract](ui-recovery-feedback.md#header-notifications).

## Shared layer order

See the [current contract](ui-overlays.md#shared-layer-order).

## Settings window layer

See the [current contract](ui-overlays.md#settings-window-layer).

## Overlay dismissal rules (`useOverlayDismiss`)

See the [current contract](ui-overlays.md#overlay-dismissal-rules-useoverlaydismiss).

## Focus-based tab shortcuts

See the [current contract](ui-editor-input.md#focus-based-tab-shortcuts).

## Account management permissions table

See the [current contract](ui-overlays.md#account-management-permissions-table).

<a id="하위-프로젝트-탭-진입"></a>
## Subproject switching

See the [current contract](ui-project-navigation.md#subproject-switching).

<a id="루트-프로젝트-탭-그룹"></a>
## Header project switcher

See the [current contract](ui-project-navigation.md#header-project-switcher).

## Full-screen loading during session restoration and return

See the [current contract](ui-recovery-feedback.md#full-screen-loading-during-session-restoration-and-return).

## Shared editing state for Documents and regular files

See the [current contract](ui-editor-input.md#shared-editing-state-for-documents-and-regular-files).

## Fast root project switching

See the [current contract](ui-project-navigation.md#fast-root-project-switching).

## Switching worktrees within the same project

See the [current contract](ui-project-navigation.md#switching-worktrees-within-the-same-project).

## Shared UI for adding projects and browsing server files

See the [current contract](ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files).

### Confirming and creating missing project paths

See the [current contract](ui-project-navigation.md#confirming-and-creating-missing-project-paths).

### Saving and detecting file browsing favorites

See the [current contract](ui-project-navigation.md#saving-and-detecting-file-browsing-favorites).

### Shared action menus

See the [current contract](ui-overlays.md#shared-action-menus).

### Editor body context menu

See the [current contract](ui-editor-input.md#editor-body-context-menu).

### Header hamburger menu

See the [current contract](ui-overlays.md#header-hamburger-menu).

### Agent and terminal tab context menu

See the [current contract](ui-overlays.md#agent-and-terminal-tab-context-menu).

### File action context menu

See the [current contract](ui-overlays.md#file-action-context-menu).

## Debugger settings and dock access

See the [current contract](ui-workspace-layout.md#debugger-settings-and-dock-access).

## Search within the file explorer

See the [current contract](ui-project-navigation.md#search-within-the-file-explorer).
