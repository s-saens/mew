---
title: "Mew feature documentation organization plan"
created: 2026-09-18
updated: 2026-10-06
description: "Records the plan, ownership, migration mappings, and validation for organizing Mew features under stable IDs and a hierarchy in Documents/features and consolidating existing specifications."
상위파일: "_work.md"
---

Request: Organize Mew's own features in stages so they can be browsed, edited, and reassigned in the feature GUI. The storage contract follows [feature-based development](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md), and document ownership follows the [common rules](../README.md).

## Scope and ownership

- Store per-feature Markdown files with stable IDs and parent IDs in `mew/docs/features/`, the Mew project's Documents. Do not mix Mew features into the workspace-wide `.mew/docs/features/`.
- Feature documents own product-feature work units, scope, related implementation entry points, and review criteria. They link to existing usage, configuration, and development contract details without duplicating them.
- Existing feature-specific specifications may be consolidated into feature documents after reviewing their content and incoming links. Detailed contracts that are difficult to move safely remain in their original owning locations and are linked from the features.
- Operations, deployment, security, central ADRs, past plans, and history remain in their original locations. Do not build, deploy, execute features, change the server ledger, or automatically commit.
- Implementation status is based on current documentation and code. `implemented` catalogs the current implementation and does not mean physical-device or live-service validation or user approval (`verified`). Limitations and unsupported scope are stated in each feature. Leave related commits empty unless their supporting evidence is individually verified.

## Stages

- [x] 1. Check the current README, domain-specific documentation maps, feature storage format, and working tree
- [x] 2. Organize project, editing, Git, and collaboration features
- [x] 3. Organize agent, remote tool, database, and settings features
- [x] 4. Organize links to existing specifications, README/MOC navigation paths, and write-back guidance
- [x] 5. Check the actual feature parser, related files, documentation links, and documentation placement

## Sources and targets

| Current canonical source | Role | Feature group | Handling |
| --- | --- | --- | --- |
| README feature guide, guides/projects, configuration/search | Entry points, usage, and search contracts | Projects, files, and search | Define features as work units; link to sources for details |
| guides/editor, development/pdf-viewer | Editing usage and PDF implementation contract | Editing | Link per-feature scope and related files |
| Git in guides/projects, file history in guides/editor | Repository and file operation contracts | Git | Distinguish different commit scopes |
| guides/collaboration, development/collaboration | Collaboration usage and room/storage contracts | Collaboration | Link sharing scope and permissions |
| guides/terminal-agents, configuration/agent-runtimes·agent-harness, specs | Execution, configuration, and feature specifications | Terminals, agents, and automation | Link per-feature specifications and execution boundaries |
| guides/browser·remote-desktop, development/remote-desktop | Remote tools and supported environments | Browsers and remote tools | Register only the currently available scope |
| guides/database | DB usage and connections | Databases | Distinguish document DBs from external references |
| configuration/environment, development/access-control, specs/mewcat, deployment/native | Personal settings, permissions, and operations | Settings, accounts, and operations | Separate user features from operational procedures |

## Completion criteria

Every feature must be reachable from the MOC and readable by the GUI parser. There must be no duplicate IDs, missing parents, cycles, invalid hashes, missing related files, or broken links. Current features in the existing README are tracked through feature documents or explicit exclusions. Do not fabricate user judgments or execution history.

## Organization results and decisions

Registered 8 parent features and 44 child features in the [feature map](../features/_features.md). Existing `specs/` mixed detailed UI, execution, and storage contracts, so it was not moved wholesale. Feature documents own only the work units to delegate and their scope, and link to the detailed content of existing specifications. Added links from each source back to its corresponding feature.

Also updated three outdated descriptions found by comparing them with the current source: the explorer description for expanding subprojects, the description of opening subproject commands from a parent tab, and the old header-icon entry point in the DB list. Source code, runtime state, and the server feature ledger were not changed. Uncommitted changes from the previous inline request UI work were preserved.

## README feature mapping

Mapped the 69 rows in the current README feature guide and the skill and MCP guidance outside the table to the work units below. Actual installation, server configuration, and backup procedures follow the existing operational documentation.

