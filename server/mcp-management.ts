import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { atKeys, parseConfig, patchConfig } from './harness-config.ts'
import { projectSettingsRoot } from './project-settings-root.ts'
import { normalizeSharedMcpConfig, sharedMcpDirectory, SHARED_MCP_FILE } from './shared-mcp.ts'
import type { SharedMcpConfig } from './shared-mcp.ts'
import type { McpManagementInventory, McpManagementMutation, McpManagementRevision, McpUsageState } from '../shared/mcp-management.ts'

const MANAGEMENT_FILE = 'management.json'
const PROJECT_FILE = 'mcp-usage.json'
const CLOUDFLARE_GROUP = 'cloudflare'
export const CLOUDFLARE_MCP_URL = 'https://mcp.cloudflare.com/mcp'
const MAX_BYTES = 2 * 1024 * 1024
type Preferences = { servers: Record<string, boolean>; groups: Record<string, boolean> }
interface ManagementState {
  version: 1
  groups: Array<{ id: string; name: string }>
  assignments: Record<string, string | null>
  usage: Preferences
}
interface ProjectState { version: 1; usage: Preferences }
interface Index {
  inventory: McpManagementInventory
  common: ManagementState
  project: ProjectState
  configs: Map<string, SharedMcpConfig>
  registryText: string
  commonFile: string
  projectFile: string
}

export class McpManagementError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const dictionary = <T>(): Record<string, T> => Object.create(null) as Record<string, T>
const preferences = (): Preferences => ({ servers: dictionary(), groups: dictionary() })
const emptyCommon = (): ManagementState => ({ version: 1, groups: [], assignments: dictionary(), usage: preferences() })
const emptyProject = (): ProjectState => ({ version: 1, usage: preferences() })
const own = (value: object, key: string) => Object.hasOwn(value, key)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function readText(file: string): string | null {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new McpManagementError('MCP 설정은 2MB 이하의 일반 파일이어야 합니다', 409)
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function readPreferences(value: unknown): Preferences {
  if (!isRecord(value) || !isRecord(value.servers) || !isRecord(value.groups)) throw new Error('usage')
  const result = preferences()
  for (const kind of ['servers', 'groups'] as const) {
    const entries = value[kind]
    if (!isRecord(entries)) throw new Error('usage')
    for (const [name, enabled] of Object.entries(entries)) {
      if (!name || name.includes('\0') || typeof enabled !== 'boolean') throw new Error('usage')
      result[kind][name] = enabled
    }
  }
  return result
}

function readState(text: string | null, common: true): ManagementState
function readState(text: string | null, common: false): ProjectState
function readState(text: string | null, common: boolean): ManagementState | ProjectState {
  if (text === null) return common ? emptyCommon() : emptyProject()
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value) || value.version !== 1) throw new Error('version')
    const usage = readPreferences(value.usage)
    if (!common) return { version: 1, usage }
    if (!Array.isArray(value.groups) || !isRecord(value.assignments)) throw new Error('groups')
    const groups = value.groups.map(group => {
      if (!isRecord(group) || typeof group.id !== 'string' || !/^group-[a-f0-9-]{36}$/.test(group.id) || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 80) throw new Error('group')
      return { id: group.id, name: group.name }
    })
    if (new Set(groups.map(group => group.id)).size !== groups.length) throw new Error('group')
    const ids = new Set([CLOUDFLARE_GROUP, ...groups.map(group => group.id)])
    const assignments = dictionary<string | null>()
    for (const [name, group] of Object.entries(value.assignments)) {
      if (!name || name.includes('\0') || group !== null && (typeof group !== 'string' || !ids.has(group))) throw new Error('assignment')
      assignments[name] = group as string | null
    }
    return { version: 1, groups, assignments, usage }
  } catch { throw new McpManagementError('MCP 관리 설정 형식이 올바르지 않습니다. 원본 파일을 확인하세요.', 409) }
}

function assertWritable(file: string) {
  let current = path.resolve(file)
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new McpManagementError('심볼릭 링크 위치의 MCP 설정은 변경할 수 없습니다') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (path.dirname(current) === current) break
    current = path.dirname(current)
  }
}

