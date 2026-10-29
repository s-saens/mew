---
title: "Skills and MCP Management"
created: 2026-09-17
updated: "2026-10-29"
description: "Explains how to use the Skills and MCP management window, sources, supported locations, original protection, application scope, built-in commit and language-specific documentation skills, and external sprite MCP connections."
상위파일: "MOC.md"
---

Decision: [ADR 0157](../../.mew/docs/history/decisions/0157-mew-native-agent-harness-management.md).

## Usage

At the top of the agent panel, the book icon to the right of `i` opens **Manage Skills**, and the plug icon opens **Manage MCP**. Both are available before connecting a session. The two buttons open the corresponding tabs in the same management window. The gear button on the right opens the separate [agent default instructions settings](../guides/project-setup.md#edit-the-shared-guidance-file).

- The default list order is **Mew (skills only) → Global → Current Working Project → Subprojects**, with each item's name and agent label on the right shown on one line. Shared skills show `Global`, while dedicated items show agent names such as `Codex` or `Claude`. These labels identify the owning agent; group headings distinguish global and project application scopes. Click the arrow in each group heading to collapse or expand that group; item counts remain visible when collapsed. Collapse states are retained separately for Skills and MCP while the window is open, leaving detail selections and editing drafts intact. Items with the same name are listed separately if their sources differ; hover over them to see the owning agent and path.
- Scope and agent selection can be combined with search. `공통` means skills stored in `.agents/skills`. It does not mean every runtime automatically discovers this path.
- Scope and agent filters and destination selection for adding or moving items use the shared custom `SelectField` dropdown. Destinations display both the global/project scope and the agent. Navigate with the arrow keys and confirm with Enter/Space; Esc and Back close the list first. Confirming a selection goes through the existing draft protection, and selectors are disabled while saving. On mobile, select from the same list by touch.
- Selecting an item displays its description, owning agent, read-only status, original text, original path, and ownership scope in the details area. For skills, you can also expand the list of included files. MCP details contain JSON for only the selected server and do not return other account or settings fields.
- Use **Add** to specify the location, name, and content. **Edit → Save** changes only the skill's original text or the selected MCP server. MCP input is JSON, and saving follows the provider's configuration format.
- In **Move**, choose the destination scope and agent, then confirm. Skills move together with their scripts and reference files. MCP servers can only move between scopes within the same agent. If the destination already has an item with the same name, the operation fails and preserves the existing item.
- **Delete** runs after confirmation. It deletes the entire folder for a skill or one server configuration for MCP. Package skills, system skills, and symbolic links are read-only.
- Saving, moving, and deleting are rejected if external edits have changed the original. Your edits remain on screen so you can copy them or reload. Unsaved drafts are checked when closing, switching type or scope, or refreshing.
- On mobile, switch between the list and details. Esc and Back use the shared overlay stack; keyboard focus stays within the popup and returns to the original button when it closes.

Global settings are based on the **OS user running the Mew server**. Multiple Mew accounts share the same global settings. The API requires the `agent` feature permission and follows the same permission boundary as existing server control features ([access contract](../../.mew/docs/development/access-control.md)).

To generate sprites with a local model in agent chat, optionally [connect the separate project's `local-sprites` as an external MCP server](local-sprites.md). Generation code, models, and Python dependencies are not included in the Mew distribution. Mew uses the existing runtime MCP settings, and the generation tools can be reused in other clients.

## Mew-Specific Commit Skill

`<DATA_DIR>/skills/commit/SKILL.md` is a commit instructions file owned by Mew. Read and edit it in **Manage Skills → Mew → commit → Edit**. Only the initial template is generated; updates and restarts do not overwrite user edits. Because this is a fixed path referenced by shared features, the management window does not allow moving or deleting it or adding skills from other locations to this scope.

`/commit` in all runtimes through Mew and **AI Auto Commit** in the Git panel use the same file. The Mew file takes precedence over runtime skills with the same name; regular conversations receive only an instruction to read this file when a commit is approved. It is not registered in the skill list of CLIs run outside Mew. It is not duplicated into global, project, or agent-specific commit skills. Other general skills retain the existing original management contract.

The default commit skill instructs the agent to read the actual source text of any available writing or proofreading skill matching the repository's message language and refine the title and description. It optionally uses skills such as Korean `korean-writing-reviewer`, English `writing-clearly-and-concisely`, Japanese `yomiyasu`, and Simplified Chinese `tech-doc-style-chinese`; if linked through a documentation entry point, only the sentence proofreading stage applies. Preserve the facts of the changes, terminology, uncertainty, and existing language and prefixes; do not add separate structural design, translation, or evaluation. If no skill is available, write under the existing rules without installation or additional confirmation.

Because additional file reads and tool calls are restricted for `mew-commit-plan` and `mew-commit-evidence` in the Git panel, they use only writing instructions whose full text is provided in the request. A skill's name or path alone does not automatically supply its source text; without separately supplied text, the existing rules apply. Even when proofreading, preserve JSON keys, file paths, fragment numbers, and JSON-only responses. Default template changes do not automatically apply to user skills already created, so add only the needed instructions to existing files in Manage Skills.

For large changes, repeated lines, shared before-and-after text, and dictionaries of identical changes are losslessly compressed locally, and all change evidence is passed along. If it fits in one packet, planning runs once; otherwise, all packets are read and their evidence combined for planning. No files are left out because of size or compression. Change-purpose records are referenced only when they match actual Git objects; source comments or embeddings are not required. Only analysis is compressed; commits use the complete originals. Detailed formats, limits, and the contract for rechecking originals follow the [AI commit execution contract](../../.mew/docs/development/agent-sessions.md#git-ai-commit-jobs).

AI Auto Commit validates the per-file plan before executing actual commits, and for `/commit` in regular conversations, the agent follows the same procedure within the approved scope. Specific execution and cancellation scope follow the [Git usage guide](../guides/projects.md#git-operations-panel).

## Language-Specific Documentation Skills

Mew provides documentation skills for Korean, English, Japanese, and Simplified Chinese. Read the source text and language-specific proofreading criteria in **Manage Skills → Mew**. These files are owned by the package and are read-only in the management window. If a project or global skill has the same name, the explicit skill candidate list follows the existing priority for closer project skills and dedicated skills.

| Default Source Language | Skill |
| --- | --- |
| Korean | [korean-technical-docs](../../resources/skills/korean-technical-docs/SKILL.md) |
| English | [english-technical-docs](../../resources/skills/english-technical-docs/SKILL.md) |
| Japanese | [japanese-technical-docs](../../resources/skills/japanese-technical-docs/SKILL.md) |
| Simplified Chinese | [chinese-technical-docs](../../resources/skills/chinese-technical-docs/SKILL.md) |

**Response Language** in the agent default instructions also applies to the default source language for new documents. **Follow mew Language Setting** uses the actual language of the screen where the request is made. User-specified document languages and existing project or file language requirements take precedence over the default, so changing the response language does not cause existing documents to be rewritten in another language. Without a separate specification or screen language, the source language is determined from the current response language instructions and user message. Manually edited language instructions are not reinterpreted and overwritten.

`project-context-text.ts` passes the default skill path matching the response language instructions read in the same request. If the language cannot be determined, it passes all four paths and selection criteria so the agent reads only the relevant language. For documentation work, use the source-language skill to improve structure and wording and review accuracy. If translation is requested, translate directly from the finalized source into each target language, then review expression and meaning with the target-language skill. The source language is not fixed to Korean, and other language editions are not automatically generated or modified without a translation request. Disabling automatic project guidance also disables this linking guidance.

Language-specific entry points connect the documentation stages, and each stage reads and applies the original text of the existing specialized skills below. For Korean source text, proofread and finalize it in Korean, then translate directly into other languages. For English source text, proofread and finalize it in English, then translate directly into other languages. Perform the final translation review after completing translation proofreading and sentence proofreading in the target language.

| Stage | Skills Actually Installed and Reasons for Selection |
| --- | --- |
| Document structure | [documentation](https://github.com/mcollina/skills/tree/main/skills/documentation): Covers reader goals in Diátaxis and information order by document type. |
| Korean proofreading | [korean-writing-reviewer](https://github.com/CreatoonForge/korean-writing-reviewer): Includes a technical documentation profile and criteria for grammatical agreement, paragraph flow, and source text protection. |
| English proofreading | [writing-clearly-and-concisely](https://github.com/softaworks/agent-toolkit/tree/main/skills/writing-clearly-and-concisely): Focuses on paragraph organization, word relationships, and concise sentences. |
| Japanese proofreading | [yomiyasu](https://github.com/nanaism/yomiyasu): Provides references for technical and business documents, revision that preserves conditions and actors, and checking scripts. |
| Simplified Chinese proofreading | [tech-doc-style-chinese](https://github.com/Fenng/Tech-Doc-Style-Chinese): Covers usage, API, and operations documentation, addressing long sentences, terminology, and notation while distinguishing machine syntax. |
| Translation and review | `translating-core`, `translating-documentation`, `translating-korean`, `translating-japanese`, `translating-chinese`, and `reviewing-translations` from [translating-products-skill](https://github.com/BrunoMiguens/translating-products-skill): Divide responsibility for translating meaning, protecting document syntax, language-specific translation proofreading, and final comparison. English translation proofreading uses core and the English proofreading skill. |

The originals are in the repository's `resources/skills/`, and the linking instructions are in `resources/skills/technical-docs-common/`. The 11 external skills were installed in `.vendor/` with their original text, references, scripts, and licenses preserved. This path contains external skill packages and is not mixed into the description list for human-authored current documents. The [dependency record](../../resources/skills/dependencies.json) records repositories, pinned commits, per-file SHA-256 hashes, and language-specific roles. The originals are not modified; during updates, compare the new originals and configuration files and update the records and validation together. External skills are not downloaded again at runtime.

Source installations and prebuilt executables use the same package without duplicating it into runtime configuration files. Finalizing the source text is a review step within the requested work and does not repeatedly require editing or translation approval already granted. Apply the structure skill's folder organization and follow-up questions and the translation skill's configuration requirements according to existing project policies and the established audience, language, tone, and approval scope. Follow the project's subagent permissions, and do not report independent review or actual native-speaker review unless it was performed.

`server/documentation-skills.test.ts` checks language settings, subsequent requests, source text preservation, specialized skill links, source hashes, and skill lookup; `server/release-runtime.test.ts` checks the scope of original text, references, licenses, and checking scripts included in the distribution.

## Supported Locations

The default paths are listed below. They account for `CODEX_HOME`, `CLAUDE_CONFIG_DIR`/`MEW_AGENT_CONFIG_DIR`, `XDG_CONFIG_HOME`, `KIMI_CODE_HOME`, `HERMES_HOME`, `OPENCLAW_STATE_DIR`/`OPENCLAW_CONFIG_PATH`, `GEMINI_HOME`, and the corresponding env values in Mew runtime settings. Arbitrary configuration paths, profiles, and additional skill paths in custom launch arguments are not automatically interpreted.

### Skills

| Owner | Global | Project |
| --- | --- | --- |
| Shared | `~/.agents/skills` | `.agents/skills` |
| Codex | `~/.codex/skills` | `.codex/skills` |
| Claude | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills` | `.cursor/skills` |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` |
| Kimi Code | `~/.kimi-code/skills` | `.kimi-code/skills` |
| Prime Agent | `~/.prime/agent/skills` | `.prime/agent/skills` |
| Antigravity | `~/.gemini/antigravity/skills` | `.agent/skills` |
| Hermes | `~/.hermes/skills` | Uses the shared skill location |
| OpenClaw | `~/.openclaw/skills` | `skills` |

Directories containing `SKILL.md` are searched recursively. Kimi and Prime's single root-level `.md` format is also supported and is converted to the `<이름>/SKILL.md` directory format when moved elsewhere. Existing `.kimi/skills` and `~/.gemini/antigravity-cli/skills` locations are listed separately. Codex and Claude's `plugins/cache` and Codex's `.system` support viewing original text only. Older versions remaining in plugin caches may also appear, so do not interpret this as a list of “currently active skills.”

### MCP

| Runtime | Global | Project | Server Key |
| --- | --- | --- | --- |
| Codex | `~/.codex/config.toml` | `.codex/config.toml` | `mcp_servers` |
| Claude | `~/.claude.json` | `.mcp.json` (shared), `projects[절대경로]` in the global file (personal) | `mcpServers` |
| Cursor | `~/.cursor/mcp.json` | `.cursor/mcp.json` | `mcpServers` |
| OpenCode | `~/.config/opencode/opencode.json`, `.jsonc` | `opencode.json`, `.jsonc` | `mcp` |
| Kimi Code | `~/.kimi-code/mcp.json` | `.kimi-code/mcp.json` | `mcpServers` |
| Prime Agent | `~/.prime/agent/settings.json` | `.prime/agent/settings.json` | `mcpServers` |
| Antigravity CLI/IDE | `~/.gemini/config/mcp_config.json` | `.agents/mcp_config.json` | `mcpServers` |
| Hermes | `~/.hermes/config.yaml` | None | `mcp_servers` |
| OpenClaw | `~/.openclaw/openclaw.json` | None | `mcp.servers` |

Existing `.kimi/mcp.json` and `~/.gemini/antigravity/mcp_config.json` are also displayed when present. Claude's custom `CLAUDE_CONFIG_DIR` contains `.claude.json`. `.mcp.json`, `mcp.json`, and `mcp_config.json` in Codex and Claude plugin caches are read-only. Shared MCP files are not arbitrarily created, and settings are not duplicated into other runtimes.

## Saving and Applying

The management window checks the existing original's syntax, external changes, and move conflicts, preserving the original text on failure. It does not run or connect MCP servers or restart sessions, so check the relevant runtime's application and trust settings. Detailed saving, API, and validation contracts follow the [development documentation](../../.mew/docs/development/agent-harness.md).

## Sources

Configuration locations and formats were checked against official documentation and source code for [Codex MCP](https://developers.openai.com/codex/mcp/), [Claude MCP](https://code.claude.com/docs/en/mcp), [Claude skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills), [Cursor MCP](https://cursor.com/docs/mcp), [OpenCode skills](https://opencode.ai/docs/skills/), [OpenCode MCP](https://opencode.ai/docs/mcp-servers/), [Kimi configuration](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files), [Prime skills](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/skills.md), [Prime MCP](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/README.md#mcp-integrations), [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [OpenClaw skills](https://docs.openclaw.ai/tools/skills), [OpenClaw MCP](https://docs.openclaw.ai/tools/mcp), and [Antigravity MCP](https://antigravity.google/docs/cli/mcp/).
