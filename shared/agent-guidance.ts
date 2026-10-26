import type { BranchGuidanceSnapshot } from './branch-guidance.ts'
import type { AgentCapacityRetrySettings } from './agent-capacity-retry.ts'

export const guidanceOptions = {
  commit: {
    inherit: '',
    always: 'After each completed change, commit the files changed for that task. Keep unrelated changes out of the commit. Do not push unless requested.',
    requested: 'Create Git commits only when the user explicitly requests them. Do not push unless requested.',
  },
  commitLanguage: {
    en: 'Write Git commit titles and descriptions in English. Preserve the repository’s commit prefixes and message style.',
    ko: 'Write Git commit titles and descriptions in Korean. Preserve the repository’s commit prefixes and message style.',
    ja: 'Write Git commit titles and descriptions in Japanese. Preserve the repository’s commit prefixes and message style.',
    zh: 'Write Git commit titles and descriptions in Simplified Chinese. Preserve the repository’s commit prefixes and message style.',
    mew: 'Write Git commit titles and descriptions in the mew UI language supplied with this request. If no UI language is supplied, write them in English. Preserve the repository’s commit prefixes and message style.',
    agent: 'Write Git commit titles and descriptions in the same language as your responses to the user. Preserve the repository’s commit prefixes and message style.',
  },
  language: {
    mew: 'Respond in the mew UI language supplied with this request. If no UI language is supplied, follow the language of the user’s message.',
    inherit: '',
    ko: 'Respond to the user in Korean.',
    en: 'Respond to the user in English.',
    ja: 'Respond to the user in Japanese.',
    zh: 'Respond to the user in Simplified Chinese.',
  },
  detail: {
    inherit: '',
    concise: 'Keep responses concise, focusing on results and essential information.',
    detailed: 'Provide detailed responses with relevant reasoning and verification results.',
  },
  subagents: {
    inherit: '',
    automatic: 'When the runtime supports subagents, proactively delegate independent, bounded tasks when doing so would materially improve speed or quality. Keep small or tightly dependent tasks with the main agent. Give each subagent a clear scope, coordinate shared-file edits, and review and integrate its results before reporting completion.',
    explicit: 'Use subagents only when the user explicitly requests delegation or parallel agent work, and only if the runtime supports them.',
    never: 'Do not use subagents. Complete the work in the main agent.',
  },
  debugger: {
    enabled: 'Use an available debugger when logs and tests do not adequately explain a bug or runtime behavior. Inspect variables and call stacks at relevant breakpoints. Follow existing execution and permission restrictions, and clean up debug connections and temporary processes afterward.',
    disabled: 'Use a debugger only when the user explicitly requests it.',
  },
  testing: {
    required: 'When adding or changing behavior or fixing a bug, you must write or update automated tests that verify the affected behavior. For bug fixes, include a regression test. Run the relevant tests before completing the task, following project execution restrictions. If tests cannot run, report the blocker and do not claim they passed. Documentation-only changes do not require new tests.',
    project: 'Follow the project’s requirements for writing and running tests. Mew adds no separate test-writing requirement in this mode.',
  },
  documentation: {
    required: 'When code, features, configuration, or operating procedures change, update the owning canonical documentation in the same task. Update the existing source of truth instead of duplicating it, and link related usage, implementation, and operational documents when their contracts change.',
    project: 'Follow the project’s documentation update requirements. Mew adds no separate documentation update requirement in this mode.',
  },
  decisionRecords: {
    required: 'Record significant architecture or technology choices, shared contract changes, and reversals of established decisions in an ADR or the project’s existing decision record format. Include context, the decision, alternatives, rationale, consequences, and status. Link superseded decisions and keep their history. Routine edits do not need an ADR; follow the project’s existing location and numbering.',
    project: 'Follow the project’s decision record requirements. Mew adds no separate ADR requirement in this mode.',
  },
  workRecords: {
    required: 'For implementation work, record the purpose, resulting behavior, checks actually performed, outcomes, and remaining limitations in the project’s existing work or change record. Distinguish local verification from deployment or operational application. Keep current contracts in their owning documents and link to them; do not create duplicate permanent logs for routine prose edits.',
    project: 'Follow the project’s work and verification record requirements. Mew adds no separate work record requirement in this mode.',
  },
  documentWriting: {
    required: 'Write documentation for its intended reader and task, using clear, concise language and the project’s terminology and format. Separate current contracts, instructions, decisions, and historical work. Preserve facts, conditions, code, links, and uncertainty; do not invent verification results or rewrite unrelated documents.',
    project: 'Follow the project’s documentation writing conventions. Mew adds no separate writing convention in this mode.',
  },
  documentDescriptions: {
    required: 'Give every new or changed documentation file an accurate, non-empty frontmatter description, and update it when the document’s scope or status changes. Describe the subject and coverage so agents can select relevant current documents without reading every body. Preserve the project’s established metadata format.',
    project: 'Follow the project’s documentation metadata requirements. Mew adds no separate frontmatter description requirement in this mode.',
  },
  documentLinks: {
    required: 'When documentation files or headings move or change names, update existing incoming links and relevant anchors in the same task. Link to canonical sources rather than copying facts. Follow the project’s link conventions; no MOC update is required by Mew.',
    project: 'Follow the project’s documentation link maintenance requirements. Mew adds no separate link maintenance requirement in this mode.',
  },
  documentChecks: {
    required: 'After documentation changes, run the project’s existing documentation checks for metadata, links, or formatting as applicable, following execution restrictions. If no checker exists, inspect changed metadata and local links directly without introducing a new toolchain. Report only checks actually performed and any failures or blockers.',
    project: 'Follow the project’s documentation validation requirements. Mew adds no separate documentation check requirement in this mode.',
  },
} as const

export type GuidanceKey = keyof typeof guidanceOptions
export const documentationGuidanceKeys = ['documentation', 'decisionRecords', 'workRecords', 'documentWriting', 'documentDescriptions', 'documentLinks', 'documentChecks'] as const satisfies readonly GuidanceKey[]
export type DocumentationGuidanceKey = typeof documentationGuidanceKeys[number]
export type GuidanceSnapshot = {
  path: string
  content: string
  revision: string
  instructions?: string
  settings: Record<GuidanceKey, string>
  branch: BranchGuidanceSnapshot
  capacityRetry?: AgentCapacityRetrySettings
}