function atomicWrite(file: string, text: string) {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new McpManagementError('MCP 설정 파일은 2MB 이하여야 합니다')
  assertWritable(file)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = path.join(path.dirname(file), `.mcp-${randomUUID()}`)
  try {
    fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally { fs.rmSync(temporary, { force: true }) }
}

/** Only official remote MCP hosts are inferred; names and lookalike suffixes are ignored. */
export function isCloudflareMcp(config: Pick<SharedMcpConfig, 'url'>): boolean {
  if (!config.url) return false
  try {
    const url = new URL(config.url)
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'mcp.cloudflare.com' || url.hostname.endsWith('.mcp.cloudflare.com'))
  } catch { return false }
}

function unified(config: SharedMcpConfig): boolean {
  if (!config.url || config.type === 'sse') return false
  const url = new URL(config.url)
  return url.href === CLOUDFLARE_MCP_URL
}

function endpoint(config: SharedMcpConfig): string {
  if (!config.url) return 'stdio'
  const url = new URL(config.url)
  // Paths and queries can carry API keys; the origin identifies the host safely.
  return url.origin
}

function usage(id: string, common: Record<string, boolean>, project: Record<string, boolean>, fallback = true): McpUsageState {
  const shared = own(common, id) ? common[id] : fallback
  const local = own(project, id) ? project[id] : null
  return { common: shared, project: local, enabled: local ?? shared }
}

function sameRevision(actual: McpManagementRevision, expected: McpManagementRevision | undefined) {
  if (!expected || (['registry', 'common', 'project'] as const).some(key => actual[key] !== expected[key])) throw new McpManagementError('MCP 설정이 다른 곳에서 변경되었습니다. 새로 고친 뒤 다시 시도하세요.', 409)
}

function groupName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new McpManagementError('묶음 이름은 1~80자로 입력하세요')
  return value.trim()
}

/** Definitions and credentials remain in their existing registry; metadata only controls usage. */
export class McpManagementStore {
  readonly directory: string
  constructor(directory = sharedMcpDirectory()) { this.directory = directory }

  private index(cwd: string): Index {
    const projectRoot = projectSettingsRoot(cwd)
    const commonFile = path.join(this.directory, MANAGEMENT_FILE), projectFile = path.join(projectRoot, '.mew', PROJECT_FILE)
    const registryText = readText(path.join(this.directory, SHARED_MCP_FILE)) ?? '', commonText = readText(commonFile), projectText = readText(projectFile)
    const common = readState(commonText, true), project = readState(projectText, false)
    const configs = new Map<string, SharedMcpConfig>()
    if (registryText) {
      try {
        for (const [name, config] of Object.entries(atKeys(parseConfig(registryText, 'json'), ['mcpServers']))) configs.set(name, normalizeSharedMcpConfig(config))
      } catch { throw new McpManagementError('MCP 연결 설정을 읽지 못했습니다. 원본 파일을 확인하세요.', 409) }
    }
    const groupDefinitions = [{ id: CLOUDFLARE_GROUP, name: 'Cloudflare', suggested: true }, ...common.groups.map(group => ({ ...group, suggested: false }))]
    const servers = [...configs].sort(([a], [b]) => a.localeCompare(b)).map(([name, config]) => {
      const assigned = own(common.assignments, name)
      const groupId = assigned ? common.assignments[name] : isCloudflareMcp(config) ? CLOUDFLARE_GROUP : null
      const preference = usage(name, common.usage.servers, project.usage.servers, config.enabled !== false)
      const gate = groupId === null || usage(groupId, common.usage.groups, project.usage.groups).enabled
      return { name, endpoint: endpoint(config), transport: config.url ? config.type ?? 'http' : 'stdio' as const, groupId, inferredGroup: !assigned && groupId !== null, usage: preference, effectiveEnabled: preference.enabled && gate }
    })
    const groups = groupDefinitions.map(group => ({ ...group, usage: usage(group.id, common.usage.groups, project.usage.groups), members: servers.filter(server => server.groupId === group.id).map(server => server.name), enabledCount: servers.filter(server => server.groupId === group.id && server.effectiveEnabled).length }))
      .filter(group => !group.suggested || group.members.length > 0 || own(common.usage.groups, group.id) || own(project.usage.groups, group.id))
    const existingUnified = [...configs].find(([, config]) => unified(config))?.[0] ?? null
    let suggestedName = 'cloudflare'
    for (let suffix = 2; configs.has(suggestedName); suffix++) suggestedName = `cloudflare-${suffix}`
    const inventory: McpManagementInventory = {
      revision: { registry: hash(registryText), common: hash(commonText ?? ''), project: hash(projectText ?? '') }, projectRoot, servers, groups,
      cloudflare: { url: CLOUDFLARE_MCP_URL, existingUnified, suggestedName: existingUnified ?? suggestedName,
        candidates: servers.filter(server => isCloudflareMcp(configs.get(server.name)!)).map(server => ({ name: server.name, endpoint: server.endpoint, unified: unified(configs.get(server.name)!), effectiveEnabled: server.effectiveEnabled })) },
    }
    return { inventory, configs, common, project, registryText, commonFile, projectFile }
  }

