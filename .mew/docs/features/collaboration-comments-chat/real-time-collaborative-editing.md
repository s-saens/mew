---
id: "mew-collaboration-editing"
parent: "mew-collaboration"
title: "Real-time collaborative editing"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-29"
status_hash: "81a72649dbeb8cd93209d368fdf5395c34899f4c259ba1ccce2b9ccdbd5eb7b4"
files: ["server/collab.ts", "src/components/EditorPane.tsx", "src/hooks/usePresence.ts"]
commits: []
description: "A feature contract covering collaborative editing state and participant cursor synchronization for logged-in users editing the same file. It explains the combined checks for collaborative editing and file permissions, and the separate path for guest body editing."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- Multiple logged-in users edit the same file together.

### Scope

- Synchronize collaborative editing state and participant cursors.

### Boundaries and limitations

- Check both collaborative editing feature permission and permissions for the target file.
- Permitted body editing by a guest follows a different path from collaborative editing by logged-in users.

### Detailed contracts

- [Collaboration guide](../../../../docs/guides/collaboration.md) · [Collaboration room contract](../../development/collaboration.md)

<!-- mew:implementation:start -->
## Implementation details

- Synchronize collaborative editing state and participant cursors.
- If the connection or initial document response stalls, automatically reconnect after a timeout and preserve unsent edits so the screen does not remain blank indefinitely. Follow the [Collaboration room contract](../../development/collaboration.md#collaboration-rooms-yjs-relay) for timing and retries.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-09-29: Added regression checks to `server/collab-reconnect-ui.test.ts` that reproduce stalled socket connections and initial synchronization, and late responses from previous sockets. Whether these share the same cause as the intermittent delays in actual users' browsers has not yet been confirmed.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that changes and cursors are transmitted between two logged-in sessions and that sessions do not remain in the wrong room after switching files or revoking permissions.

<!-- mew:validation:end -->
