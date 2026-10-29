---
title: "Provide the Test-Writing Requirement as a Shared Default Instruction Setting"
description: "Record the decision to make test writing required by default for behavior changes, allow each account to defer to project instructions, and define which existing instructions are preserved."
created: "2026-10-26"
updated: "2026-10-26"
---

Status: Adopted

## Background

Mew's shared default instructions did not require writing tests. Test writing should be required by default during development while remaining selectable per account like other instructions.

## Decision

Add a **Test Writing** setting to the shared default instructions. The default is **Required**, and the other option is **Follow Project Instructions**. It applies to behavior changes and bug fixes and excludes documentation-only work. Comply with execution restrictions and report reasons for checks that could not be run.

For existing accounts, supplement the default instructions on request without overwriting saved files. Preserve explicit selections and manually edited instructions. The [Agent Session Contract](../development/agent-sessions.md) owns the API and storage contracts, and [Default Instructions Usage](../../../docs/guides/project-setup.md#edit-the-shared-guidance-file) owns interactions and scope of application.

## Rationale and Impact

Apply the same default to all projects in an account while offering an option to defer to project requirements. These are instructions passed to the agent, not an enforcement gate that guarantees test execution. Mew's own project instructions contain no duplicate test-writing requirement, so there is no rule to remove. Keep repository test execution methods and server execution restrictions in project documentation.
