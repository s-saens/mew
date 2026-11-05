import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from './dataDir.ts'
import { parseConfig } from './harness-config.ts'
import { projectSettingsRoot } from './project-settings-root.ts'
import { readAgentSettings } from './agentSettings.ts'
import type { SkillImportCandidate, SkillLibraryDetail, SkillLibraryInventory, SkillLibraryItem, SkillLibraryMutation, SkillScope } from '../shared/skill-library.ts'

const PACKAGE_SKILLS = fileURLToPath(new URL('../resources/skills/', import.meta.url))
const COMMIT_SEED = fileURLToPath(new URL('./prompts/commit-skill.txt', import.meta.url))
const STATE_FILE = '.library.json'
const MAX_TEXT = 2 * 1024 * 1024
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/
const DEFAULT_NAMES = ['korean-technical-docs', 'english-technical-docs', 'japanese-technical-docs', 'chinese-technical-docs', 'commit']
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const identity = (...parts: string[]) => Buffer.from(JSON.stringify(parts)).toString('base64url')

interface LibraryState {
  version: 1
  disabled: string[]
  removedDefaults: string[]
  overrides: Record<string, boolean>
}
interface Entry { name: string; description: string; path: string; directory?: string; scope: SkillScope; builtin: boolean }
interface Snapshot { revision: string; files: string[]; linked: boolean }
interface CandidateEntry extends SkillImportCandidate { directory?: string }
interface LibraryIndex extends SkillLibraryInventory { entries: Map<string, Entry>; external: Map<string, CandidateEntry>; common: LibraryState; project: LibraryState; projectRoot: string; stateRevision: string }

export interface SkillLibraryEnvironment {
  home?: string
  env?: NodeJS.ProcessEnv
  runtimeEnvs?: Record<string, NodeJS.ProcessEnv>
  libraryDir?: string
  mewSkillsDir?: string
  documentationDir?: string
  commitSeed?: string
}

export class SkillLibraryError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function exists(file: string): boolean { try { fs.lstatSync(file); return true } catch { return false } }
function linked(file: string): boolean {
  let current = path.resolve(file)
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) return true } catch { /* Destinations may not exist yet. */ }
    if (path.dirname(current) === current) return false
    current = path.dirname(current)
  }
}
function assertWritable(file: string) {
  if (linked(file)) throw new SkillLibraryError('심볼릭 링크를 포함한 위치는 관리할 수 없습니다')
}
function readText(file: string): string {
  const stat = fs.statSync(file)
  if (!stat.isFile() || stat.size > MAX_TEXT) throw new SkillLibraryError('스킬 내용은 2MB 이하의 일반 텍스트 파일이어야 합니다')
  return fs.readFileSync(file, 'utf8')
}
function atomicWrite(file: string, content: string) {
  assertWritable(file)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = path.join(path.dirname(file), `.library-${randomUUID()}`)
  try { fs.writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file) }
  finally { fs.rmSync(temporary, { force: true }) }
}
function metadata(content: string, fallback: string): { name: string; description: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) return { name: fallback, description: '' }
  try {
    const data = parseConfig(match[1], 'yaml')
    return { name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : fallback, description: typeof data.description === 'string' ? data.description : '' }
  } catch { throw new SkillLibraryError('스킬 frontmatter 문법을 확인하세요') }
}
function emptyState(): LibraryState { return { version: 1, disabled: [], removedDefaults: [], overrides: {} } }
function readState(root: string): LibraryState {
  const file = path.join(root, STATE_FILE)
  if (!exists(file)) return emptyState()
  let value: unknown
  try { value = JSON.parse(readText(file)) } catch { throw new SkillLibraryError(`스킬 설정을 읽을 수 없습니다: ${file}`, 409) }
  if (!value || typeof value !== 'object') throw new SkillLibraryError('스킬 설정 형식이 올바르지 않습니다', 409)
  const state = value as LibraryState
  if (state.version !== 1 || !Array.isArray(state.disabled) || !Array.isArray(state.removedDefaults) || !state.overrides || typeof state.overrides !== 'object' || Array.isArray(state.overrides)
    || [...state.disabled, ...state.removedDefaults].some(name => typeof name !== 'string' || !NAME.test(name)) || Object.entries(state.overrides).some(([name, enabled]) => !NAME.test(name) || typeof enabled !== 'boolean')) throw new SkillLibraryError('스킬 설정 형식이 올바르지 않습니다', 409)
  return state
}
function snapshot(entry: { path: string; directory?: string }): Snapshot {
  if (!entry.directory) return { revision: hash(readText(entry.path)), files: [path.basename(entry.path)], linked: linked(entry.path) }
  const digest = createHash('sha256'), files: string[] = []
  let size = 0, hasLinks = linked(entry.directory), count = 0
  const visit = (directory: string) => {
    for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++count > 2000) throw new SkillLibraryError('스킬 파일 수가 너무 많습니다')
      const file = path.join(directory, child.name), relative = path.relative(entry.directory!, file)
      digest.update(`${relative}\0`)
      if (child.isSymbolicLink()) { hasLinks = true; files.push(relative); digest.update(fs.readlinkSync(file)); continue }
      if (child.isDirectory()) { visit(file); continue }
      if (!child.isFile()) throw new SkillLibraryError('특수 파일을 포함한 스킬은 가져올 수 없습니다')
      size += fs.statSync(file).size
      if (size > 32 * 1024 * 1024) throw new SkillLibraryError('스킬 폴더가 32MB를 초과합니다')
      files.push(relative); digest.update(fs.readFileSync(file))
    }
  }
  visit(entry.directory)
  return { revision: digest.digest('hex'), files, linked: hasLinks }
}

