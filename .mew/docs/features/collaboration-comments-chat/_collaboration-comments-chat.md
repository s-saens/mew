---
id: "mew-collaboration"
parent: null
title: "Collaboration, Comments, and Chat"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "c467eec96fbbe77a22a73235dd9ca07e031e047903b5f5404f8107946648cb73"
files: []
commits: []
description: "A parent feature document grouping shared memo, real-time collaborative editing, comments, mentions, group chats, DMs, participants, and connection history. Provides subfeature scopes and links to detailed contracts and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Provide collaborative editing and conversations between people within file and account permissions.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Real-Time Collaborative Editing](real-time-collaborative-editing.md)
- [Shared Notes](shared-notes.md)
- [View Participants·Active Sessions](participants-and-active-sessions.md)
- [Comments·Replies·Member Mentions](comments-replies-and-member-mentions.md)
- [Group Chat·DM·Read Receipts](group-chat-direct-messages-and-read-status.md)

### Detailed contracts

- [Collaboration usage](../../../../docs/guides/collaboration.md)

<!-- mew:implementation:start -->
## Implementation details

- Groups the currently available child features into one work area.
- Each child feature links to the basis for its implementation and limitations.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review child feature boundaries and omissions.
  - Parent status does not automatically approve child statuses.

<!-- mew:validation:end -->
