---
title: "Usage"
created: "2026-09-11"
updated: "2026-10-29"
description: "Links to guides for documents, files, Git, agents, collaboration, and remote work after installation and first use, and explains features that require additional preparation and settings for the interface, language, and skills."
상위파일: "../README.md"
---
# Usage

Choose the task you need and open its guide. For implementation details, see the [feature specifications](../../.mew/docs/features/_features.md) and [development contracts](../../.mew/docs/development/MOC.md).

## Getting started

- [Introduction to mew and interface tour](overview.md)
- [Installation](getting-started-en.md)
- [Open your first project and document](first-steps.md)

The current public installation uses Linux, macOS, or WSL 2 on Windows. See [CLI Releases](../../.mew/docs/operations/cli-release.md) for the publication and verification status of prebuilt CLIs and native Windows executables.

## Documents and projects

| Task | Guide |
| --- | --- |
| Open folders, switch projects, browse files, use Git, and manage tasks | [Projects and Files](projects.md) |
| Edit and autosave Markdown, code, tables, attachments, and PDFs | [Editor](editor.md) |
| Connect Documents, set default instructions, and automatically guide agents | [Project Settings](project-setup.md) |
| Collaborative editing, comments, mentions, chat, and guest sharing | [Collaboration and Sharing](collaboration.md) |
| Search and replace file names and contents | [Search](../configuration/search.md) |

## Execution and automation

- [Terminals, AI agents, conversations, and tabs](terminal-agents.md)
- [Command buttons, scheduled tasks, and system resources](commands.md)
- [Postgres tables, document DBs, and read-only references](database.md)

## Remote access and screens

| Task | Guide |
| --- | --- |
| Open your mew in a browser on a phone or another computer | [Mewlink, Tailscale, and Cloudflare Tunnel](getting-started-ko.md#connect-remotely) |
| Open web pages on the server and check the Android environment | [Browser and Android](browser.md) |
| Access a computer's screen and use keyboard and touch input | [Remote Desktop](remote-desktop.md) |

External access lets you open a running mew instance in another browser. Remote desktop transmits the computer's screen and input and requires separate components and OS permissions. Android requires a separate device and gateway, and Postgres tables require a DB connection.

## Settings and troubleshooting

| Settings and checks needed | Guide |
| --- | --- |
| Change themes, fonts, dock, keyboard shortcuts, notifications, and accounts | [Environment and Accounts](../configuration/MOC.md) |
| Install and authenticate AI runtimes and select models | [Runtime Settings](../configuration/agent-runtimes.md) |
| Check default documentation skills, additional skills, and MCP | [Skills and MCP Management](../configuration/agent-harness.md) |
| Change the Documents connection, default agent instructions, and response language | [Project Settings](project-setup.md) |
| Diagnose WSL connections and WSLg conflicts | [Troubleshooting](troubleshooting.md) |
| Check before granting accounts or sharing permissions to others | [Security](../operations/security.md) |

These guides are maintained in English. Earlier locale-specific installation paths are retained for existing links.