| README item | Feature document |
| --- | --- |
| Project tabs / Cloud folder shortcuts / New project and Git clone | [Open projects, tabs, and groups](../features/projects-files-search/opening-projects-tabs-and-groups.md) |
| Documents, subprojects, and MOC | [Subproject tabs](../features/projects-files-search/subproject-tabs.md) |
| Agent documentation guidance and project initialization | [Project documentation guidance and initialization](../features/projects-files-search/project-documentation-guidance-and-initialization.md) |
| Documents management | [Documents and document map management](../features/projects-files-search/documents-and-document-map-management.md) |
| File and folder management / Server-wide file browsing / Hidden list | [File and folder browsing and operations](../features/projects-files-search/file-folder-exploration-and-operations.md) |
| Filename search / Content search and bulk replacement | [Filename and content search and replacement](../features/projects-files-search/filename-content-search-and-replacement.md) |
| Local semantic search (RAG) | [RAG feature at the time — removed 2026-09-28](../history/rag-feature.md) |
| Markdown Hotview·Plain / Document properties and table of contents / List indentation | [Markdown Hotview, source text, and document properties](../features/document-code-media-editing/markdown-hotview-source-and-properties.md) |
| Code and text editing | [Code and text editing and in-document search](../features/document-code-media-editing/code-text-editing-and-document-search.md) |
| Links and file references / Attachments and images / Passing selection locations | [Links, file references, and attachments](../features/document-code-media-editing/links-file-references-and-attachments.md) |
| Markdown tables | [Markdown table editing and copying](../features/document-code-media-editing/markdown-table-editing-and-copying.md) |
| Footnotes and bibliography | [Footnotes and bibliography](../features/document-code-media-editing/footnotes-and-references.md) |
| Media and sheet viewing | [Media and sheet previews](../features/document-code-media-editing/media-and-spreadsheet-previews.md) |
| PDF reading and annotation | [PDF reading, annotation, and saving](../features/document-code-media-editing/pdf-reading-annotation-and-saving.md) |
| Autosave and undo | [Autosave and undo](../features/document-code-media-editing/autosave-and-undo.md) |
| Document tabs and split editing / Panel layout and state restoration / Mobile, fullscreen, and quick actions | [Panel layout, mobile, and state restoration](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md) |
| Current file commits and history restoration | [Current file commits and history restoration](../features/git-history/current-file-commits-and-history-restoration.md) |
| Repository browsing, graph, and diff / Commit the entire working tree / Branch, tag, and past commit operations / Project Git panel | [Current project Git operations panel](../features/git-history/project-git-work-panel.md) |
| Real-time collaborative editing and participants | [Real-time collaborative editing](../features/collaboration-comments-chat/real-time-collaborative-editing.md) |
| Active mew sessions | [View participants and active sessions](../features/collaboration-comments-chat/participants-and-active-sessions.md) |
| Comments, replies, and member mentions | [Comments, replies, and member mentions](../features/collaboration-comments-chat/comments-replies-and-member-mentions.md) |
| Group chat, DMs, and read receipts | [Group chat, DMs, and read receipts](../features/collaboration-comments-chat/group-chat-direct-messages-and-read-status.md) |
| Guest viewing and editing access / My account / User and role management | [Accounts, roles, feature permissions, and guest sharing](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md) |
| tmux terminal / Terminal command buttons | [tmux shell terminal](../features/terminals-agents-automation/tmux-shell-terminals.md) |
| AI runtime selection / Runtime installation, authentication, and configuration / Models, reasoning, permissions, and defaults | [AI runtime installation, authentication, and execution settings](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) |
| Agent set and tab management | [Create agent sets and tabs](../features/terminals-agents-automation/agent-sets-and-tab-creation.md) |
| Prompts, skills, and file attachments | [Agent input, mentions, skills, and attachments](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) |
| Conversations, work records, and message queues / History and resuming from an external CLI | [Agent conversations, queues, and restoration](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md) |
| CLI commands in conversations | [Run CLI commands in conversations](../features/terminals-agents-automation/cli-commands-in-conversations.md) |
| Accounts, subscriptions, tokens, and costs | [View connected accounts, subscriptions, and usage](../features/terminals-agents-automation/linked-accounts-subscriptions-and-usage.md) |
| Scheduled messages | [Scheduled agent messages](../features/terminals-agents-automation/agent-scheduled-messages.md) |
| Feature-driven development | [Feature-driven development and Markdown documents](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md) |
| Project command buttons | [Project command buttons](../features/terminals-agents-automation/project-command-buttons.md) |
| Recurring scheduled tasks | [Recurring scheduled tasks](../features/terminals-agents-automation/recurring-scheduled-tasks.md) |
| Server web browser / Browser login and popups | [Server browser, login, and popups](../features/browser-android-remote-desktop/server-browser-login-and-popups.md) |
| Android | [Android environment checks and screen connection](../features/browser-android-remote-desktop/android-environment-checks-and-screen-connection.md) |
| Remote desktop / Remote input and mobile joystick | [Remote desktop and touch input](../features/browser-android-remote-desktop/remote-desktop-and-touch-input.md) |
| In-document table DBs / Project DB list / Postgres connections | [Document databases and full list](../features/document-databases/document-databases-and-catalog.md) |
| DB references and external tables | [Reference existing DBs and external Postgres](../features/document-databases/existing-database-and-external-postgres-references.md) |
| Theme, language, accent color, and font / Keyboard shortcut customization | [Display, language, font, and keyboard shortcut settings](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) |
| Mewcat | [Mewcat mascot](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md) |
| System resources | [View system resources and processes](../features/appearance-accounts-operations/system-resources-and-processes.md) |
| Server configuration, start, stop, and logs / App updates, HTTPS, and backups | [App updates and access to operations](../features/appearance-accounts-operations/application-updates-and-operations.md) |
| Skill and MCP management (guidance outside the README table) | [Manage skill and MCP sources](../features/terminals-agents-automation/skill-and-mcp-source-management.md) |

## Verification results

- Read 52 items (8 top-level and 44 child items) using the actual `readFeatureDocuments` and a new temporary `FeatureStore`. All item IDs, parent relationships, status hashes, and rereads after serialization were valid, and there were 0 execution history entries.
- Confirmed that 142 related source file references point to actual files. This cross-checks documentation against implementation entry points; it does not mean that runtime tests were performed for all features.
- Passed the project's `check_repo_docs.py` and `check_doc_links.py --workspace`.
- The skill's general `validate_ssot.py docs` does not pass. This validator requires `AGENT.md`, `README.md`, ADR maps/templates, and writing rules all within the documentation root and rejects links outside that root. It is incompatible with this workspace's structure, which links to central rules and ADRs, and with the existing project documentation's rule that frontmatter is optional. We did not duplicate the shared canonical source or modify existing history to satisfy it; we used project-specific checks and the actual feature parser.

## Follow-up cleanup — 2026-10-06

Integrated the detailed bodies of 7 feature-specific Specs into their respective feature documents. The initial organization record above is preserved as the rationale for the choices made at the time. Current content ownership and write-back follow the [Feature document management standards](../features/README.md), and the old Specs paths provide only relocation notices.
