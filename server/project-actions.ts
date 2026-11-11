import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ProjectAction, ProjectActionArtifact, ProjectActionRun, ProjectActionsState } from '../shared/project-actions.ts'
import { assertNotServerDataPath } from './paths.ts'
import { discoverProjectActions } from './project-actions-discovery.ts'

const CONFIG_FILE = 'project-actions.json'
const MAX_CONFIG_BYTES = 262_144
const MAX_OUTPUT = 131_072
const MAX_HISTORY = 20
const MAX_TOTAL_HISTORY = 200
const MAX_ARTIFACTS = 100
const MAX_SCAN_ENTRIES = 10_000

export class ProjectActionError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function relativePath(value: string): boolean {
  return !!value && value.length <= 500 && !path.isAbsolute(value) && !/[\\\0\r\n]/.test(value)
    && !value.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

export function normalizeProjectActions(input: unknown): ProjectAction[] {
  if (!Array.isArray(input) || input.length > 50) throw new ProjectActionError('빌드·배포 작업은 최대 50개까지 배열로 입력하세요.')
  const ids = new Set<string>()
  return input.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ProjectActionError('작업 형식이 올바르지 않습니다.')
    const record = item as Record<string, unknown>
    const { id, kind, variant } = record
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const command = typeof record.command === 'string' ? record.command.trim() : ''
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id) || ids.has(id)) throw new ProjectActionError('작업 ID는 고유한 영문·숫자 식별자로 입력하세요.')
    if (!name || name.length > 80 || !command || command.length > 4_000 || command.includes('\0')) throw new ProjectActionError('작업 이름(80자 이하)과 명령어(4,000자 이하)를 입력하세요.')
    if (kind !== 'build' && kind !== 'deploy' || variant !== undefined && !['debug', 'release', 'custom'].includes(String(variant))) throw new ProjectActionError('빌드·배포 종류가 올바르지 않습니다.')
    let previewUrl: string | undefined
    if (record.previewUrl !== undefined && record.previewUrl !== '') {
      if (typeof record.previewUrl !== 'string' || record.previewUrl.length > 2_000) throw new ProjectActionError('미리보기 주소가 올바르지 않습니다.')
      try {
        const url = new URL(record.previewUrl)
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid URL')
        previewUrl = url.href
      } catch { throw new ProjectActionError('미리보기 주소는 HTTP 또는 HTTPS 주소를 입력하세요.') }
    }
    if (record.artifacts !== undefined && (!Array.isArray(record.artifacts) || record.artifacts.length > 20
      || !record.artifacts.every(pattern => typeof pattern === 'string' && relativePath(pattern)))) throw new ProjectActionError('다운로드 파일 패턴은 프로젝트 안의 상대 경로로 입력하세요.')
    ids.add(id)
    return { id, name, kind, command, ...(variant ? { variant: variant as ProjectAction['variant'] } : {}),
      ...(previewUrl ? { previewUrl } : {}), ...(record.artifacts !== undefined ? { artifacts: [...record.artifacts as string[]] } : {}) }
  })
}

function rootDirectory(root: string): string {
  const canonical = fs.realpathSync(root)
  assertNotServerDataPath(canonical)
  if (!fs.statSync(canonical).isDirectory()) throw new ProjectActionError('프로젝트 폴더가 필요합니다.')
  return canonical
}

function configFile(root: string): string {
  const directory = path.join(root, '.mew'), file = path.join(directory, CONFIG_FILE)
  if (fs.existsSync(directory) && !fs.lstatSync(directory).isDirectory()) throw new ProjectActionError('.mew 설정 폴더는 실제 폴더여야 합니다.')
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new ProjectActionError('빌드·배포 설정은 256KB 이하의 일반 파일이어야 합니다.')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return file
}

interface Configuration { actions: ProjectAction[]; warnings: string[]; saved: boolean; invalid: boolean }
function readConfiguration(root: string): Configuration {
  try {
    const file = configFile(root)
    let raw: string
    try { raw = fs.readFileSync(file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...discoverProjectActions(root), saved: false, invalid: false }
      throw error
    }
    const parsed = JSON.parse(raw) as { version?: unknown; actions?: unknown }
    if (parsed?.version !== 1) throw new Error('Unsupported configuration')
    return { actions: normalizeProjectActions(parsed.actions), warnings: [], saved: true, invalid: false }
  } catch { return { actions: [], warnings: ['빌드·배포 설정을 읽을 수 없습니다. 프로젝트 작업은 계속할 수 있습니다. 에이전트로 설정을 수정하거나 작업 목록을 다시 저장하세요.'], saved: true, invalid: true } }
}

