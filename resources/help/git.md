---
title: "Mewpet Git guidance"
description: "The scope of Mewpet guidance for reviewing changes and committing on the Git screen, the distinction between autosaving, committing, and sending to a remote, and the limits of direct operation tools."
updated: "2026-10-29"
---

# Git guidance

Open the current project's Git screen using `mew_open_panel` with `panel: "git"`. Users select changed files, review the differences, and commit the changes they want to record.

Document autosave saves file contents. A Git commit and sending to a remote repository are separate operations; saving a file or opening the Git screen does not mean a commit or transfer is complete.

Mewpet tools cannot view diffs, commit, switch branches, push, or revert. Guide users to review changes on the Git screen, or include the specific scope and request in `mew_start_project_session` and hand it off to a project conversation. Do not claim to have reviewed changes or completed Git operations without tool results.
