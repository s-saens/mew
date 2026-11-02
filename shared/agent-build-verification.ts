export type AgentBuildVerificationSettings = {
  mode: 'required' | 'project'
  command: string
  scope: 'implementation' | 'all'
  fixFailures: boolean
}

export type AgentBuildVerificationSnapshot = { value: AgentBuildVerificationSettings; custom: boolean }

export const defaultAgentBuildVerificationSettings: AgentBuildVerificationSettings = {
  mode: 'required',
  command: '',
  scope: 'implementation',
  fixFailures: true,
}

export const AGENT_BUILD_COMMAND_MAX_LENGTH = 1000

function hasCommandControlCharacters(command: string): boolean {
  return Array.from(command).some(character => {
    const code = character.charCodeAt(0)
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029
  })
}

/** Shared by API writes, stored metadata parsing, and the settings form. */
export function agentBuildVerificationValidationError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '올바른 빌드 검증 설정을 입력하세요.'
  const item = value as Record<string, unknown>
  const keys = Object.keys(defaultAgentBuildVerificationSettings)
  if (Object.keys(item).length !== keys.length || Object.keys(item).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(item, key))) return '알 수 없거나 누락된 빌드 검증 설정 항목이 있습니다.'
  if (!['required', 'project'].includes(item.mode as string)) return '올바른 빌드 검증 방식을 선택하세요.'
  if (typeof item.command !== 'string' || item.command.length > AGENT_BUILD_COMMAND_MAX_LENGTH || hasCommandControlCharacters(item.command) || /<!--\s*\/?mew:/i.test(item.command)) return `빌드 명령은 줄바꿈이나 설정 표시 없이 ${AGENT_BUILD_COMMAND_MAX_LENGTH}자 이내로 입력하세요.`
  if (!['implementation', 'all'].includes(item.scope as string)) return '올바른 빌드 검증 범위를 선택하세요.'
  if (typeof item.fixFailures !== 'boolean') return '빌드 실패 자동 수정 여부를 선택하세요.'
  return null
}

/** Stable, versioned metadata and exact text preserve handwritten instructions. */
export function agentBuildVerificationText(settings: AgentBuildVerificationSettings): string {
  const ordered = Object.fromEntries(Object.keys(defaultAgentBuildVerificationSettings).map(key => [key, settings[key as keyof AgentBuildVerificationSettings]]))
  const metadata = `<!-- mew:agent-build-verification:v1 ${JSON.stringify(ordered)} -->`
  if (settings.mode === 'project') return `${metadata}\nFollow the project's build verification requirements. Mew adds no separate build requirement in this mode.`
  const scope = settings.scope === 'all'
    ? 'After any project changes, including documentation-only changes, run the project build before reporting completion.'
    : 'After code, feature, dependency, or build configuration changes, run the project build before reporting completion. Documentation-only changes do not require a build.'
  const command = settings.command.trim()
    ? `Use the configured build command ${JSON.stringify(settings.command.trim())}.`
    : "Choose the build command from the project's documented build process, package manager, and existing build script; for an npm project with a build script, use npm run build. If the project has no build system, report build verification as not applicable. Do not invent a build command or install a toolchain just to satisfy this instruction."
  const failure = settings.fixFailures
    ? 'Fix build failures and rerun the build before reporting completion. If a failure or missing prerequisite blocks success, report the actual failure and keep the work explicitly incomplete.'
    : 'If the build fails, report the actual failure and keep the work explicitly incomplete. Do not automatically repair build failures under this setting.'
  return [metadata, scope, command, failure, 'Respect explicit user instructions and project execution restrictions. Applicable tests, type checks, lint, and documentation checks remain required; they do not replace build verification.'].join('\n')
}
