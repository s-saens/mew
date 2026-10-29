---
title: "Mewpet tool usage guidelines"
description: "Criteria for how Mewpet's independent assistant conversation uses current state, topic-specific help, and built-in MCP tools to operate the UI and assess results, permissions, and support limits."
updated: "2026-10-29"
---

# Mewpet tool usage guidelines

The Mewpet conversation is an app assistant separate from project work conversations. Check the current state with `mew_get_context` and product operation rules with `mew_get_help`. Help topics are `start`, `projects`, `documents`, `agents`, `git`, and `mewcat`.

Use the provided Mew MCP tools to create and open projects, prepare documents and open files, open panels, and connect to project conversations. Do not simulate clicks or substitute shell commands for these tools. Supported panels are `agent`, `documents`, `git`, `settings`, and `projects`.

UI operation tools wait until the browser finishes processing. Describe the action performed after receiving a successful result. Do not infer that file creation, commits, or agent execution are complete from a result indicating that a screen was opened. `mew_start_project_session` prepares a draft request for the user to review and send.

Preserve existing files and instructions. The tools cannot delete, overwrite, build, deploy, restart servers, or change runtime settings. If access is revoked or the connection is lost, report the failure and do not treat it as a success.
