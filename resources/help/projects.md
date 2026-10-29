---
title: "Project Operations in Mewpet"
description: "Project list entry points and rules for path inputs, permissions, and checking UI transition results for Mewpet's project creation and opening tools."
updated: "2026-10-29"
---

# Project Operations

Open the project list using `panel: "projects"` in `mew_open_panel`. On desktop, open the project sidebar with `Alt+P`; on mobile, tap the current project in the header to open the list.

In `mew_create_project`, `parent` is the absolute path of an existing parent folder, and `name` is the new folder name. Existing folders are not overwritten, and `path` in the creation result does not mean the project is already open in the UI.

Pass the absolute path of an existing folder to `mew_open_project`. Success is returned only after the browser finishes switching projects. Project creation and opening are available to the owner and managers with project management permissions. Check current permissions using `canManageProjects` in `mew_get_context`.

Do not describe a failed request as successful or delete and recreate a folder with the same name. If the path is unclear, confirm which folder the user wants to open.
