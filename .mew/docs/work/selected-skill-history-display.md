---
title: "Selected skill history display"
description: "Records the restored conversation fix for selected-skill prompt wrappers, local regression checks, and application limits."
created: "2026-11-13"
updated: "2026-11-13"
---

ACP history could replay the internal selected-skill instructions as part of a user question after a refresh. The server now extracts the request from a valid complete wrapper during ACP restoration. The browser uses the same parser for previously saved or cached events. The [conversation storage contract](../development/conversation-storage.md) defines the display boundary and preservation behavior.

Local verification: the agent fold and skill runtime tests passed (25 tests), and the ACP/WebSocket history regression passed. `npm run build` passed with the existing working tree, and `npm run lint` passed with warnings. `npm run check:docs` found no description errors but failed on 39 unrelated existing link errors. No server restart or deployment was performed. Physical browser refresh and split wrapper chunks were not verified; incomplete wrappers remain visible.
