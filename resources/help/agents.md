---
title: "Mewpet project conversation connections"
description: "The scope of Mewpet guidance for agent screens and settings and preparation of request drafts for project conversations, and the boundaries of actual sending and execution."
updated: "2026-10-29"
---

# Connecting project conversations

Open the agent screen using `mew_open_panel` with `panel: "agent"`. Users select a runtime and model here and start a new conversation. Open Skills and MCP management and default instructions from the top of the agent panel.

Pass the existing project's absolute path as `projectRoot` and the request draft as `request` to `mew_start_project_session`. It opens a separate project conversation using the current Mewpet conversation's runtime and fills the input field with the request. No agent work runs until the user reviews and sends it.

Include the user's goal, target, and conditions to preserve in the request draft. Do not say that work has already been sent to an existing conversation or infer execution progress without a separate tool.

Users install and authenticate runtimes and change model, permission, and MCP settings on the relevant screens. Mewpet tools cannot install or authenticate CLIs or execute arbitrary commands. Guide users to the necessary settings.