/** Resolve a project boundary without scanning child or sibling projects. */
export function skillProjectRoot(cwd: string): string {
  try { return projectSettingsRoot(cwd) }
  catch { throw new SkillLibraryError('프로젝트 폴더를 찾을 수 없습니다') }
}

/** Mew owns these registrations and never edits a runtime's native skill tree. */
export class SkillLibraryStore {
  readonly environment: SkillLibraryEnvironment
  readonly libraryDir: string
  private readonly defaultEnvironment: boolean
  constructor(environment?: SkillLibraryEnvironment) {
    this.defaultEnvironment = environment === undefined
    this.environment = environment ?? {}
    this.libraryDir = this.environment.libraryDir ?? this.environment.mewSkillsDir ?? path.join(DATA_DIR, 'skills')
  }

  private defaults(): Entry[] {
    const root = this.environment.documentationDir ?? PACKAGE_SKILLS
    return DEFAULT_NAMES.map(name => {
      const file = name === 'commit' ? this.environment.commitSeed ?? COMMIT_SEED : path.join(root, name, 'SKILL.md')
      const meta = metadata(readText(file), name)
      return { name, description: meta.description, path: file, ...(name === 'commit' ? {} : { directory: path.dirname(file) }), scope: 'common' as const, builtin: true }
    })
  }

