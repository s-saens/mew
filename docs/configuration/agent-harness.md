---
title: "Skills and MCP Management"
created: 2026-09-17
updated: "2026-11-05"
description: "Manage one effective skill per name in common/project libraries, turn workflows on or off, import external originals safely, and remove or restore defaults. Also covers unchanged installation-wide common MCP connections and native MCP source editing."
상위파일: "MOC.md"
---

Decisions: [Managed skill library](../../.mew/docs/decisions/0140-managed-skill-library.md) and [native MCP sources](../../.mew/docs/history/decisions/0157-mew-native-agent-harness-management.md).

## Mew common MCP

Use **Agent panel → Manage MCP → Add → Mew shared** as an owner to register a server for this Mew installation. Enter its name and HTTPS server URL, then save. Use **Configure with JSON** for local commands, environment variables, headers, SSE, or OAuth options. Select the saved server and choose **Connect**, or **Log in** when its saved state says that sign-in is required. If approval is required, complete it in the host login screen displayed inside Mew.

Enabled common servers enter Mew ACP conversations only when their saved connection state is **Connected**. An owner must select **Connect** and complete any required login before first use, including for local commands and remote servers that need no login. Registration alone leaves the server in the management list without adding it to a conversation.

After connection succeeds, start or clear a conversation, or load a saved one, to use the current connected common list. The same common connection and saved authentication are available to every account with agent access across runtimes and projects. An active conversation retains its existing bindings; reconnecting it does not refresh the list. CLIs launched outside Mew retain their own configuration.

To reuse a server already registered in Claude, Codex, or another supported source, select it and choose **Import to Mew**. Mew converts the supported configuration and preserves the source. A name collision or unsupported setting produces an error without overwriting the original. For unsupported native options, explicitly prepare a common definition with the intended supported behavior instead of silently dropping settings. Native OAuth tokens are not copied, so the first common connection may require a fresh approval. Imported native definitions can still load independently until you disable them in their owning runtime.

The connection controls show the last checked state, allow retry, and cancel pending login. Closing a pending login cancels its job while preserving saved credentials. **Disconnect** clears the common connection's saved authentication; it does not remove the definition or revoke the provider's grant. The host login screen requires Linux/WSL with the existing Chrome and login-desktop dependencies. Local and unauthenticated remote servers can connect without that screen.

**Connected** records saved readiness, not continuous server health; a later outage or expired authorization can still fail a runtime connection. If a server needs login, an owner must reconnect it before starting, clearing, or loading a conversation to add it again.

Mew common definitions and credentials are private server data shared by all accounts on this installation. Accounts with agent access can list and use them; owners with agent access manage definitions, imports, raw configuration, and authentication. Disconnecting clears authentication for every account using that connection. Deleting an account preserves shared connections. Previous account-private registries are retained without automatic promotion; an owner must explicitly register or import a shared definition. See the [common MCP contract](../../.mew/docs/development/shared-mcp.md), [ADR 0127](../../.mew/docs/decisions/0127-installation-wide-mcp.md), and the [connection-readiness decision](../../.mew/docs/decisions/0128-shared-mcp-readiness.md).

## Usage

