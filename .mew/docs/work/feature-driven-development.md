---
title: "Feature-driven development GUI — Implementation record and planning draft"
created: 2026-09-17
updated: 2026-09-17
description: "Preserves the implementation results and earlier planning draft for the GUI covering per-feature requests, classification, supervisor queues, implementation records, and user judgments, along with the transition to Markdown storage."
상위파일: "_work.md"
---

Status: Implementation and isolated verification complete; not yet applied to the running server. The canonical source for current behavior is [Feature-driven development](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md), and the decision is [ADR 0159](../history/decisions/0159-mew-feature-driven-development.md). The draft below preserves the requirements and review process at the time and is not used as the current contract.

## Implementation results

1. Implemented per-project ledgers, versions, state transitions, hierarchies, and protection against concurrent writes.
2. Connected the classification and result-recording CLI and shared instructions used by all sets.
3. Implemented an independent supervisor's request queue, interruption, restoration, conversation linking, and context captured at request intake.
4. Implemented the feature tree, detail editing, request popup, files and commits, and user judgments in the menu.
5. Added verification using temporary files, Git repositories, fake agents, and an isolated browser, along with current documentation. The user performs the build and applies it to the server.

## Transition to Markdown storage

Following [ADR 0161](../history/decisions/0161-mew-feature-markdown-source.md), moved feature definitions, implementation results, and judgments to Markdown in Documents/features. Server JSON retains the execution queue and request history. Implemented checks for concurrent external and GUI edits, a hierarchy with fixed IDs, backup and automatic migration of existing ledgers, recovery from interruptions, document opening, and MOC linking. Completed verification of copying, migration, invalid documents, save conflicts, and the isolated GUI. Did not migrate the running server or actual user data.

## History / raw — Planning draft

## Purpose and basic unit

Users delegate development by feature, review the implementation details, related files, and related commits, then approve the results or request revisions. Feature items persist through repeated revisions and can have child features. An agent set is a preset selected to handle execution, not the owner of the feature list.

## User-specified requirements

### List and details

- The feature list uses compact rows with a status circle to the left of each title.
- Allow child features to be added and displayed in a hierarchy.
- The default sort order is most recently changed first. Users can switch to sorting by name or initial creation time.
- The top item in the list is always the `+` button. Clicking it opens the feature request popup.
- Clicking a feature item lets users edit its title and content and view detailed implementation information, a list of related files, and a list of related commits.

### Status

| Color | Meaning | Entry condition |
| --- | --- | --- |
| Blue | Implementation in progress | An agent is implementing or modifying the feature |
| Mint | Implementation complete, awaiting user review | An agent has completed implementation |
| Green | User review complete | The user determines that the feature is implemented well |
| Red | Revisions needed | The user determines that revisions are still needed |
| Orange | Requirements changed | The user edits the title or content in the detail view |

In the orange state, users can change it directly to green or hand the work over to an agent. Editing the title or content alone does not start automatic implementation. An agent completing implementation and a user reviewing the results are separate steps.

### Feature request flow

1. Click `+` at the top of the list.
2. In the popup, enter the request title and content and select the responsible agent set.
3. Upon confirmation, the selected agent set reviews the request and existing features.
4. For an entirely new feature, add a new item. For a modification to an existing feature, update that item. For a child feature of an existing feature, add it beneath that feature.
5. Implement the selected item and, upon completion, record the implementation details, related files, and related commits.
6. The user reviews the results and marks the item green or red.

Provide classification and item update rules through **shared mew agent instructions**. Do not place them only in a specific agent set's role prompt. Every agent set follows the same feature management rules.

## Proposed screen layout — Not finalized

On wide screens, place the feature tree on the left and details for the selected item on the right. On narrow screens, navigate from the list to details and preserve selection and scroll position when returning. The exact menu entry location remains undecided.

```text
기능                       [최근 변경순 ▾]
+ 기능 요청
▾ ● 로그인
    ● 이메일 로그인
    ● 비밀번호 재설정
  ● 검색
```

- Rows use single-line titles by default, with long titles truncated with an ellipsis. Show implementation descriptions and file and commit lists in the detail view.
- Separate the expand arrow from the status circle. Collapsing and expanding are separate actions from selecting an item to view its details.
- Give status circles a tooltip with the status name and an accessible name, and display the status name as text in the detail view. Do not rely on color alone to distinguish mint from green.
- The detail view contains an editable title and requirements, implementation results, related files, and related commits. Provide actions for User confirmation, Revisions needed, and Assign to agent.
- Separate request content from implementation results written by the agent. Recording implementation results alone must not turn the item orange.

## Proposed behavior improvements — Not finalized

| Issue | Proposal |
| --- | --- |
| Hierarchy and sorting | Preserve parent-child relationships and sort siblings under the same parent. When sorting by recent changes, also factor child feature change times into the sort order of parent groups. |
| Sort direction | Sort names in ascending order and initial creation times oldest first. Recent changes include changes to requirements, implementation results, status, and hierarchy, but exclude simple viewing and collapsing. |
| Parent status | Keep the parent circle tied to the parent feature's own status. Do not automatically approve it based on child statuses. If child progress needs to be displayed, treat it as separate supporting information. |
| Status during editing | Change to orange when an actually changed title or content is saved. Exclude canceled input and saves with unchanged values. |
| Requirements changed during execution | Turn the item orange and display the ongoing execution separately. Record the requirements version at execution start so that completion of an old version does not overwrite new changes with mint. Queue and interruption policies for passing along changes remain for a later decision. |
| Rework after revisions are needed | Red does not trigger an immediate rerun. Enter the revisions and rerun using `에이전트에게 맡기기`. Suggest the previous assignee by default, but allow it to be changed. |
| Automatic classification review | Leave a brief record of the decision and its rationale, then navigate to the processed item. Updates to existing items preserve their identifiers and history. A way to change the target and parent-child relationships is needed for incorrect classifications. |
| File and commit links | Link only files and commits confirmed during actual work. Show an empty state if there are no commits. The requirement to show related commits alone does not establish an automatic commit policy. |
| Multiple executions | Preserve the results of repeated work on the same feature and links to its executions. Identify commits by both repository and hash; a single commit can relate to multiple features. |

## Items to decide in follow-up planning

- The project scope of the feature list, and ownership and editing permissions for collaborative use.
- How to display request intake, classification in progress, queued execution, failure, and interruption. The five currently specified colors represent feature status, so failure must not be treated as equivalent to red, which represents a user judgment.
- Criteria for splitting requests or asking questions when a single request includes multiple features or classification is ambiguous.
- How to coordinate edits, additional requests, and concurrent executions during work, and which version is subject to user approval.
- Whether to connect feature execution to an existing agent tab or start a new session, and which records to retain after the tab is closed.
- How to store the list, the shared interface agents use to read and update it, and how to verify results. Delivering instructions alone does not guarantee correct updates.

## Connections to existing decisions

- [ADR 0095 — Agent sets are tab startup presets](../history/decisions/0095-mew-agent-sets-as-tab-presets.md): Design feature management and work records as responsibilities of the mew feature system, and use sets as the execution settings for the assignee. This ADR calls for a separate task system decision if unattended routing and task history become necessary again. Write a new central ADR when the execution structure is finalized.
- [ADR 0155 — Automatic project context delivery](../history/decisions/0155-mew-project-agent-context.md): Defines the existing boundary for delivering shared mew instructions. How to connect feature instructions remains subject to follow-up design and does not change the current automatic delivery contract.

Implement the draft requirements according to the plan above. Record the canonical source for completed behavior in [Feature-driven development](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md).
