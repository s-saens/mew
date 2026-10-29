---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Choose the docs folder from the workspace root (remove the fixed `.mew/docs` location). Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0053 — Choose the docs folder from the workspace root (remove the fixed `.mew/docs` location)"
created: 2026-08-14
updated: 2026-09-16
---

- Date: 2026-08-14
- Status: Adopted
- Subsequent decision: [0155](0155-mew-project-agent-context.md) — Per-project Documents settings take precedence
- Subsequent decision: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — Placement of the docs tab and folder selection UI in the fixed header; selected paths and identifiers are retained
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0041](0041-mew-docs-as-workspace-special-repo.md) fixed the location at `<워크스페이스>/.mew/docs` when it removed docs from projects. The rationale
was that "only product repos remain at the workspace's top level."

In use, the costs proved greater:

- docs is inside a dot folder and is normally invisible. It is the SSoT for the entire workspace, yet it appears nowhere in the file
  explorer, shell `ls` output, or editor sidebar.
- Each repo uses `../.mew/docs/...` links that go one level deeper
- Workspaces already using docs under a different name or in a different location cannot be opened in mew — with only one fixed
  path, there was no way to say "use that folder as docs."

## Decision

Choose a folder inside the workspace to use as the docs folder. The default is `docs` at the workspace root.

- `paths.ts` gains `DOCS_DIR` (a path relative to the workspace root), and `DOCS_ROOT` is derived from it. The fixed location
  under `.mew` is abolished — this replaces the "location is `<워크스페이스>/.mew/docs`" portion of ADR 0041.
- Selection uses the owner-only `POST /api/docs/root` — long-press or right-click the docs tab → "Change Folder." It must be inside the workspace
  and cannot be the workspace folder itself (that would make the docs tab represent the entire workspace).
- Write it to `MEW_DOCS` in `~/.config/mew/config.env` so it persists on the next run — the same approach as `MEW_WORKSPACE` (remove the same key remaining
  in the latter file).
- Without a setting, use `<워크스페이스>/docs`. If that does not exist and only the old `.mew/docs` exists, use that instead — this fallback lets installations from
  the ADR 0041 era open unchanged without any intervention.
- `MEW_DOCS` is used only in workspaces where that folder actually exists. This prevents a folder name from another workspace from carrying over
  and creating an unintended empty folder when switching workspaces — if it does not exist, revert to that workspace's default.
- The folder used as docs is excluded from the project list (`isValidProjectName` filters out both `'docs'` and that folder's name). It is also excluded
  from the top level of the home (`.workspace`) tree — the same folder must not appear twice in the tab bar.
- What remains unchanged: the internal identifier is still `docs`. Collaboration room keys, saved tabs, git, and `.data/` keys all operate
  on project names, so for the same reason as ADR 0041, leave the name untouched and redirect only the path.

## Rationale

- The workspace's SSoT should be visible when the workspace is opened. Putting it in a hidden folder signals "internal implementation"
  rather than "the one special thing."
- Fixing the location makes mew impose a folder structure. Allowing a choice lets existing workspaces open as they are —
  the same kind of flexibility as switching workspaces (ADR 0042).
- `.mew` remains — it holds per-project settings (`cmd-button.json`, `comments.json`, and `table-layout.json`). Only docs
  moves out.

## Results

- This ADR supersedes the location decision in ADR 0041. The rest (removal from projects, retaining the name `docs`, import/export, and the
  pinned tab) remains valid.
- Moving the actual `.mew/docs` in the workspace to `docs/` at the root is a separate task — moving it requires
  updating all `../.mew/docs/...` links in the repos, so do those together. Until then, the fallback opens the old location.