At the top of the agent panel, the book icon opens **Manage Skills**, and the plug icon opens **Manage MCP**. Both work before a session connects. The gear opens the separate [default instructions settings](../guides/project-setup.md#edit-the-shared-guidance-file).

### Skills

The main list contains one effective row per skill name. Each row shows its scope and an on/off control. Select a skill to read its description and instructions. Expand **Sources** to inspect the current path, duplicate external sources, and included files.

- **Common** makes a skill available across projects and runtimes in this Mew installation. **This project** stores a project-specific skill or overrides a common skill's on/off setting. Use **Use common setting** to clear that override.
- **Add** creates a skill in common or project scope. Edit and save managed skills without choosing a Codex- or Claude-specific folder.
- **External skills** lists skills discovered in supported native folders. Select one and import it into common or project scope. Import copies supporting files, preserves the original, and rejects unsafe links or existing destinations. These sources are not active Mew registrations until imported.
- **Off** keeps the skill and removes it from Mew suggestions and automatic workflow selection. **Delete** removes a managed copy or a default registration after confirmation. External originals remain untouched. Removing a project override does not silently activate its common fallback.
- **Default skills** lets you explicitly restore a removed default. Normal reads, updates, and session startup do not register removed defaults again.

Mew provides four documentation workflows and a commit workflow. The documentation workflows include their editing and translation helpers; those internal dependencies are not separate active rows. Package documentation files remain read-only, while their registration and enablement are controllable.

Changes enter the catalog supplied with the next agent request, including queued requests when they execute. Mew's Codex and Claude sessions suppress their native automatic skill catalog; other runtimes receive the same selection policy without verified native suppression. Existing conversation text is retained. This setting does not restrict file tools or change CLIs launched outside Mew.

### MCP

MCP retains its source management interface: installation-wide **Mew common**, global native settings, the current project, and subprojects. Filter by scope and agent or search by name. Source details identify the runtime, path, and read-only reason. Common MCP connection behavior follows the section above.

Use **Add**, **Edit**, **Move**, or **Delete** for a supported native server configuration. Moves remain within the same runtime. Delete removes one server entry after confirmation. Package and symbolic-link sources are read-only. Native source editing does not connect servers or restart sessions.

### Preservation and access

Scope controls use the shared keyboard/touch selection component. Unsaved edits require a discard decision before navigating or closing. Failed saves preserve the draft; stale revisions and destination collisions preserve existing files. On mobile, use **Back to list** to leave details. Esc and Back dismiss the current selection popup before the management dialog.

Common skills and native global settings belong to the server OS user and are shared by Mew accounts. The APIs require the existing `agent` permission. Installation-wide common MCP additionally requires owner access for management. See the [access contract](../../.mew/docs/development/access-control.md).

To generate sprites with a local model, optionally [connect the separate project's local-sprites MCP](local-sprites.md). Its generation code, models, and Python dependencies are not included in Mew.

## Mew-Specific Commit Skill

The commit workflow appears in **Manage Skills** alongside other common skills. Its editable common copy uses `<DATA_DIR>/skills/commit/SKILL.md`; until customized, the packaged template supplies the default. Project overrides can provide their own commit workflow. Saving preserves user edits, and disabling or removing the workflow prevents automatic references to it.

`/commit` through Mew and **AI Auto Commit** use the enabled resolved workflow. If it is off, Git's built-in plan format and validation remain available without adding the disabled instructions. Commit authorization still comes from the user or shared commit setting; enabling a skill does not authorize a commit. No runtime-specific copies are installed.

The default commit skill instructs the agent to read the actual source text of any available writing or proofreading skill matching the repository's message language and refine the title and description. It optionally uses skills such as Korean `korean-writing-reviewer`, English `writing-clearly-and-concisely`, Japanese `yomiyasu`, and Simplified Chinese `tech-doc-style-chinese`; if linked through a documentation entry point, only the sentence proofreading stage applies. Preserve the facts of the changes, terminology, uncertainty, and existing language and prefixes; do not add separate structural design, translation, or evaluation. If no skill is available, write under the existing rules without installation or additional confirmation.

Because additional file reads and tool calls are restricted for `mew-commit-plan` and `mew-commit-evidence` in the Git panel, they use only writing instructions whose full text is provided in the request. A skill's name or path alone does not automatically supply its source text; without separately supplied text, the existing rules apply. Even when proofreading, preserve JSON keys, file paths, fragment numbers, and JSON-only responses. Default template changes do not automatically apply to user skills already created, so add only the needed instructions to existing files in Manage Skills.

For large changes, repeated lines, shared before-and-after text, and dictionaries of identical changes are losslessly compressed locally, and all change evidence is passed along. If it fits in one packet, planning runs once; otherwise, all packets are read and their evidence combined for planning. No files are left out because of size or compression. Change-purpose records are referenced only when they match actual Git objects; source comments or embeddings are not required. Only analysis is compressed; commits use the complete originals. Detailed formats, limits, and the contract for rechecking originals follow the [AI commit execution contract](../../.mew/docs/development/agent-sessions.md#git-ai-commit-jobs).

AI Auto Commit validates the per-file plan before executing actual commits, and for `/commit` in regular conversations, the agent follows the same procedure within the approved scope. Specific execution and cancellation scope follow the [Git usage guide](../guides/projects.md#git-operations-panel).

## Language-Specific Documentation Skills

Mew provides documentation skills for Korean, English, Japanese, and Simplified Chinese. Read the source text in **Manage Skills**. Package originals are read-only; each workflow can be disabled, removed, or explicitly restored. A registered project skill takes precedence over a same-name common skill. Native copies require import and are shown as provenance rather than competing active rows.

| Default Source Language | Skill |
| --- | --- |
| Korean | [korean-technical-docs](../../resources/skills/korean-technical-docs/SKILL.md) |
| English | [english-technical-docs](../../resources/skills/english-technical-docs/SKILL.md) |
| Japanese | [japanese-technical-docs](../../resources/skills/japanese-technical-docs/SKILL.md) |
| Simplified Chinese | [chinese-technical-docs](../../resources/skills/chinese-technical-docs/SKILL.md) |

**Response Language** in the agent default instructions also applies to the default source language for new documents. **Follow mew Language Setting** uses the actual language of the screen where the request is made. User-specified document languages and existing project or file language requirements take precedence over the default, so changing the response language does not cause existing documents to be rewritten in another language. Without a separate specification or screen language, the source language is determined from the current response language instructions and user message. Manually edited language instructions are not reinterpreted and overwritten.

`project-context-text.ts` passes only enabled resolved documentation paths matching the response language instructions read in the same request. If the language cannot be determined, it passes the enabled language entrypoints and selection criteria. Turning off the matching workflow removes that automatic reference on the next request. For documentation work, use the source-language skill to improve structure and wording and review accuracy. If translation is requested, translate directly from the finalized source into each target language, then review expression and meaning with the target-language skill. The source language is not fixed to Korean, and other language editions are not automatically generated or modified without a translation request. Disabling automatic project guidance also disables this documentation linking guidance. The independent active skill catalog still follows Skills settings.

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

External skill import candidates and native MCP locations are listed below. They account for `CODEX_HOME`, `CLAUDE_CONFIG_DIR`/`MEW_AGENT_CONFIG_DIR`, `XDG_CONFIG_HOME`, `KIMI_CODE_HOME`, `HERMES_HOME`, `OPENCLAW_STATE_DIR`/`OPENCLAW_CONFIG_PATH`, `GEMINI_HOME`, and the corresponding env values in Mew runtime settings. Arbitrary configuration paths, profiles, and additional skill paths in custom launch arguments are not automatically interpreted.

### Skills

Managed common skills use `<DATA_DIR>/skills`; managed project skills and overrides use `.mew/skills` at the nearest project boundary. The following folders are read-only discovery sources for imports, not active Mew storage destinations.

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

Discovery stops at each skill entrypoint rather than exposing its nested dependency skills. Kimi and Prime root-level `.md` sources can be imported into `<name>/SKILL.md` format. Existing `.kimi/skills` and `~/.gemini/antigravity-cli/skills` are also searched. Plugin caches and system folders are external sources; unsafe links cannot be imported. Older cache versions may appear in the external list without becoming active. Child and sibling projects are excluded; open the relevant project to manage its library.

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

Existing `.kimi/mcp.json` and `~/.gemini/antigravity/mcp_config.json` are also displayed when present. Claude's custom `CLAUDE_CONFIG_DIR` contains `.claude.json`. `.mcp.json`, `mcp.json`, and `mcp_config.json` in Codex and Claude plugin caches are read-only. Mew common MCP uses its private installation registry; native settings are not automatically duplicated into other runtimes.

## Saving and Applying

The management window checks the existing original's syntax, external changes, and move conflicts, preserving the original text on failure. Native source editing does not connect MCP servers or restart sessions, so check the relevant runtime's application and trust settings. Mew common MCP has explicit connection and authentication controls described above. Skill resolution and management follow the [skill library contract](../../.mew/docs/development/skill-library.md); native MCP saving follows the [harness contract](../../.mew/docs/development/agent-harness.md).

## Sources

Configuration locations and formats were checked against official documentation and source code for [Codex MCP](https://developers.openai.com/codex/mcp/), [Claude MCP](https://code.claude.com/docs/en/mcp), [Claude skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills), [Cursor MCP](https://cursor.com/docs/mcp), [OpenCode skills](https://opencode.ai/docs/skills/), [OpenCode MCP](https://opencode.ai/docs/mcp-servers/), [Kimi configuration](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files), [Prime skills](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/skills.md), [Prime MCP](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/README.md#mcp-integrations), [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/), [OpenClaw skills](https://docs.openclaw.ai/tools/skills), [OpenClaw MCP](https://docs.openclaw.ai/tools/mcp), and [Antigravity MCP](https://antigravity.google/docs/cli/mcp/).
