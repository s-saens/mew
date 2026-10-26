import type { BranchGuidanceSnapshot } from './branch-guidance.ts'

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
} as const

export type GuidanceKey = keyof typeof guidanceOptions
export type GuidanceSnapshot = {
  path: string
  content: string
  revision: string
  instructions?: string
  settings: Record<GuidanceKey, string>
  branch: BranchGuidanceSnapshot
}
