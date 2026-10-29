---
title: "Removing the Previous Account During a Mewlink Merge"
description: "A decision to atomically delete a previous account with no remaining login methods when merging a Mewlink identity into an existing email account, and to revoke its sessions, Git credentials, and permissions. Defines preservation of work records and protections for other login methods and the last owner."
created: 2026-10-22
updated: 2026-10-22
---

# Removing the Previous Account During a Mewlink Merge

Status: Approved.

## Background

Linking a separately approved Mewlink user to an existing email account left the previous account behind, causing account management to display the same person twice. The user requested that the system delete the previous account during a merge.

## Decision

- Confirm the verified Mewlink identity and completed email and password login to the target account. Retain connection state comparisons, duplicate request handling, and issuance of new connection IDs.
- After moving the identity, delete the previous account in the same atomic save as the connection change if it has no password or other Mewlink identities remaining. Also revoke the previous account's saved sessions, trusted browsers, Git credentials, and feature and file permissions across all workspaces.
- Keep the previous account if it has other login methods remaining. Reject merges that would delete the last owner, and do not elevate the target account's role.
- Keep the target account's password, role, and settings. Preserve the previous account's project files, personal settings, and work records without automatically transferring them.
- In P2P, continue allowing only the merge request performing permission cleanup to complete, and revalidate other requests and connections. Rebind the merge request's response to the permissions in effect at completion as well.
- Do not infer ownership from display names and automatically delete orphaned accounts whose connection history is already gone. This change applies to merges performed afterward.

## Rationale and Impact

Supersedes the decision in [0007](0007-mewlink-self-service-linking.md) to retain previous accounts within the scope above. Avoids leaving duplicate accounts that cannot log in while protecting independently usable accounts and work records. [Remote Access](../development/remote-access.md#approved-mewlink-account-login) owns the implementation contract. Applying this requires the user to update locally.
