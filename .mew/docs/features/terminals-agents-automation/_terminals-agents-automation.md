---
id: "mew-agents"
parent: null
title: "Terminals, agents, and automation"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-08"
status_hash: "b4a712c188aba3eddb432a8bcd7d40dbdfc871a265699f0235ad9b450b34cc0f"
files: []
commits: []
description: "Parent feature document grouping shell terminals, AI runtimes, agent conversations, input, skills, MCP, scheduling, external DAP debuggers, and feature-based development. Guides readers to child feature scopes and detailed contract links, and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Manages input, execution, restoration, and feature-level delegation for shell and agent work.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [tmux Shell Terminal](tmux-shell-terminals.md)
- [AI Runtime Installation·Authentication·Execution Settings](ai-runtime-installation-authentication-and-settings.md)
- [Agent Set·Tab Creation](agent-sets-and-tab-creation.md)
- [Agent Conversations·Queue·Restoration](agent-conversations-queue-and-restoration.md)
- [Agent Input·Mentions·Skills·Attachments](agent-input-mentions-skills-and-attachments.md)
- [View Connected Accounts·Subscriptions·Usage](linked-accounts-subscriptions-and-usage.md)
- [Scheduled Agent Messages](agent-scheduled-messages.md)
- [Run CLI Commands in Conversations](cli-commands-in-conversations.md)
- [Skill·MCP Source Management](skill-and-mcp-source-management.md)
- [Feature-Based Development·Markdown Documents](feature-driven-development-and-markdown-documents.md)
- [Project Command Buttons](project-command-buttons.md)
- [Recurring Scheduled Tasks](recurring-scheduled-tasks.md)

- [External DAP Debugger](external-dap-debugger.md)

### Detailed contracts

- [Terminal and agent usage](../../../../docs/guides/terminal-agents.md) · [Runtime settings](../../../../docs/configuration/agent-runtimes.md) · [Commands and scheduled tasks](../../../../docs/guides/commands.md)

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
