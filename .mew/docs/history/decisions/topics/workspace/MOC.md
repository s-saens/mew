---
title: "Mew ADR — Projects, Documents, and Git"
created: 2026-09-11
updated: 2026-10-07
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0202 — Per-account agent settings](../../0202-mew-account-agent-settings.md)

- [0200 — Per-account active project and request paths](../../0200-mew-account-active-workspace.md) — Changes the global root and switch notifications in 0086 and 0093

- [0198 — Inline feature title editing](../../0198-mew-inline-feature-title.md)

- [0196 — Feature filenames, document hierarchy, and a simplified panel](../../0196-mew-file-backed-feature-tree.md)

- [0191 — Parent and child documents and representative files in Documents](../../0191-mew-documents-parent-and-child-pages.md)

- [0190 — Top explorer toggle and document folder entry point](../../0190-mew-explorer-top-toggle-and-docs-entry.md)

- [0180 — Bottom Documents/Files toggle in the explorer](../../0180-mew-explorer-documents-files-toggle.md)

- [0179 — Git provider connections per Mew account](../../0179-mew-account-git-connections.md)

- [0177 — Project-owned shared icons](../../0177-mew-project-owned-icons.md)

- [0172 — GitHub CLI login in the Git panel](../../0172-mew-github-cli-login.md)

- [0171 — Default agent guidance settings and the Markdown canonical source](../../0171-mew-agent-guidance-settings.md)

- [0170 — Committing selected files in Git and the default composer](../../0170-mew-git-selected-files-and-composer.md)

- [0168 — Split Git changes and commit history](../../0168-mew-git-changes-history-split.md)

- [0165 — Shared agent guidance file](../../0165-mew-common-agent-guidance-file.md)

- [0166 — Dedicated tmux and ACP draft generation for Git AI Commit](../../0166-mew-git-ai-commit-drafts.md)
- [0174 — Mew commit skill and automatic commits per task](../../0174-mew-commit-skill-and-automatic-commits.md) — Changes AI draft boundaries in 0166 and 0170
- [0175 — Git history, changes, and input order](../../0175-mew-git-history-changes-composer-order.md) — Changes the default vertical layout in 0170

- [0160 — Open only the current project in the Git panel](../../0160-mew-git-current-project-only.md)
- [0158 — Open subprojects as project tabs](../../0158-mew-subprojects-open-root-tabs.md)
- [0155 — Automatic project context forwarding and documentation initialization](../../0155-mew-project-agent-context.md)

- [0151 — Nested subprojects](../../0151-mew-nested-subprojects.md) — Detect .mew at every depth and create via right-click

- [0135 — Git repository tabs and a shared work panel](../../0135-mew-git-workspace-panel.md)
- [0134 — Separate work panels and shared docking](../../0134-mew-dockable-workspace-panels.md)
- [0133 — Shared browser cache budget and automatic cleanup](../../0133-mew-browser-cache-budget-and-retention.md)

- [0115 — Open Git by selecting a repository from the header menu](../../0115-mew-git-menu-and-repository-picker.md)
- [0114 — Open the Git workbench as a sidebar popup](../../0114-mew-git-workbench-popup.md) — Graph, details, and diff hierarchy; panel lifecycle is covered by 0135
- [0113 — The project browser and Git workbench share the file tab model](../../0113-mew-project-browser-and-git-workbench-tab.md) — Project navigation and Git API boundaries; file tabs are removed in 0114
- [0094 — Workspace UI state belongs to the account](../../0094-mew-account-synced-workspace-ui-state.md) — Account UI ledger; unified panels and tree anchors are covered by 0119 and 0125
- [0086 — Switching root projects replaces the cache within the SPA](../../0086-mew-root-project-spa-handoff-and-cache.md)
- [0085 — The explorer displays root contents and subprojects separately](../../0085-mew-explorer-root-and-subproject-sections.md)
- [0083 — Explorer Documents and .mew subprojects](../../0083-mew-explorer-documents-and-mew-subprojects.md) — .mew marker; tree placement is in 0085, nesting detection in 0151
- [0081 — Root project tabs and Git subprojects](../../0081-mew-root-project-tabs-and-git-subprojects.md) — Root project boundaries; subsequent decisions apply to the tree, switching, and tab persistence
- [0080 — The server file explorer is a tool with shell permissions, separate from projects](../../0080-mew-server-file-explorer.md)
- [0068 — Open mobile project tabs in one action](../../0068-mew-mobile-project-tabs-open-directly.md)
- [0053 — Select the docs folder at the workspace root](../../0053-mew-docs-folder-chosen-in-workspace-root.md)
- [0042 — Home tab and runtime workspace switching](../../0042-mew-home-tab-and-workspace-switch.md) — Home widget foundation; subsequent decisions apply to the to-do ledger and pinned Home tab
- [0041 — docs is a special repository in the workspace](../../0041-mew-docs-as-workspace-special-repo.md) — Special docs identifier; subsequent decisions apply to location and header layout
- [0018 — Switch projects with tabs instead of URLs](../../0018-mew-project-tabs-replace-routes.md)