  private managed(root: string, scope: SkillScope, defaults: Entry[], warnings: string[]): Entry[] {
    if (!exists(root)) return []
    const found: Entry[] = []
    for (const child of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.name.startsWith('.') || !NAME.test(child.name) || !child.isDirectory() && !child.isSymbolicLink()) continue
      const directory = path.join(root, child.name), file = path.join(directory, 'SKILL.md')
      if (!exists(file)) continue
      try {
        const meta = metadata(readText(file), child.name)
        if (!NAME.test(meta.name) || meta.name !== child.name) throw new SkillLibraryError('스킬 이름은 폴더 이름과 같아야 합니다')
        found.push({ ...meta, path: file, directory, scope, builtin: scope === 'common' && defaults.some(entry => entry.name === meta.name) })
      } catch { warnings.push(`스킬을 읽을 수 없습니다: ${file}`) }
    }
    return found
  }

  private candidates(projectRoot: string, warnings: string[], inspect: boolean): CandidateEntry[] {
    const home = this.environment.home ?? os.homedir(), environment = this.environment.env ?? process.env
    const runtimeEnvs = this.environment.runtimeEnvs ?? (this.defaultEnvironment ? Object.fromEntries(Object.entries(readAgentSettings()).map(([runtime, setting]) => [runtime, setting.env ?? {}])) : {})
    const envFor = (runtime: string): NodeJS.ProcessEnv => ({ ...environment, ...(runtime === 'claude' && environment.MEW_AGENT_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: environment.MEW_AGENT_CONFIG_DIR } : {}), ...runtimeEnvs[runtime] })
    const native: [string, string, string][] = [
      ['shared', '공통', '.agents/skills'], ['codex', 'Codex', '.codex/skills'], ['claude', 'Claude', '.claude/skills'],
      ['cursor', 'Cursor', '.cursor/skills'], ['opencode', 'OpenCode', '.opencode/skills'], ['kimi', 'Kimi Code', '.kimi-code/skills'],
      ['kimi', 'Kimi (이전 경로)', '.kimi/skills'], ['antigravity', 'Antigravity', '.agent/skills'], ['prime', 'Prime Agent', '.prime/agent/skills'], ['openclaw', 'OpenClaw', 'skills'],
    ]
    const global: [string, string, string][] = [
      ['shared', '공통', path.join(home, '.agents/skills')],
      ['codex', 'Codex', path.join(envFor('codex').CODEX_HOME || path.join(home, '.codex'), 'skills')],
      ['claude', 'Claude', path.join(envFor('claude').CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'skills')],
      ['cursor', 'Cursor', path.join(home, '.cursor/skills')],
      ['opencode', 'OpenCode', path.join(envFor('opencode').XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode/skills')],
      ['kimi', 'Kimi Code', path.join(envFor('kimi').KIMI_CODE_HOME || path.join(home, '.kimi-code'), 'skills')],
      ['kimi', 'Kimi (이전 경로)', path.join(home, '.kimi/skills')],
      ['antigravity', 'Antigravity', path.join(envFor('antigravity').GEMINI_HOME || path.join(home, '.gemini'), 'antigravity/skills')],
      ['antigravity', 'Antigravity CLI', path.join(home, '.gemini/antigravity-cli/skills')],
      ['prime', 'Prime Agent', path.join(home, '.prime/agent/skills')],
      ['hermes', 'Hermes', path.join(envFor('hermes').HERMES_HOME || path.join(home, '.hermes'), 'skills')],
      ['openclaw', 'OpenClaw', path.join(envFor('openclaw').OPENCLAW_STATE_DIR || path.join(home, '.openclaw'), 'skills')],
      ['codex', 'Codex 플러그인', path.join(envFor('codex').CODEX_HOME || path.join(home, '.codex'), 'plugins/cache')],
      ['claude', 'Claude 플러그인', path.join(envFor('claude').CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'plugins/cache')],
    ]
    const candidates: CandidateEntry[] = [], seen = new Set<string>()
    for (const [scope, roots] of [['project', native.map(([agent, label, directory]) => [agent, label, path.join(projectRoot, directory)])], ['common', global]] as [SkillScope, string[][]][]) {
      for (const [agent, label, root] of roots) {
        if (!exists(root)) continue
        let visited = 0
        const walked = new Set<string>()
        const add = (file: string, directory?: string) => {
          try {
            const real = fs.realpathSync(file)
            if (seen.has(real)) return
            const meta = metadata(readText(file), directory ? path.basename(directory) : path.basename(file, '.md'))
            const candidate = { path: file, directory }
            const state = inspect ? snapshot(candidate) : { revision: '', linked: linked(file) }
            seen.add(real)
            candidates.push({ ...meta, id: identity('external', scope, agent, file), path: file, directory, agent, scope, label, revision: state.revision, importable: !state.linked && NAME.test(meta.name), reason: state.linked ? '심볼릭 링크를 포함한 스킬은 원본 폴더에서 복사하세요' : !NAME.test(meta.name) ? '가져올 수 없는 스킬 이름입니다' : undefined })
          } catch { warnings.push(`외부 스킬을 읽을 수 없습니다: ${file}`) }
        }
        const walk = (directory: string, depth: number) => {
          if (++visited > 6000 || depth > 10) return
          try {
            const real = fs.realpathSync(directory)
            if (walked.has(real)) return
            walked.add(real)
            if (exists(path.join(directory, 'SKILL.md'))) { add(path.join(directory, 'SKILL.md'), directory); return }
            for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
              if (['.git', 'node_modules', '.vendor'].includes(child.name)) continue
              const full = path.join(directory, child.name)
              if (child.isDirectory() || child.isSymbolicLink() && fs.statSync(full).isDirectory()) walk(full, depth + 1)
              else if (directory === root && ['prime', 'kimi'].includes(agent) && child.isFile() && child.name.endsWith('.md') && !exists(path.join(directory, child.name.slice(0, -3), 'SKILL.md'))) add(full)
            }
          } catch { warnings.push(`외부 스킬 폴더를 읽을 수 없습니다: ${directory}`) }
        }
        walk(root, 0)
        if (visited > 6000) warnings.push(`외부 스킬 탐색 한도: ${root}`)
      }
    }
    return candidates.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
  }

  private index(cwd: string, options: { native?: boolean; inspect?: boolean } = { native: true, inspect: true }): LibraryIndex {
    const projectRoot = skillProjectRoot(cwd), projectDir = path.join(projectRoot, '.mew/skills')
    const common = readState(this.libraryDir), project = readState(projectDir), warnings: string[] = []
    const defaults = this.defaults(), commonEntries = this.managed(this.libraryDir, 'common', defaults, warnings), projectEntries = this.managed(projectDir, 'project', defaults, warnings)
    const byName = new Map<string, Entry>()
    for (const entry of defaults) if (!common.removedDefaults.includes(entry.name)) byName.set(entry.name, entry)
    for (const entry of commonEntries) if (!common.removedDefaults.includes(entry.name) || !entry.builtin) byName.set(entry.name, entry)
    for (const entry of projectEntries) byName.set(entry.name, entry)
    const external = options.native ? this.candidates(projectRoot, warnings, !!options.inspect) : [], entries = new Map<string, Entry>()
    const stateRevision = hash(JSON.stringify([common, project]))
    const items: SkillLibraryItem[] = []
    for (const entry of byName.values()) {
      try {
        const id = identity('library', entry.scope, entry.name), state = options.inspect ? snapshot(entry) : { revision: '', linked: linked(entry.path) }
        entries.set(id, entry)
        const commonEnabled = !common.disabled.includes(entry.name)
        const overridden = Object.hasOwn(project.overrides, entry.name)
        const enabled = entry.scope === 'project' ? !project.disabled.includes(entry.name) : overridden ? project.overrides[entry.name] : commonEnabled
        const sourceEntries = [entry,
          ...(entry.scope === 'project' ? commonEntries.filter(value => value.name === entry.name && (!value.builtin || !common.removedDefaults.includes(value.name))) : []),
          ...defaults.filter(value => value.name === entry.name && !common.removedDefaults.includes(value.name)),
        ]
        const origins = [...new Map(sourceEntries.map(source => [source.path, {
          id: source.path === entry.path ? id : identity('source', source.scope, source.name, source.path),
          label: source.builtin && !source.path.startsWith(`${this.libraryDir}${path.sep}`) ? 'Mew' : source.scope === 'common' ? '공통 라이브러리' : '프로젝트',
          path: source.path, agent: 'mew',
        }])).values(), ...external.filter(candidate => candidate.name === entry.name).map(({ id, label, path, agent }) => ({ id, label, path, agent }))]
        items.push({ id, name: entry.name, description: entry.description, path: entry.path, scope: entry.scope, enabled, enabledScope: entry.scope === 'project' || overridden ? 'project' : 'common', ...(entry.scope === 'common' ? { commonEnabled } : {}), source: entry.builtin ? 'builtin' : 'managed', editable: !state.linked && (!entry.builtin || entry.name === 'commit' || entry.path.startsWith(`${this.libraryDir}${path.sep}`)), revision: hash(`${state.revision}\0${stateRevision}`), origins, ...(entry.scope === 'project' ? { overridesCommon: defaults.some(value => value.name === entry.name) && !common.removedDefaults.includes(entry.name) || commonEntries.some(value => value.name === entry.name) } : {}) })
      } catch { warnings.push(`스킬을 읽을 수 없습니다: ${entry.path}`) }
    }
    return { items: items.sort((a, b) => a.name.localeCompare(b.name)), candidates: external.map(({ directory: _directory, ...candidate }) => candidate), defaults: defaults.map(({ name, description }) => ({ name, description, installed: !common.removedDefaults.includes(name) })), warnings: [...new Set(warnings)], entries, external: new Map(external.map(entry => [entry.id, entry])), common, project, projectRoot, stateRevision }
  }

  list(cwd: string): SkillLibraryInventory {
    const { items, candidates, defaults, warnings } = this.index(cwd)
    return { items, candidates, defaults, warnings }
  }

  resolve(cwd: string, _runtime?: string): SkillLibraryItem[] { return this.index(cwd, { native: false, inspect: false }).items.filter(item => item.enabled) }

  policy(cwd: string, options: { native?: boolean } = {}): { enabled: SkillLibraryItem[]; disabledNames: string[]; excludedPaths: string[] } {
    const index = this.index(cwd, { native: options.native, inspect: false }), enabled = index.items.filter(item => item.enabled)
    const activeNames = new Set(enabled.map(item => item.name))
    return { enabled, disabledNames: [...new Set([...index.common.removedDefaults, ...index.common.disabled, ...index.project.disabled, ...index.items.filter(item => !item.enabled).map(item => item.name), ...Object.entries(index.project.overrides).filter(([, value]) => !value).map(([name]) => name)])].filter(name => !activeNames.has(name)).sort(), excludedPaths: index.candidates.map(candidate => candidate.path) }
  }

  detail(cwd: string, id: string): SkillLibraryDetail {
    const index = this.index(cwd), item = index.items.find(item => item.id === id), candidate = index.external.get(id)
    const entry = item ? index.entries.get(id)! : candidate
    if (!entry) throw new SkillLibraryError('스킬이 변경되었거나 삭제되었습니다. 새로고침하세요', 404)
    const state = snapshot(entry)
    const { directory: _directory, ...publicCandidate } = candidate ?? {} as CandidateEntry
    return { ...(item ? { item } : { candidate: publicCandidate as SkillImportCandidate }), content: readText(entry.path), files: state.files, revision: item?.revision ?? candidate!.revision }
  }

  private writeState(root: string, state: LibraryState) {
    atomicWrite(path.join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`)
  }

  private target(index: LibraryIndex, scope?: SkillScope): string {
    if (scope !== 'common' && scope !== 'project') throw new SkillLibraryError('공통 또는 프로젝트 범위를 선택하세요')
    return scope === 'common' ? this.libraryDir : path.join(index.projectRoot, '.mew/skills')
  }

  private validateContent(content: unknown, name: string): string {
    if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > MAX_TEXT) throw new SkillLibraryError('스킬 내용은 비어 있지 않은 2MB 이하의 텍스트여야 합니다')
    const meta = metadata(content, name)
    if (meta.name !== name) throw new SkillLibraryError('frontmatter의 name은 스킬 이름과 같아야 합니다')
    return content
  }

  mutate(input: SkillLibraryMutation): void {
    const index = this.index(input.cwd)
    if (!['create', 'save', 'toggle', 'reset', 'delete', 'import', 'restore'].includes(input.action)) throw new SkillLibraryError('알 수 없는 스킬 작업입니다')
    if (input.action === 'restore') {
      const seed = this.defaults().find(entry => entry.name === input.name)
      if (!seed) throw new SkillLibraryError('기본 스킬을 찾을 수 없습니다', 404)
      if (!index.common.removedDefaults.includes(seed.name)) throw new SkillLibraryError('이미 추가된 기본 스킬입니다', 409)
      if (seed.name === 'commit' && exists(path.join(this.libraryDir, 'commit'))) throw new SkillLibraryError('같은 이름의 스킬 폴더가 이미 있습니다', 409)
      if (seed.name === 'commit') atomicWrite(path.join(this.libraryDir, 'commit/SKILL.md'), readText(seed.path))
      index.common.removedDefaults = index.common.removedDefaults.filter(name => name !== seed.name)
      index.common.disabled = index.common.disabled.filter(name => name !== seed.name)
      this.writeState(this.libraryDir, index.common)
      return
    }
    if (input.action === 'create' || input.action === 'import') {
      const root = this.target(index, input.scope), candidate = input.action === 'import' ? index.external.get(input.id ?? '') : undefined
      if (input.action === 'import' && !candidate) throw new SkillLibraryError('외부 스킬을 찾을 수 없습니다', 404)
      if (candidate && (!candidate.importable || input.revision !== candidate.revision)) throw new SkillLibraryError(candidate.reason || '외부 스킬이 변경되었습니다. 새로고침하세요', candidate.importable ? 409 : 400)
      const name = input.name?.trim() || candidate?.name || ''
      if (!NAME.test(name)) throw new SkillLibraryError('스킬 이름은 영문·숫자로 시작하는 영문·숫자·점·밑줄·하이픈 100자 이내여야 합니다')
      if (candidate && name !== candidate.name) throw new SkillLibraryError('가져올 때 스킬 이름을 바꿀 수 없습니다')
      const destination = path.join(root, name)
      if (exists(destination) || input.scope === 'common' && this.defaults().some(entry => entry.name === name) && !index.common.removedDefaults.includes(name)) throw new SkillLibraryError('같은 이름의 스킬이 이미 있습니다', 409)
      assertWritable(destination)
      const content = this.validateContent(candidate ? readText(candidate.path) : input.content, name)
      if (candidate) {
        const current = snapshot(candidate)
        if (current.linked) throw new SkillLibraryError('심볼릭 링크를 포함한 스킬은 가져올 수 없습니다')
        if (current.revision !== input.revision) throw new SkillLibraryError('외부 스킬이 변경되었습니다. 새로고침하세요', 409)
      }
      fs.mkdirSync(root, { recursive: true, mode: 0o700 })
      const temporary = fs.mkdtempSync(path.join(root, '.import-'))
      try {
        if (candidate?.directory) fs.cpSync(candidate.directory, path.join(temporary, 'skill'), { recursive: true, dereference: false, errorOnExist: true })
        else fs.mkdirSync(path.join(temporary, 'skill'))
        if (candidate?.directory) {
          const copied = snapshot({ path: path.join(temporary, 'skill/SKILL.md'), directory: path.join(temporary, 'skill') })
          if (copied.linked) throw new SkillLibraryError('심볼릭 링크를 포함한 스킬은 가져올 수 없습니다')
          if (copied.revision !== candidate.revision) throw new SkillLibraryError('복사 중 외부 스킬이 변경되었습니다. 새로고침하세요', 409)
        }
        fs.writeFileSync(path.join(temporary, 'skill/SKILL.md'), content, { mode: 0o600 })
        fs.renameSync(path.join(temporary, 'skill'), destination)
      } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
      const state = input.scope === 'common' ? index.common : index.project
      state.disabled = state.disabled.filter(value => value !== name)
      if (input.scope === 'common') state.removedDefaults = state.removedDefaults.filter(value => value !== name)
      this.writeState(root, state)
      return
    }
    const item = index.items.find(item => item.id === input.id), entry = index.entries.get(input.id ?? '')
    if (!item || !entry) throw new SkillLibraryError('스킬이 변경되었거나 삭제되었습니다. 새로고침하세요', 404)
    if (input.revision !== item.revision) throw new SkillLibraryError('다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요', 409)
    if (input.action === 'toggle' || input.action === 'reset') {
      const scope = input.scope ?? item.scope
      if (scope !== 'common' && scope !== 'project' || item.scope === 'project' && scope !== 'project') throw new SkillLibraryError('스킬의 적용 범위를 확인하세요')
      const state = scope === 'common' ? index.common : index.project
      if (input.action === 'reset') {
        if (scope !== 'project' || item.scope !== 'common') throw new SkillLibraryError('공통 스킬의 프로젝트 설정만 초기화할 수 있습니다')
        delete state.overrides[item.name]
      } else {
        if (typeof input.enabled !== 'boolean') throw new SkillLibraryError('스킬의 활성 상태를 지정하세요')
        if (item.scope === 'common' && scope === 'project') state.overrides[item.name] = input.enabled
        else state.disabled = input.enabled ? state.disabled.filter(name => name !== item.name) : [...new Set([...state.disabled, item.name])]
      }
      this.writeState(this.target(index, scope), state)
      return
    }
    const root = this.target(index, item.scope)
    if (input.action === 'save') {
      if (!item.editable) throw new SkillLibraryError('기본 문서 스킬은 내용을 편집할 수 없습니다')
      const content = this.validateContent(input.content, item.name)
      const destination = entry.builtin && !entry.directory ? path.join(root, item.name, 'SKILL.md') : entry.path
      atomicWrite(destination, content)
      return
    }
    const state = item.scope === 'common' ? index.common : index.project
    if (entry.directory && entry.path.startsWith(`${root}${path.sep}`)) {
      assertWritable(entry.directory)
      if (snapshot(entry).linked) throw new SkillLibraryError('심볼릭 링크를 포함한 스킬은 원본 폴더에서 관리하세요')
    }
    state.disabled = [...new Set([...state.disabled, item.name])]
    if (item.scope === 'project' && item.overridesCommon) state.overrides[item.name] = false
    if (entry.builtin) state.removedDefaults = [...new Set([...state.removedDefaults, item.name])]
    // Persist the removal before deleting content so packaged defaults cannot reappear.
    this.writeState(root, state)
    if (entry.directory && entry.path.startsWith(`${root}${path.sep}`)) fs.rmSync(entry.directory, { recursive: true })
  }
}

export const skillLibrary = new SkillLibraryStore()
