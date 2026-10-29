---
title: "Configurable Agent Git Branch Guidance"
description: "Initial decision defining the default GitHub Flow strategy, detailed GUI behavior, and preservation of existing work. Subsequent decision 0046 extends authorization for automatic handling, and 0054 extends in-repository worktree locations and guidance compatibility."
created: "2026-10-22"
updated: "2026-10-23"
---

## Status

Adopted.

The default location for new worktrees, exclusion from duplicate discovery, and guidance version compatibility follow [Follow-up Decision 0054](0054-internal-worktrees.md).

[Follow-up Decision 0046](0046-agent-git-automation.md) extends the automation scope and the commit, merge, remote, and cleanup permissions granted by that selection. The permission restrictions below remain the standard for the existing manual mode.

## Background

The existing default guidance specified when to commit but did not explain how to separate work into branches. As a result, changes could continue accumulating on the default branch. Mew handles personal and collaborative projects as well as local repositories without GitHub connections, so it cannot impose one deployment method or remote service on all projects.

## Decision

Add a Git branching strategy and detailed settings to per-account default guidance. The default uses short-lived work branches in the GitHub Flow family; users can select Git Flow, trunk-based development, or following project instructions. The GUI lets users adjust the default and development branches, prefixes, worktree use, approved merge methods, and cleanup preferences after integration. Apply the strategy and detailed values together in a single save operation. The [Feature Contract](../features/projects-files-search/project-documentation-guidance-and-initialization.md) and [User Guide](../../../docs/guides/project-setup.md#git-branch-guidance) own the specific choices and behavior.

These settings are instructions passed to the agent with each ACP request. Mew does not automatically switch repositories or install remote protection rules. Permissions to commit, push, create PRs, merge, and delete follow existing user requests, project instructions, and commit settings. Merge method and cleanup settings do not add permissions either.

If existing guidance lacks a branch section, supplement it with default guidance only when reading it. Do not overwrite the original text, and preserve manually edited sections. Instruct the agent to check the repository, existing branches, uncommitted changes, and staging state before work, and to reuse a relevant work branch. Recommend worktrees for shared checkouts or risks of conflicting changes, while preserving the boundary that existing uncommitted changes are not automatically transferred to a new worktree.

## Rationale

| Strategy | Applicability Conditions in Official Sources | Mew's Choice |
| --- | --- | --- |
| GitHub Flow | Separate work into short-lived, descriptively named branches and integrate it into the default branch after review. Use separate branches for unrelated changes. | Adopted as the default because it meets the need to separate work from the default branch without always requiring separate development and release branches. Remote pushes and PR operations follow existing permissions. |
| Git Flow | Maintain development and production branches, distinguishing releases from hotfixes. The author recommends a simpler flow for continuous delivery and Git Flow for explicit versioning and support for multiple production versions. | Offered as an option for projects managing multiple versions and planned releases. |
| Trunk-based | Integrate small changes quickly using short-lived work branches, prompt reviews, and CI. | Select explicitly to match the project's verification and integration setup. |

The comparison above is based on reviewing the [official GitHub Flow guide](https://docs.github.com/en/get-started/using-github/github-flow), [the original Git Flow author's article and 2020 retrospective](https://nvie.com/posts/a-successful-git-branching-model/), and [Trunk Based Development's short-lived work branch guide](https://trunkbaseddevelopment.com/short-lived-feature-branches/) on 2026-10-22. The default is a project judgment based on these sources and the scope of Mew's local and agent work.

## Impact

Existing accounts using default guidance also receive branch separation guidance starting with the next request, while existing MD and project instructions remain intact. Select Follow project instructions when the project's own rules must take priority. Using the name GitHub Flow does not require a GitHub connection or remote operations. Work using a separate worktree must check that folder and the required runtime environment; creating a branch alone does not isolate changes in the existing shared folder.