function writeConfiguration(root: string, actions: ProjectAction[]): void {
  const content = `${JSON.stringify({ version: 1, actions }, null, 2)}\n`
  if (Buffer.byteLength(content, 'utf8') > MAX_CONFIG_BYTES) throw new ProjectActionError('빌드·배포 설정은 256KB 이하여야 합니다.')
  const file = configFile(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temporary, content, { flag: 'wx' }); fs.renameSync(temporary, file) }
  finally { try { fs.unlinkSync(temporary) } catch { /* Already renamed or never created. */ } }
}

function allowedArtifact(relative: string): boolean {
  return relativePath(relative) && !relative.split('/').some(segment => segment.startsWith('.')
    || ['node_modules', 'users.json', 'sessions.json', 'credentials.json', 'secrets.json', 'accounts.json', 'access-policy.json'].includes(segment.toLowerCase()))
}

function artifactFile(root: string, relative: string): string {
  if (!allowedArtifact(relative)) throw new ProjectActionError('다운로드할 수 없는 파일 경로입니다.', 403)
  let current = root
  for (const segment of relative.split('/')) {
    current = path.join(current, segment)
    if (fs.lstatSync(current).isSymbolicLink()) throw new ProjectActionError('링크 파일은 다운로드할 수 없습니다.', 403)
  }
  const canonical = fs.realpathSync(current), within = path.relative(root, canonical)
  if (!within || within.startsWith(`..${path.sep}`) || within === '..' || path.isAbsolute(within) || !fs.statSync(canonical).isFile()) throw new ProjectActionError('프로젝트 안의 일반 파일만 다운로드할 수 있습니다.', 403)
  assertNotServerDataPath(canonical)
  return canonical
}

