---
title: "Repository maintenance"
description: "Procedures for transferring GitHub ownership, replacing Git history, and external backup and recovery for the Mew repository. A maintainer runbook distinct from moving a regular installation folder."
updated: "2026-10-29"
---

## Transferring GitHub ownership

Installation/release code and current documentation target `s-saens/mew`. The actual GitHub Transfer and changes to each installation's remote configuration must be applied separately. If only the GitHub owner is changing, local folders, workspaces, account data, and Mewlink registrations do not need to be moved. The npm package name remains `@liiiiv/mew-cli`.

1. Record existing collaborator permissions and issue assignees/types. Verify that `s-saens` has neither a repository named `mew` nor a repository in the same fork network, then specify `s-saens` as the new owner under **Settings → General → Danger Zone → Transfer** in `liiiiv-life/mew`. Administrator permissions are required; existing history, issues, PRs, and releases are retained.
2. After the transfer, run the following commands in existing clones on all development PCs and deployment servers. Worktrees sharing the same Git repository also share remote configuration, so it only needs to be changed once.

   ```bash
   git remote set-url origin https://github.com/s-saens/mew.git
   git remote -v
   ```

   If using SSH, set the remote URL to `git@github.com:s-saens/mew.git`. The `git remote` commands above do not fetch, pull, build, or restart the server. `./mew update` runs `git pull --ff-only origin main`, and the app's update check fetches `main` from `origin`. Follow the [existing deployment procedure](../../../docs/deployment/native.md#4-updates-backups-and-failure-checks) to apply app updates.
3. Check collaborator access, branch protection, and Actions settings. Transferring from an organization to a personal account removes issue assignees other than the new owner and issue types, and read-only collaborators are not transferred. Repository secrets, webhooks, and deploy keys are retained, but separately check organization-provided permissions, secrets, and runners, as well as access to the new repository by external GitHub Apps and deployment services.
4. Check reviewers, allowed tags, and protection rules for the `cli-release` and `npm-publish` environments. When publishing to npm, register `s-saens` as the Trusted publisher's GitHub owner according to the [CLI release procedure](cli-release.md). Delete and recreate any existing configuration for the old owner.

The old Git URL redirects, but creating a new repository or fork at `liiiiv-life/mew` permanently deletes the redirect. Update clones and external connections so they do not depend on the old address. If GitHub Pages is used separately, site addresses do not redirect, so also check URLs and DNS. Repository transfer is separate from transferring ownership of a GitHub OAuth app. Perform a separate Transfer only when also separating app ownership.

Official references: [Transferring a GitHub repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), [Managing deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [Transferring a GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/transferring-ownership-of-an-oauth-app). The procedures in this document guide transfer preparation and do not indicate that GitHub settings have been applied or publishing has been completed.

## Starting fresh Git history

Under [Decision 0056](../decisions/0056-fresh-git-history.md), source folder and runtime data locations remain unchanged.

Perform this only when the user explicitly requests history replacement. Preserve the entire existing `.git` and staged/unstaged changes in a dated folder under `~/dev/mew-backups/`. Include any separate source, change rationale, and recovery materials stored inside `.git` in the backup; do not move or delete local accounts, sessions, preferences, or user files.

Create an initial commit with no parent from the currently tracked files and approved changes, then register the existing `origin` URL again. Do not bulk-add untracked or ignored files. Update only `main` using `--force-with-lease` with the remote `main` SHA checked immediately before replacement explicitly specified; if the remote has changed, stop and review again. Do not arbitrarily disable branch protection or delete other branches/tags. After pushing, verify the remote SHA, that the initial commit has no parent, the file snapshot, and the working state.

Use the externally preserved Git metadata and copies of changes for recovery. Other clones using the old history must be cloned again; replacing remote history does not erase historical data remaining in GitHub PR references, caches, or other clones.
