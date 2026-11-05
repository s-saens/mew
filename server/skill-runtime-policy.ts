import { skillLibrary } from './skill-library.ts'

interface PolicySkill { name: string; description: string; path: string }
export interface RuntimeSkillPolicy {
  enabled: PolicySkill[]
  disabledNames: string[]
  excludedPaths: string[]
}

/** Native providers discover their own files; Mew supplies one current catalog instead. */
export function skillRuntimeEnvironment(runtime: string, env: NodeJS.ProcessEnv, policy: RuntimeSkillPolicy): NodeJS.ProcessEnv {
  if (runtime !== 'codex') return { ...env }
  const configured: unknown = env.CODEX_CONFIG ? JSON.parse(env.CODEX_CONFIG) : {}
  if (!isObject(configured)) throw new Error('CODEX_CONFIG must be a JSON object')
  const skills = isObject(configured.skills) ? configured.skills : {}
  const rules = Array.isArray(skills.config) ? skills.config : []
  return {
    ...env,
    CODEX_CONFIG: JSON.stringify({
      ...configured,
      skills: {
        ...skills,
        include_instructions: false,
        config: [
          ...rules,
          ...[...new Set(policy.disabledNames)].map(name => ({ name, enabled: false })),
          ...[...new Set(policy.excludedPaths)].map(path => ({ path, enabled: false })),
        ],
      },
    }),
  }
}

/** Claude's SDK allowlist filters its native catalog without suppressing user/project settings. */
export function skillRuntimeSessionOptions(runtime: string) {
  return runtime === 'claude' ? { _meta: { claudeCode: { options: { skills: [] as string[] } } } } : {}
}

export function currentSkillPolicy(cwd: string, native = false): RuntimeSkillPolicy {
  return skillLibrary.policy(cwd, { native })
}

export function skillLibraryPrompt(cwd: string, policy = currentSkillPolicy(cwd)): string {
  return [
    'Mew skills policy for this request:',
    'Use only the enabled catalog below for automatic skill and workflow selection. This current catalog replaces earlier Mew skill catalogs in this conversation. Provider metadata, external copies, and previously read skills do not authorize automatic use of an absent skill.',
    'Read an enabled skill\'s SKILL.md before following it. Its supporting dependencies may be read only as part of that enabled workflow; do not select those dependencies independently. Explicit user requests for other skills remain ordinary user instructions.',
    ...(policy.enabled.length ? policy.enabled.map(skill => `- ${skill.name}${skill.description ? `: ${skill.description.replace(/\s+/g, ' ').trim()}` : ''}\n  SKILL.md: ${JSON.stringify(skill.path)}`) : ['No skills are enabled.']),
  ].join('\n')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
