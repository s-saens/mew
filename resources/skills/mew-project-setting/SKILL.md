---
name: mew-project-setting
description: "Set up or update a project for Mew from the user's concept: configure build/deploy actions, results and publishing pipelines, useful outputs, and Mew documentation with test-first development by default. Apply when creating, adapting, or repairing project setup."
---

# Configure a project for Mew

Turn the user's concept and feature specification into a usable Mew project. Use `/mew-project-setting` to set up a new project, update an existing one, or repair its build, deployment, and documentation setup.

## Establish the project contract

Read the project's README and applicable agent instructions first. Follow its execution restrictions, documentation ownership, language policy, and existing technology choices. Inspect the current files, tests, package scripts, manifests, build configuration, and Mew settings before editing. Preserve user-authored configuration and unrelated changes.

Resolve routine choices from the user's request and project evidence. Ask only for missing information that materially changes the result, and continue independent work while waiting. Keep requirements traceable to the user's concept and feature specification; distinguish implemented behavior from plans and unresolved decisions.

## Configure build and deployment actions

Make common outcomes available through Mew's build/deploy buttons so the user does not need to know shell commands. Keep existing command buttons available for custom workflows.

1. Inspect Mew's detected actions and the project's actual scripts and configuration. Reuse supported automation where it can establish the command and result from project evidence. If automation cannot resolve the setup, use agent investigation to configure the missing actions; report unresolved prerequisites without inventing working commands.
2. Configure the project's `.mew/project-actions.json` using the format below. Add separate debug and release builds when the project supports them. Add deployment actions only for targets established by the project or user. Preserve user edits and allow the user to revise action names, commands, variants, and results.
3. Configure useful results: a server URL or port for Mew's internal Browser, a direct artifact download such as an APK, or both when applicable. Use actual output locations and endpoints from the build or deployment configuration. Keep credentials and tokens out of shared settings, URLs, logs, and documentation.
4. Check that each action exposes completion or failure through Mew's notification and run-results UI. Give failed actions actionable diagnostics and retain logs needed for retry. A failed action, missing toolchain, unsupported project, invalid configuration, or failed discovery must not block project creation or editing. Preserve the project and expose recovery or agent assistance.
5. Validate settings and run only checks authorized by the current request and project rules. Configuring a deployment button does not authorize executing it. Respect restrictions on server lifecycle operations and distinguish configuration, local verification, and actual deployment in the report.

Configure only actions the project can support. A documentation-only project may have none; an uncertain deployment target remains unresolved while other project work continues.

The configuration contains `{ "version": 1, "actions": [...] }`. Each action uses these fields:

| Field | Value |
| --- | --- |
| `id` | Stable unique action identifier; preserve it when editing. |
| `name` | User-facing label describing the outcome. |
| `kind` | `build` or `deploy`. |
| `command` | Existing project command to run from the project root. |
| `variant` | Optional `debug`, `release`, or `custom`. |
| `previewUrl` | Optional HTTP(S) URL, including an established local server port, to open in Browser. |
| `artifacts` | Optional array of project-relative file paths or globs for downloadable results. |

Mew discovery recognizes explicit Node build/deploy scripts and Android wrapper build variants. It does not establish an unknown hosting target, credentials, or server URL. Inspect the underlying project configuration before filling gaps.

## Configure results and publishing

Use the results/publishing screen as the ordinary user entry. A result should offer a real address or useful files, and publishing should name the actual destination. Keep shell commands and service identifiers in the settings used by the actions and flows.

Mew can offer read-only default flows from actions and connected services. When a project needs a custom order, maintain `.mew/project-pipelines.json` as `{ "version": 1, "pipelines": [...] }`. Each pipeline has a stable `id`, a user-facing `name`, a `purpose` of `preview` or `publish`, and ordered `steps`. Each step has an `id`, a `name`, and either `{ "type": "action", "actionId": "existing-action-id" }` or `{ "type": "provider", "connectionId": "existing-private-connection-id" }`. An optional `resultUrl` names an established HTTP(S) result address. Preserve saved empty lists, custom names, and user edits.

Only add steps supported by project evidence. A test command can be configured as an existing action and selected before a build; do not display a test step that does not actually run. Preview flows must not contain deployment actions or external publishing connections. Missing steps or credentials should lead to setup, not prevent project work.

Initial remote connections support dispatchable GitHub Actions workflows, Git-connected Cloudflare Pages deployments, and existing Google Cloud Build triggers. Credentials belong in Mew's private connection settings, never project JSON, workflow inputs, command text, logs, or documentation. Connections are account- and project-specific; a copied connection ID does not grant access. Do not create provider resources, grant permissions, or execute deployment merely to finish configuration.

Explain the source being published. Remote workflows use the selected provider repository/reference; local changes are not automatically committed, pushed, or uploaded. A local command can deploy to a remote service, so its execution computer is not its publishing destination. A successful workflow does not prove that a website is available. Static output downloads do not themselves run an app inside Mew. Document unresolved preview, hosting, credentials, and token-expiry prerequisites accurately.

## Maintain Mew documentation

Use the project's Documents entrypoints, then select relevant documents by path and frontmatter `description` before reading their bodies. Follow its existing document structure; no MOC navigation or registration is required by Mew.

Document the user's concept, scope, feature requirements, and acceptance criteria in their current owners. Keep usage, implementation contracts, operations, decisions, and work records in the project's established locations. Create a small focused document only when no suitable owner exists. Give each new or changed document an accurate, non-empty `description` and repair affected links.

Update canonical documentation alongside feature, configuration, or operating changes. Document how users run the configured build/deploy actions and open or download results. Record checks actually performed, unresolved prerequisites, and remaining limitations. Use the enabled documentation workflow matching the project's source language when available; preserve explicit project language requirements.

## Develop with tests first

Use test-driven development (TDD) by default. Before implementation, write or update an automated test for the intended behavior and run it to confirm the expected failure. Implement the smallest coherent change, run the relevant tests until they pass, and refactor with the tests passing.

When changing a feature, update the affected tests before changing its implementation. Include regression coverage for bug fixes. Test behavior and meaningful failure paths, including non-blocking action setup and result access, rather than mirroring implementation details. Use the project's existing test tools and required build, type, lint, and documentation checks. Report unavailable prerequisites or blocked checks accurately.

## Keep additional guidance replaceable

Keep the necessary Mew build/deploy controls, useful result access, and maintainable Mew documentation as the setup baseline. Beyond these Mew essentials, user instructions or other skills can replace concrete workflow, testing, architecture, naming, and style guidance, including this skill's default TDD workflow. Do not impose an unrelated folder structure, technology, or process. Explicit project instructions and execution restrictions remain authoritative.

Finish by describing the configured actions and results, documentation updates, actual verification, and unresolved limitations. Setup is still useful when only part of the project can be automated.
