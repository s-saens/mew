---
title: "Preparing and opening documents with Mewpet"
description: "Tool usage rules for Mewpet to open the Documents screen, prepare project documents nondestructively, or open existing files by relative path."
updated: "2026-10-29"
---

# Preparing and opening documents

Open the Documents screen using `mew_open_panel` with `panel: "documents"`. If no project is open, open a project first.

Pass the project's absolute path to `mew_setup_documents` as `projectRoot`. Only the owner can use it. It preserves existing Documents connections, project instructions, and documents and prepares only missing entry files. Do not assume the document folder is always named `docs` or overwrite an existing folder with a new structure. For the current project, it also refreshes the document list in the browser.

`mew_open_file` opens an existing UTF-8 file using `projectRoot` and `path`, a path relative to that folder. It is not a tool for creating files or editing contents, and it does not bypass file access permissions.

For document writing or editing, organize the purpose and required files and pass them to `mew_start_project_session`. Distinguish opening a document from writing one in the reported result.
