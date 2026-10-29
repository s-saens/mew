---
title: "Documentation default guidance settings: implementation and verification"
description: "Records 7 documentation default guidance options, nondestructive migration of existing accounts, settings dialog and API verification results, and the status before application to production."
created: "2026-10-26"
updated: "2026-10-26"
---

Implementation record for 2026-10-26. The current specification follows the [default guidance usage guide](../../../docs/guides/project-setup.md#documentation-guidance) and [session contract](../development/agent-sessions.md), and the rationale follows [Decision 0073](../decisions/0073-documentation-guidance-options.md).

## Purpose and implementation

Enabled canonical document updates, ADRs, work and verification records, writing style, descriptions, links, and document checks to each be applied as shared default guidance or left to project guidance. New accounts use a template that includes the settings section; existing accounts receive missing defaults only on request.

Fixed document update wording that exactly matches the previous default template is replaced with configurable guidance when delivered. Saved files, manually edited wording, settings sections, and code examples are preserved. The UI reuses the existing settings dialog and SelectField and groups the options in a collapsed documentation group.

## Verification

- `node --test server/agent-guidance.test.ts server/agent-guidance-ui.test.ts server/agent-account-settings.test.ts server/agent-context.test.ts`: 31 passed. Verified defaults, individual selections, revision, account isolation, preservation of existing, corrupted, and manually edited guidance, and application of requests.
- `node --test server/agent-guidance.test.ts`: 24 passed. Also verified migration on read for empty saved files, CRLF, and previous metadata wording.
- `node --test server/agent-guidance-ui.test.ts`: passed. Verified changes and retrieval for 7 options, replacement of manually edited entries, screen boundaries for dark and light dropdowns, and existing focus and conflict handling on a 1100px desktop screen and 390 and 320px touch screens. Used isolated browser fixtures without an app bundle or server.
- `npx tsc -b` and scoped oxlint on the changed TypeScript and TSX files passed.
- All 483 description checks passed. The 4 changed documents have 0 local link errors. The full `npm run check:docs` check failed with 17 existing link errors caused by document moves and deletions outside this work.

## Production application and limitations

No app build, deployment, or server startup or restart was performed. The user will apply the changes to production. The guidance instructs agents; it is not an execution gate that enforces document writing or checks. Existing project rules and previously generated project documents were not changed.