function collectArtifacts(root: string, patterns: string[]): ProjectActionArtifact[] {
  const files = new Set<string>()
  let scanned = 0
  for (const pattern of patterns) {
    const firstGlob = pattern.search(/[?*[{]/)
    if (firstGlob < 0) { try { artifactFile(root, pattern); files.add(pattern) } catch { /* Missing or protected output. */ }; continue }
    const prefix = pattern.slice(0, firstGlob), slash = prefix.lastIndexOf('/')
    const base = slash < 0 ? '' : prefix.slice(0, slash)
    const queue = [base]
    while (queue.length && scanned < MAX_SCAN_ENTRIES && files.size < MAX_ARTIFACTS) {
      const directory = queue.pop()!
      if (directory && !allowedArtifact(directory)) continue
      let entries: fs.Dirent[]
      try {
        // Validate every parent so an output directory cannot redirect discovery outside the root.
        let parent = root
        for (const segment of directory.split('/').filter(Boolean)) { parent = path.join(parent, segment); if (!fs.lstatSync(parent).isDirectory()) throw new Error('Not a directory') }
        entries = fs.readdirSync(parent, { withFileTypes: true })
      } catch { continue }
      for (const entry of entries) {
        if (++scanned > MAX_SCAN_ENTRIES || files.size >= MAX_ARTIFACTS) break
        const relative = directory ? `${directory}/${entry.name}` : entry.name
        if (!allowedArtifact(relative)) continue
        if (entry.isDirectory()) queue.push(relative)
        else if (entry.isFile() && path.matchesGlob(relative, pattern)) { try { artifactFile(root, relative); files.add(relative) } catch { /* Unsafe or removed output. */ } }
      }
    }
  }
  return [...files].sort().slice(0, MAX_ARTIFACTS).map(relative => ({ path: relative, name: path.posix.basename(relative) }))
}

export interface ProjectActionRunnerInput { root: string; command: string; onOutput: (chunk: string) => void }
export type ProjectActionRunner = (input: ProjectActionRunnerInput) => Promise<{ exitCode: number | null }>

const shellRunner: ProjectActionRunner = ({ root, command, onOutput }) => new Promise((resolve, reject) => {
  const child = spawn(command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.setEncoding('utf8').on('data', onOutput)
  child.stderr?.setEncoding('utf8').on('data', onOutput)
  child.once('error', reject)
  child.once('close', exitCode => resolve({ exitCode }))
})

export class ProjectActionsService {
  private readonly histories = new Map<string, ProjectActionRun[]>()
  private readonly runner: ProjectActionRunner
  constructor(options: { runner?: ProjectActionRunner } = {}) { this.runner = options.runner ?? shellRunner }

  state(directory: string): ProjectActionsState {
    const root = rootDirectory(directory), config = readConfiguration(root)
    return { projectRoot: root, actions: config.actions, warnings: config.warnings, needsAgent: config.invalid || !config.actions.length || !!config.warnings.length,
      runs: structuredClone(this.histories.get(root) ?? []) }
  }

  save(directory: string, input: unknown): ProjectActionsState {
    const root = rootDirectory(directory)
    writeConfiguration(root, normalizeProjectActions(input))
    return this.state(root)
  }

  discover(directory: string): ProjectActionsState {
    const root = rootDirectory(directory), current = readConfiguration(root)
    if (current.invalid) return this.state(root)
    const detected = discoverProjectActions(root)
    const actions = current.saved ? [...current.actions, ...detected.actions.filter(action => !current.actions.some(saved => saved.id === action.id))] : detected.actions
    if (actions.length) writeConfiguration(root, normalizeProjectActions(actions))
    const state = this.state(root)
    state.warnings = [...new Set([...state.warnings, ...detected.warnings])]
    state.needsAgent ||= !!detected.warnings.length
    return state
  }

  run(directory: string, id: unknown): ProjectActionRun {
    const root = rootDirectory(directory), state = this.state(root)
    const action = typeof id === 'string' ? state.actions.find(action => action.id === id) : undefined
    if (!action) throw new ProjectActionError('해당 빌드·배포 작업을 찾을 수 없습니다. 설정을 확인하세요.', 404)
    const history = this.histories.get(root) ?? []
    if (history.some(run => run.actionId === action.id && run.status === 'running')) throw new ProjectActionError('이미 실행 중인 작업입니다.', 409)
    if ([...this.histories.values()].flat().filter(run => run.status === 'running').length >= 50) throw new ProjectActionError('동시에 실행할 수 있는 작업 수를 초과했습니다.', 409)
    const run: ProjectActionRun = { id: randomUUID(), actionId: action.id, name: action.name, kind: action.kind, status: 'running', startedAt: new Date().toISOString(), output: '', artifacts: [], ...(action.previewUrl ? { previewUrl: action.previewUrl } : {}) }
    history.unshift(run); this.histories.set(root, history); this.trimHistory()
    const append = (chunk: string) => { run.output = (run.output + chunk).slice(-MAX_OUTPUT) }
    void Promise.resolve().then(() => this.runner({ root, command: action.command, onOutput: append })).then(({ exitCode }) => {
      run.exitCode = exitCode; run.status = exitCode === 0 ? 'succeeded' : 'failed'
      if (run.status === 'succeeded') run.artifacts = collectArtifacts(root, action.artifacts ?? [])
    }).catch(error => { run.status = 'failed'; run.exitCode = null; append(`\n${error instanceof Error ? error.message : String(error)}`) })
      .finally(() => {
        run.finishedAt = new Date().toISOString()
        // Completion stays observable even when newer runs filled the retained history.
        this.histories.set(root, [run, ...(this.histories.get(root) ?? []).filter(item => item.id !== run.id)])
        this.trimHistory()
      })
    return structuredClone(run)
  }

  artifact(directory: string, runId: unknown, relative: unknown): string {
    const root = rootDirectory(directory), run = (this.histories.get(root) ?? []).find(run => run.id === runId)
    if (!run || run.status !== 'succeeded' || typeof relative !== 'string' || !run.artifacts.some(artifact => artifact.path === relative)) throw new ProjectActionError('이 실행에서 다운로드할 수 있는 파일이 아닙니다.', 404)
    return artifactFile(root, relative)
  }

  private trimHistory(): void {
    for (const [root, history] of this.histories) {
      const kept = history.filter((run, index) => index < MAX_HISTORY || run.status === 'running')
      if (kept.length) this.histories.set(root, kept)
      else this.histories.delete(root)
    }
    const completed = [...this.histories.entries()].flatMap(([root, history]) => history.filter(run => run.status !== 'running').map(run => ({ root, run })))
      .sort((a, b) => (b.run.finishedAt ?? b.run.startedAt).localeCompare(a.run.finishedAt ?? a.run.startedAt))
    for (const { root, run } of completed.slice(MAX_TOTAL_HISTORY)) {
      const history = this.histories.get(root)!.filter(item => item.id !== run.id)
      if (history.length) this.histories.set(root, history)
      else this.histories.delete(root)
    }
  }
}

export const projectActionsService = new ProjectActionsService()