  list(cwd: string): McpManagementInventory { return this.index(cwd).inventory }

  private saveRegistration(index: Index, addition: { name: string; config: SharedMcpConfig } | null, writeProject: boolean) {
    assertWritable(index.commonFile)
    if (writeProject) assertWritable(index.projectFile)
    if (addition) {
      const content = patchConfig(index.registryText, 'json', ['mcpServers'], addition.name, addition.config)
      atomicWrite(path.join(this.directory, SHARED_MCP_FILE), content)
    }
    try {
      atomicWrite(index.commonFile, `${JSON.stringify(index.common, null, 2)}\n`)
      if (writeProject) atomicWrite(index.projectFile, `${JSON.stringify(index.project, null, 2)}\n`)
    } catch {
      throw new McpManagementError('MCP 연결은 보존되었지만 사용 설정을 모두 저장하지 못했습니다. 새로 고친 뒤 상태를 확인하세요.', 409)
    }
  }

  mutate(input: McpManagementMutation): McpManagementInventory {
    const index = this.index(input.cwd)
    sameRevision(index.inventory.revision, input.revision)
    const { common, project, configs } = index
    const groupExists = (id: string) => id === CLOUDFLARE_GROUP || common.groups.some(group => group.id === id)
    const assertNames = (names: unknown): string[] => {
      if (!Array.isArray(names) || names.length > configs.size || names.some(name => typeof name !== 'string' || !configs.has(name))) throw new McpManagementError('MCP 연결을 찾을 수 없습니다', 404)
      return [...new Set(names)]
    }
    let writeCommon = true, writeProject = false
    switch (input.action) {
      case 'create-server': {
        if (!['common', 'project'].includes(input.scope) || typeof input.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.name)) throw new McpManagementError('새 MCP 이름과 적용 범위를 확인하세요')
        if (configs.has(input.name)) throw new McpManagementError('같은 이름의 MCP 연결이 있습니다', 409)
        if (typeof input.content !== 'string' || Buffer.byteLength(input.content, 'utf8') > MAX_BYTES) throw new McpManagementError('MCP 연결 설정은 2MB 이하여야 합니다')
        let config: SharedMcpConfig
        try { config = normalizeSharedMcpConfig(parseConfig(input.content, 'json')) }
        catch { throw new McpManagementError('MCP 연결 설정을 확인하세요') }
        const projectOnly = input.scope === 'project'
        common.usage.servers[input.name] = projectOnly ? false : config.enabled !== false
        if (projectOnly) project.usage.servers[input.name] = true
        this.saveRegistration(index, { name: input.name, config: { ...config, ...(projectOnly ? { enabled: false } : {}) } }, projectOnly)
        return this.list(input.cwd)
      }
      case 'usage': {
        if (!['common', 'project'].includes(input.scope) || !['server', 'group'].includes(input.target) || input.enabled !== null && typeof input.enabled !== 'boolean') throw new McpManagementError('MCP 사용 설정을 확인하세요')
        if (input.target === 'server' ? !configs.has(input.id) : !groupExists(input.id)) throw new McpManagementError('MCP 연결 또는 묶음을 찾을 수 없습니다', 404)
        if (input.scope === 'common' && input.enabled === null) throw new McpManagementError('공통 사용 설정에는 켜짐 또는 꺼짐이 필요합니다')
        const target = (input.scope === 'common' ? common : project).usage[input.target === 'server' ? 'servers' : 'groups']
        if (input.enabled === null) delete target[input.id]
        else target[input.id] = input.enabled
        writeCommon = input.scope === 'common'; writeProject = input.scope === 'project'
        break
      }
      case 'create-group': {
        const name = groupName(input.name), names = assertNames(input.members ?? [])
        if ([...common.groups.map(group => group.name), 'Cloudflare'].some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new McpManagementError('같은 이름의 묶음이 있습니다', 409)
        const id = `group-${randomUUID()}`
        common.groups.push({ id, name })
        for (const member of names) common.assignments[member] = id
        break
      }
      case 'rename-group': {
        const group = common.groups.find(group => group.id === input.id)
        if (!group) throw new McpManagementError('사용자 묶음을 찾을 수 없습니다', 404)
        const name = groupName(input.name)
        if ([{ id: CLOUDFLARE_GROUP, name: 'Cloudflare' }, ...common.groups].some(other => other.id !== group.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new McpManagementError('같은 이름의 묶음이 있습니다', 409)
        group.name = name
        break
      }
      case 'remove-group': {
        if (!common.groups.some(group => group.id === input.id)) throw new McpManagementError('사용자 묶음을 찾을 수 없습니다', 404)
        common.groups = common.groups.filter(group => group.id !== input.id)
        for (const [name, group] of Object.entries(common.assignments)) if (group === input.id) common.assignments[name] = null
        delete common.usage.groups[input.id]
        break
      }
      case 'assign': {
        if (input.groupId !== null && !groupExists(input.groupId)) throw new McpManagementError('묶음을 찾을 수 없습니다', 404)
        for (const name of assertNames(input.names)) common.assignments[name] = input.groupId
        break
      }
      case 'consolidate-cloudflare': {
        if (!['common', 'project'].includes(input.scope)) throw new McpManagementError('MCP 적용 범위를 확인하세요')
        const names = assertNames(input.disable)
        if (names.some(name => !isCloudflareMcp(configs.get(name)!) || unified(configs.get(name)!))) throw new McpManagementError('대체할 Cloudflare 연결을 확인하세요')
        const existing = index.inventory.cloudflare.existingUnified
        const name = existing ?? input.name
        if (!existing && (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name))) throw new McpManagementError('새 MCP 이름을 확인하세요')
        if (!existing && configs.has(name)) throw new McpManagementError('같은 이름의 MCP 연결이 있습니다', 409)
        const target = input.scope === 'common' ? common : project
        // A project-only addition must not activate its new registration elsewhere.
        if (!existing && input.scope === 'project') common.usage.servers[name] = false
        target.usage.servers[name] = true
        const groupId = existing ? index.inventory.servers.find(server => server.name === existing)!.groupId : CLOUDFLARE_GROUP
        if (groupId !== null) target.usage.groups[groupId] = true
        for (const replaced of names) target.usage.servers[replaced] = false
        if (!existing) common.assignments[name] = CLOUDFLARE_GROUP
        // Validate every destination before adding a definition. A later disk failure
        // preserves both connections and reports partial completion explicitly.
        this.saveRegistration(index, existing ? null : { name, config: { type: 'http', url: CLOUDFLARE_MCP_URL, ...(input.scope === 'project' ? { enabled: false } : {}) } }, input.scope === 'project')
        return this.list(input.cwd)
      }
      default: throw new McpManagementError('지원하지 않는 MCP 관리 작업입니다')
    }
    if (writeCommon) atomicWrite(index.commonFile, `${JSON.stringify(common, null, 2)}\n`)
    if (writeProject) atomicWrite(index.projectFile, `${JSON.stringify(project, null, 2)}\n`)
    return this.list(input.cwd)
  }
}

/** Resolve settings only; connection readiness is selected separately without network work. */
export function resolveMcpUsage(cwd: string, directory = sharedMcpDirectory()): { enabledNames: Set<string>; include: (name: string) => boolean } {
  const inventory = new McpManagementStore(directory).list(cwd)
  const enabledNames = new Set(inventory.servers.filter(server => server.effectiveEnabled).map(server => server.name))
  return { enabledNames, include: name => enabledNames.has(name) }
}
