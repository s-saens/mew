---
title: "Public file and folder capability links"
description: "Accepts revocable random capability links for anonymous file or folder viewing and existing-file editing, separate from guest path permissions, with scoped editors and Mewlink admission."
created: "2026-10-30"
updated: "2026-10-30"
---

## Status

Accepted. Implemented locally; host and central deployment remain user actions.

## Context

Guest path rules authorize all logged-out visitors to a workspace. They cannot provide a standalone document or folder URL with its own revocable identity. Mewlink also requires local login for ordinary work traffic, so a public document needs a narrowly scoped exception rather than broad guest access to the workspace.

## Decision

Issue a 32-byte random capability for an explicitly published file or directory. Use `/share/f/{id}` and `/share/d/{id}` on a direct origin, or append that path to a validated public Mewlink device address. Persist records in the host's private data directory, bound to the creator account identity and canonical workspace, project root, and target path. Existing guest path rules remain independent.

Only owners and managers with the required file permissions can publish. Public requests revalidate the record, creator role and permissions, and filesystem boundary. Disabling publication deletes the record. Re-enabling creates a fresh ID; changing viewing/editing preserves the active ID. Restrict editable links to existing text content, with revision checks. Reject private server data, secrets, denied path segments, symbolic links, and worktree internals.

Reuse the existing Markdown and source editors in a standalone public entrypoint. A file link exposes its document; a folder link adds a lazy explorer rooted at the publication. Keep uploads, comments, databases, terminal, agents, creation, deletion, and collaboration outside this capability. Resolve local media only within a published folder.

Mewlink admits only exact typed public HTTP endpoints before local login. Validated public requests retain a revalidation callback for anonymous connection lifetime. Every other work API and work WebSocket keeps its existing authentication boundary. Forward raw response security headers through the data channel.

## Alternatives and rationale

- Reuse guest rules: simpler storage, but grants path access to every logged-out visitor and cannot independently revoke an opaque URL.
- Mint a normal guest login session: reuses workspace routes but unnecessarily exposes navigation and increases the permission surface.
- Copy files into a separate static site: isolates delivery, but duplicates content and does not support editing the original file.

The capability API keeps publication explicit and constrained while reusing the application's editors and transport. JSON storage follows existing private data conventions without adding a database service.

## Consequences

Anyone holding a live link receives its selected access level. The host must stay online. Revocation blocks later requests; an already displayed page clears on its next metadata recheck. Previously downloaded content cannot be recalled. File links do not expose neighboring attachments; publishing a containing folder is necessary for local resources. Simultaneous edits use conflict detection rather than real-time collaboration.

Central Mewlink source lives in the excluded `mewlink/` directory and is applied separately from the host commit. Isolated tests do not establish public deployment or physical-device connectivity.

The current [feature contract](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md#public-file-and-folder-links), [access boundary](../development/access-control.md#public-capability-links), and [connection contract](../development/remote-access.md#public-file-and-folder-links) own operational details. See the [work record](../work/public-file-folder-links.md) for verification.
