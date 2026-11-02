---
title: "Documentation and code quality guidance: implementation and verification"
description: "Records the original seven documentation presets and the addition of focused document structure and clean-code guidance, with source-preserving defaults, settings verification, and server application boundaries."
created: "2026-10-26"
updated: "2026-11-02"
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

## 2026-11-02: Focused documentation and clean-code defaults

Add `documentStructure` to the Documentation group and `codeQuality` to General in the account's Default Instructions. Both default to **Apply default guidance** and can independently defer to project instructions. The [usage guide](../../../docs/guides/project-setup.md#documentation-guidance), [session contract](../development/agent-sessions.md#passing-project-context), and [ADR 0117](../decisions/0117-focused-documentation-and-clean-code-guidance.md) own their current controls, behavior, and rationale. The earlier sections above retain the original implementation record.

Document structure guidance asks for focused topic/reader files, canonical sources, links, and accurate filenames and descriptions for selective reading. It keeps description-first discovery and does not introduce MOC navigation or registration. Code quality guidance asks for single responsibility, cohesive modules and components, clear interfaces and dependencies, readable control flow, explicit error handling, and reuse of established abstractions. Both split files when retrieval, understanding, testing, or maintenance improves, without arbitrary line limits or excessive fragmentation. Existing test-writing guidance is unchanged.

The new keys supplement missing sections in existing MD, TXT, and empty sources only when reading context. Stored files, revisions, existing writing presets, project selections, custom wording, and damaged markers retain their established preservation behavior. Settings reuse the existing immediate save and revision checks. Existing project files are not automatically reorganized.

Local verification:

- `node --test server/agent-guidance.test.ts server/agent-context.test.ts server/agent-account-settings.test.ts server/agent-build-verification.test.ts server/agent-capacity-retry-settings.test.ts`: 44 passed. Covered defaults, existing MD/TXT and empty sources, revisions, project and account isolation, and preservation of prior writing, project selections, custom text, and damaged sections.
- `node --test server/agent-guidance-ui.test.ts server/agent-build-verification-ui.test.ts`: 2 passed. Isolated Chromium verified immediate selection saves, reopening, independent code and document choices, and existing conflict, focus, and build-setting behavior at 1100, 390, and 320px in light and dark themes. Desktop and mobile screenshots of both new controls were inspected; no physical device or live server was tested.
- `npm run build` passed TypeScript and production bundling, with the existing chunk-size warning. `npm run lint` passed with existing warnings; changed-file lint was clean. Documentation description and link checks and `git diff --check` passed.

Server-side behavior requires the user to apply the code and reopen older agent tabs; the build updates served UI assets without replacing a running server or supervisor. No deployment, launcher execution, or server lifecycle operation was performed.
