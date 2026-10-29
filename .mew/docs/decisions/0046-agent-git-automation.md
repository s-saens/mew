---
title: "User-Selected Scope of Agent Git Automation"
description: "A decision defining Git operation permissions with automatic local merging as the default, preservation of existing settings, and cleanup boundaries. Follow-up 0054 extends worktree locations and v1 and v2 compatibility with v3."
created: "2026-10-22"
updated: "2026-10-23"
---

## Status

Adopted. Extends the manual branch and merge preferences in [Decision 0045](0045-agent-branch-guidance.md) with optional automation.

The default location for new worktrees and the current guidance format follow [Follow-up Decision 0054](0054-internal-worktrees.md). The v2 storage description below reflects the format at the time of this decision.

## Background

Always leaving merging to the user after separating work into branches requires the user to keep assessing Git state and follow-up work. Conversely, changing merge and push permissions for all accounts simply by adding a setting would fail to preserve existing choices. Users need to define what they entrust to AI and have it finish work within that scope.

## Decision

Group automation, commit behavior, branches, merging, and cleanup under **Git** in the agent's default guidance. The default is **Automate through local merge** and excludes remote updates. Users can select and save Use existing commit settings or Automate through remote updates. Apply the strategy, automation, and detailed settings together in one revision with **Save Git Settings**, effective starting with the next ACP request. As before, commit behavior in manual mode is saved immediately on selection. Actual choices and usage follow the [Project Settings Guide](../../../docs/guides/project-setup.md#git-branch-guidance); implementation and verification follow the [Owning Feature Contract](../features/projects-files-search/project-documentation-guidance-and-initialization.md).

Selecting automatic mode grants permission to prepare the work branches and worktrees needed for the user's implementation request, and to commit, verify, review, and integrate that work locally. Remote mode includes fetches from the designated upstream, normal pushes, or the existing PR workflow. Approval is not requested again at every Git step, but explicit user requests, project instructions, manually edited constraints, branch protections, and required reviews and CI remain in effect. Saving settings does not itself execute Git operations or merge all current work branches.

Omit the standard commit timing and push restriction sections only in actual requests using automatic mode. Preserve the original text and manual selections, and retain manually edited commit constraints. Disable the GUI's general commit selector in automatic mode and reuse its saved value when returning to manual mode.

For intact v1 sections without an automation scope, recognize selections by comparing them exactly against the previously generated text and apply the local merge default. Preserve the stored original text, strategy, and detailed values; replace the section with current guidance only in actual requests to avoid conflicting with earlier manual wording. Preserve manual and remote modes explicitly saved in v2. Use the v2 format when explicitly saving, and retain the preservation contract for manual edits, corruption, and revision conflicts.

Automatic mode with cleanup enabled also delegates cleanup of local branches and temporary worktrees confirmed to have been integrated for this task. Verify squash integration from actual changes, and do not delete uncommitted or unique changes or working folders used by running sessions. If checks fail or preserving existing work prevents safe integration, report the specific cause. Creating new remotes, publishing unrelated unpushed commits, force pushes, and rewriting shared history are outside the automation scope.

## Rationale and Impact

By default, delegate completion of local work to reduce the burden of Git decisions, while making remote publication a separate choice. Do not overwrite a scope the user has already explicitly selected with the default. This feature configures instructions and permission scope passed to AI; it is not a background service that runs Git commands on the user's behalf or a server-enforced blocking mechanism.
