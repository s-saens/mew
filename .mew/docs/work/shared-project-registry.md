---
title: "Shared projects and name-first creation"
description: "Records the 2026-11-02 implementation of the shared YAML project catalog, per-account My Projects, name-only managed creation, existing-folder linking, first-use onboarding, and agent-assisted discovery. Records 44 passing focused checks, successful type/build/lint/documentation verification, and a separate existing demo transport failure; distinguishes local checks from user-owned runtime application and provider behavior."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and resulting behavior

Replace path-first project addition with creation by name and an explicit existing-folder linking branch. Keep the instance's available projects separate from each user's ordered shortcuts. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md) owns the resulting behavior, [architecture](../development/architecture.md#shared-project-registry-and-my-projects) owns storage/API and migration, and [ADR 0118](../decisions/0118-shared-project-registry.md) owns the decision.

- Managed creation uses `~/.mew/projects/<name>`, creates `.mew/docs/` inside `.mew/` as the initial Documents location, and defaults Git initialization on. Existing directories are not overwritten.
- `DATA_DIR/projects.yaml` stores the shared catalog and each account's My Projects. Creating or linking registers and pins for the creator; other signed-in accounts can pin the same project independently. Legacy account lists migrate without moving folders or deleting their JSON source.
- The Add Project dialog offers New Project, All Projects, and explicit linking. A new account starts with project onboarding rather than the implicit startup folder. Desktop/mobile selection retains personal ordering, restoration, and shortcut behavior.
- Agent-assisted creation embeds the ordinary AgentPanel and sends one initial discovery prompt for the requested new tab. Runtime selection, permissions, transcripts, recovery, and later use of the conversation remain normal agent behavior.
- Members gain shared discovery, managed creation, linking, registered-root selection, and shared icon access for registered roots. Existing file/feature rules, arbitrary server writes/Git operations, and subproject/worktree checks remain separate.
- Opening an All Projects row changes the active project without adding a shortcut. Add to My Projects remains explicit. Duplicate names have a path detail for disambiguation.
- A missing saved active root falls back to the first existing My Projects directory. If none exists, onboarding is shown while catalog entries and personal shortcuts remain stored. The demo implements the same catalog API in memory with managed folders beneath its virtual workspace.

## Local verification

Final focused runs passed **44 tests**:

| Scope | Result |
| --- | --- |
| Registry service, project/access APIs, account roots, icons, managed-path boundaries, and demo project behavior | 28 passed |
| Actual App project switching and restoration (`server/workspace-switch-ui.test.ts`) | 9 passed |
| Linked-folder dialogs, project switcher/sidebar, new project catalog, and assisted creation UI | 7 passed |

The checks cover legacy migration, shared catalog and independent personal shortcuts, managed name and Git choices, collision and path rejection, canonical linking, guest and member boundaries, missing active roots, registered-root icons, and managed files beneath an explicit ancestor data directory. Browser fixtures cover fresh onboarding, explicit pinning versus opening, duplicate names, creation/open retries, existing folder browsing, ordering, keyboard and touch selection, rapid switching, worktree preservation, and the one-time agent interview prompt with conversation restoration. The new catalog was checked on desktop/mobile in both light and dark themes; the assisted conversation uses the actual AgentPanel with mocked runtime transport and checks that stale prepared tabs do not replace it. Browser captures were reviewed after the duplicate-name text contrast correction.

- `npx tsc -b` and the required `npm run build` passed. Vite reported its existing large-chunk warning; the build completed successfully.
- `npm run lint` passed with warnings and zero errors.
- `npm run check:docs` passed: 644 descriptions, zero metadata errors, and zero link errors. The earlier missing runtime-recovery record belonged to a concurrent change and was resolved before this final check.
- `git diff --check` passed.

A separate broader demo transport run reproduced the existing Mewpet manifest width assertion failure in `src/demo/transport.test.ts`; it is outside the passing focused project runs above. No full-suite success is claimed.

## Application and remaining limits

No deployment, launcher invocation, or server start, stop, or restart was performed. The required build changes local `dist/` assets but does not reload server-side code. The user must apply server changes through their normal operation workflow.

Actual provider authentication and project-generation quality, physical-device interaction, and total production switching latency require separate validation. Discovery and documentation are requested through normal prompts; they are not enforced provider outcomes. Project registration is shared, while personal shortcuts provide convenience rather than private file ownership.
