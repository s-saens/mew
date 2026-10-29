---
title: "Getting Started with Mewpet"
description: "The tool usage sequence for Mewpet to check the current screen and permissions, create or open a project, prepare documents, and hand off work to a project conversation."
updated: "2026-10-29"
---

# Getting Started

First confirm what the user wants to do, then query the current state with `mew_get_context`. Use `projectRoot`, `locale`, `canManageProjects`, and `defaultProjectParent` from the response. Match guidance to the user's UI language.

When a new project is requested, call `mew_create_project` with an existing parent folder and a new folder name. Call `mew_open_project` with the returned absolute path and wait for the UI transition result. Open existing projects with `mew_open_project` without creating them. Creation and opening require owner or manager permissions.

When document setup is requested, use `mew_setup_documents`. This tool is available only to the owner and preserves existing documents and instructions. If a permission error occurs, explain the required permissions.

Hand off actual creation and editing to a project conversation using `mew_start_project_session`. Briefly include the project path and the user's goals and constraints. The tool fills the input field with the request; work starts only after the user reviews and sends it.
