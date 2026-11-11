import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectAction, ProjectActionArtifact, ProjectActionRun, ProjectActionsState } from '../shared/project-actions.ts'
import { assertNotServerDataPath } from './paths.ts'
import { automaticArtifactPatterns, discoverProjectActions } from './project-actions-discovery.ts'
import { artifactFingerprint } from './project-actions-archive.ts'
import { spawnHostProcess, stopProcessGroup, processGroupAlive } from './platform/process.ts'

const CONFIG_FILE = 'project-actions.json'
const MAX_CONFIG_BYTES = 262_144
const MAX_OUTPUT = 131_072
const MAX_HISTORY = 20
const MAX_TOTAL_HISTORY = 200
const MAX_ARTIFACTS = 100
const MAX_SCAN_ENTRIES = 10_000
const MAX_ARCHIVE_FILES = 5_000
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024

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

interface ArtifactSnapshot extends ProjectActionArtifact { fingerprint: string }

function collectArtifacts(root: string, patterns: string[], limit = MAX_ARTIFACTS): { files: ArtifactSnapshot[]; complete: boolean } {
  const files = new Set<string>()
  let scanned = 0
  let complete = true
  for (const pattern of patterns) {
    const firstGlob = pattern.search(/[?*[{]/)
    if (firstGlob < 0) { try { artifactFile(root, pattern); files.add(pattern) } catch { /* Missing or protected output. */ }; continue }
    const prefix = pattern.slice(0, firstGlob), slash = prefix.lastIndexOf('/')
    const base = slash < 0 ? '' : prefix.slice(0, slash)
    const queue = [base]
    while (queue.length && scanned < MAX_SCAN_ENTRIES && files.size < MAX_SCAN_ENTRIES) {
      const directory = queue.pop()!
      if (directory && !allowedArtifact(directory)) continue
      let entries: fs.Dirent[]
      try {
        // Validate every parent so an output directory cannot redirect discovery outside the root.
        let parent = root
        for (const segment of directory.split('/').filter(Boolean)) { parent = path.join(parent, segment); if (!fs.lstatSync(parent).isDirectory()) throw new Error('Not a directory') }
        entries = fs.readdirSync(parent, { withFileTypes: true })
      } catch { complete = false; continue }
      for (const entry of entries) {
        if (++scanned > MAX_SCAN_ENTRIES || files.size >= MAX_SCAN_ENTRIES) break
        const relative = directory ? `${directory}/${entry.name}` : entry.name
        if (!allowedArtifact(relative) || entry.isSymbolicLink()) { complete = false; continue }
        if (entry.isDirectory()) queue.push(relative)
        else if (entry.isFile() && path.matchesGlob(relative, pattern)) { try { artifactFile(root, relative); files.add(relative) } catch { /* Unsafe or removed output. */ } }
      }
    }
  }
  const snapshots = [...files].sort((a, b) => Number(path.posix.basename(b) === 'index.html') - Number(path.posix.basename(a) === 'index.html') || a.localeCompare(b))
    .flatMap(relative => {
      try {
        const stat = fs.statSync(artifactFile(root, relative))
        return [{ path: relative, name: path.posix.basename(relative), size: stat.size, fingerprint: artifactFingerprint(stat) }]
      } catch { complete = false; return [] }
    })
  if (scanned >= MAX_SCAN_ENTRIES || snapshots.length > limit) complete = false
  return { files: snapshots.slice(0, limit), complete }
}

export interface ProjectActionRunnerInput { root: string; command: string; onOutput: (chunk: string) => void; signal?: AbortSignal; onProcess?: (pid: number) => void }
export type ProjectActionRunner = (input: ProjectActionRunnerInput) => Promise<{ exitCode: number | null }>

export interface ProjectActionRunRecord {
  run: ProjectActionRun
  rootIdentity: string
  archiveFiles?: Array<{ path: string; size: number; fingerprint: string }>
  process?: { pid: number }
}

const shellRunner: ProjectActionRunner = ({ root, command, onOutput, signal, onProcess }) => new Promise((resolve, reject) => {
  const child = spawnHostProcess(process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command], { cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let closed = false, code: number | null = null, stopping = false, stopped = false
  const finish = () => { signal?.removeEventListener('abort', abort); resolve({ exitCode: signal?.aborted ? null : code }) }
  const abort = () => {
    if (stopping) return
    stopping = true
    if (child.pid) stopProcessGroup(child.pid, 'SIGTERM')
    setTimeout(() => {
      if (child.pid) stopProcessGroup(child.pid, 'SIGKILL')
      stopped = true
      if (closed) finish()
    }, 500)
  }
  child.stdout?.setEncoding('utf8').on('data', onOutput)
  child.stderr?.setEncoding('utf8').on('data', onOutput)
  child.once('error', error => { signal?.removeEventListener('abort', abort); reject(error) })
  child.once('close', exitCode => { closed = true; code = exitCode; if (!stopping || stopped) { if (child.pid && processGroupAlive(child.pid)) stopProcessGroup(child.pid, 'SIGKILL'); finish() } })
  if (child.pid) onProcess?.(child.pid)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
})

export class ProjectActionsService {
  private readonly histories = new Map<string, ProjectActionRun[]>()
  private readonly archiveFiles = new Map<string, Array<{ path: string; size: number; fingerprint: string }>>()
  private readonly restoredRuns = new Map<string, { root: string; run: ProjectActionRun }>()
  private readonly completions = new Map<string, Promise<ProjectActionRun>>()
  private readonly reservations = new Map<string, string>()
  private readonly processes = new Map<string, number>()
  private readonly runRoots = new Map<string, string>()
  private readonly orphanedGroups = new Map<string, Set<number>>()
  private recoveryLoader?: (root: string) => void
  private readonly runner: ProjectActionRunner
  private readonly timeoutMs: number
  constructor(options: { runner?: ProjectActionRunner; timeoutMs?: number } = {}) { this.runner = options.runner ?? shellRunner; this.timeoutMs = options.timeoutMs ?? 30 * 60_000 }

  state(directory: string): ProjectActionsState {
    const root = rootDirectory(directory), config = readConfiguration(root)
    if (this.hasOrphanedProcess(root)) config.warnings.push('이전에 실행한 프로세스가 아직 실행 중일 수 있습니다. 해당 프로세스가 종료된 뒤 다시 실행하세요.')
    return { projectRoot: root, actions: config.actions, warnings: config.warnings, needsAgent: config.invalid || !config.actions.length || !!config.warnings.length,
      runs: structuredClone((this.histories.get(root) ?? []).filter(run => this.runRoots.get(run.id) === this.rootIdentity(root))) }
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
    if (this.hasOrphanedProcess(root)) throw new ProjectActionError('이전에 실행한 프로세스가 아직 실행 중일 수 있습니다. 종료된 뒤 다시 실행하세요.', 409)
    if (this.reservations.has(root)) throw new ProjectActionError('프로젝트에서 이미 실행 중인 작업이 있습니다.', 409)
    return this.start(root, action)
  }

  reserve(directory: string, reservation: string): void {
    const root = rootDirectory(directory)
    if (this.hasOrphanedProcess(root) || this.reservations.has(root) || (this.histories.get(root) ?? []).some(run => run.status === 'running')) throw new ProjectActionError('프로젝트에서 이미 실행 중인 작업이 있습니다.', 409)
    this.reservations.set(root, reservation)
  }

  release(directory: string, reservation: string): void {
    let root: string
    try { root = rootDirectory(directory) } catch { root = path.resolve(directory) }
    if (this.reservations.get(root) === reservation) this.reservations.delete(root)
  }

  runSnapshot(directory: string, snapshot: ProjectAction, reservation: string, onUpdate?: (run: ProjectActionRun) => void): ProjectActionRun {
    const root = rootDirectory(directory)
    if (this.reservations.get(root) !== reservation) throw new ProjectActionError('프로젝트 실행 범위가 일치하지 않습니다.', 409)
    return this.start(root, normalizeProjectActions([snapshot])[0], onUpdate)
  }

  async wait(directory: string, runId: string): Promise<ProjectActionRun> {
    const root = rootDirectory(directory)
    const run = (this.histories.get(root) ?? []).find(item => item.id === runId)
    if (!run) throw new ProjectActionError('해당 실행을 찾을 수 없습니다.', 404)
    return structuredClone(await (this.completions.get(runId) ?? Promise.resolve(run)))
  }

  exportRun(directory: string, runId: string): ProjectActionRunRecord {
    const root = rootDirectory(directory)
    const run = this.findRun(root, runId)
    if (!run) throw new ProjectActionError('해당 실행을 찾을 수 없습니다.', 404)
    return structuredClone({ run, rootIdentity: this.runRoots.get(runId)!, ...(this.archiveFiles.has(runId) ? { archiveFiles: this.archiveFiles.get(runId) } : {}), ...(this.processes.has(runId) ? { process: { pid: this.processes.get(runId)! } } : {}) })
  }

  restoreRun(directory: string, record: ProjectActionRunRecord): void {
    const root = rootDirectory(directory)
    if (!record?.run || record.rootIdentity !== this.rootIdentity(root) || !Array.isArray(record.run.artifacts)) return
    if (record.run.status === 'running') {
      if (Number.isSafeInteger(record.process?.pid) && record.process!.pid > 0) {
        const groups = this.orphanedGroups.get(root) ?? new Set<number>()
        groups.add(record.process!.pid); this.orphanedGroups.set(root, groups)
      }
      return
    }
    const id = record.run.id
    if ((this.histories.get(root) ?? []).some(run => run.id === id)) return
    const restored = this.restoredRuns.get(id)
    if (restored && restored.root !== root) return
    this.restoredRuns.delete(id)
    this.restoredRuns.set(id, { root, run: structuredClone(record.run) })
    this.runRoots.set(id, record.rootIdentity)
    if (record.archiveFiles && record.run.archive) this.archiveFiles.set(id, structuredClone(record.archiveFiles))
    while (this.restoredRuns.size > MAX_TOTAL_HISTORY) {
      const oldest = this.restoredRuns.keys().next().value!
      this.restoredRuns.delete(oldest); this.archiveFiles.delete(oldest); this.runRoots.delete(oldest)
    }
  }

  setRecoveryLoader(loader: (root: string) => void): void { this.recoveryLoader = loader }

  hasOrphanedProcess(directory: string): boolean {
    const root = rootDirectory(directory)
    this.recoveryLoader?.(root)
    const groups = this.orphanedGroups.get(root)
    if (!groups) return false
    for (const pid of groups) if (!processGroupAlive(pid)) groups.delete(pid)
    if (!groups.size) this.orphanedGroups.delete(root)
    return groups.size > 0
  }

  private findRun(root: string, id: unknown): ProjectActionRun | undefined {
    if (typeof id !== 'string' || this.runRoots.get(id) !== this.rootIdentity(root)) return undefined
    const local = (this.histories.get(root) ?? []).find(run => run.id === id)
    if (local) return local
    const restored = typeof id === 'string' ? this.restoredRuns.get(id) : undefined
    return restored?.root === root ? restored.run : undefined
  }

  private rootIdentity(root: string): string { const stat = fs.statSync(root); return `${stat.dev}:${stat.ino}` }

  private start(root: string, action: ProjectAction, onUpdate?: (run: ProjectActionRun) => void): ProjectActionRun {
    const history = this.histories.get(root) ?? []
    if (history.some(run => run.actionId === action.id && run.status === 'running')) throw new ProjectActionError('이미 실행 중인 작업입니다.', 409)
    if ([...this.histories.values()].flat().filter(run => run.status === 'running').length >= 50) throw new ProjectActionError('동시에 실행할 수 있는 작업 수를 초과했습니다.', 409)
    const automaticPatterns = automaticArtifactPatterns(root, action)
    const previous = new Map(collectArtifacts(root, automaticPatterns, MAX_SCAN_ENTRIES).files.map(file => [file.path, file.fingerprint]))
    const run: ProjectActionRun = { id: randomUUID(), actionId: action.id, name: action.name, kind: action.kind, status: 'running', startedAt: new Date().toISOString(), output: '', artifacts: [], ...(action.previewUrl ? { previewUrl: action.previewUrl } : {}) }
    this.runRoots.set(run.id, this.rootIdentity(root))
    history.unshift(run); this.histories.set(root, history); this.trimHistory()
    const notify = () => { try { onUpdate?.(structuredClone(run)) } catch { /* An observer must not interrupt the running process. */ } }
    const append = (chunk: string) => { run.output = (run.output + chunk).slice(-MAX_OUTPUT); notify() }
    const controller = new AbortController()
    const timeout = setTimeout(() => { append('\n작업 실행 시간이 초과되어 프로세스를 종료합니다.\n'); controller.abort() }, this.timeoutMs)
    timeout.unref()
    const completion = Promise.resolve().then(() => this.runner({ root, command: action.command, onOutput: append, signal: controller.signal, onProcess: pid => { this.processes.set(run.id, pid); notify() } })).then(({ exitCode }) => {
      if (controller.signal.aborted) exitCode = null
      run.exitCode = exitCode; run.status = exitCode === 0 ? 'succeeded' : 'failed'
      if (run.status === 'succeeded') {
        const automatic = automaticPatterns.length > 0
        const collected = collectArtifacts(root, automatic ? automaticPatterns : action.artifacts ?? [], automatic ? MAX_SCAN_ENTRIES : MAX_ARTIFACTS)
        const files = collected.files.filter(file => !automatic || previous.get(file.path) !== file.fingerprint)
        run.artifacts = files.slice(0, MAX_ARTIFACTS).map(({ fingerprint: _fingerprint, ...file }) => file)
        const total = files.reduce((sum, file) => sum + (file.size ?? 0), 0)
        if (automatic && collected.complete && files.length > 0 && files.length === collected.files.length && files.length <= MAX_ARCHIVE_FILES && total <= MAX_ARCHIVE_BYTES) {
          const directory = automaticPatterns[0].split('/')[0]
          run.archive = { name: `${directory}.zip`, fileCount: files.length, size: total }
          this.archiveFiles.set(run.id, files.map(file => ({ path: file.path, size: file.size ?? 0, fingerprint: file.fingerprint })))
        }
      }
    }).catch(error => { run.status = 'failed'; run.exitCode = null; append(`\n${error instanceof Error ? error.message : String(error)}`) })
      .finally(() => {
        clearTimeout(timeout)
        this.processes.delete(run.id)
        run.finishedAt = new Date().toISOString()
        // Completion stays observable even when newer runs filled the retained history.
        this.histories.set(root, [run, ...(this.histories.get(root) ?? []).filter(item => item.id !== run.id)])
        this.trimHistory()
        notify()
      }).then(() => structuredClone(run))
    this.completions.set(run.id, completion)
    void completion.finally(() => this.completions.delete(run.id))
    return structuredClone(run)
  }

  artifact(directory: string, runId: unknown, relative: unknown): string {
    const root = rootDirectory(directory), run = this.findRun(root, runId)
    if (!run || run.status !== 'succeeded' || typeof relative !== 'string' || !run.artifacts.some(artifact => artifact.path === relative)) throw new ProjectActionError('이 실행에서 다운로드할 수 있는 파일이 아닙니다.', 404)
    return artifactFile(root, relative)
  }

  archive(directory: string, runId: unknown): { name: string; size: number; files: Array<{ path: string; name: string; size: number; fingerprint: string }>; validate: (relative: string) => string } {
    const root = rootDirectory(directory), run = this.findRun(root, runId)
    const paths = run ? this.archiveFiles.get(run.id) : undefined
    if (!run || run.status !== 'succeeded' || !run.archive || !paths) throw new ProjectActionError('이 실행에서 다운로드할 수 있는 압축 파일이 아닙니다.', 404)
    let total = 0
    const prefix = `${run.archive.name.slice(0, -4)}/`
    const files = paths.map(recorded => {
      let size: number
      try {
        const stat = fs.statSync(artifactFile(root, recorded.path))
        if (artifactFingerprint(stat) !== recorded.fingerprint) throw new Error('Output changed')
        size = stat.size; total += size
      }
      catch { throw new ProjectActionError('결과 파일이 변경되었거나 더 이상 사용할 수 없습니다.', 404) }
      if (total > MAX_ARCHIVE_BYTES) throw new ProjectActionError('결과 파일이 압축 파일 크기 제한을 초과합니다.', 413)
      return { path: recorded.path, name: recorded.path.slice(prefix.length), size, fingerprint: recorded.fingerprint }
    })
    const size = 22 + files.reduce((sum, file) => sum + file.size + 92 + 2 * Buffer.byteLength(file.name), 0)
    return { name: run.archive.name, size, files, validate: relative => artifactFile(root, relative) }
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
    const retained = new Set([...this.histories.values()].flatMap(history => history.map(run => run.id)))
    for (const id of this.restoredRuns.keys()) retained.add(id)
    for (const id of this.archiveFiles.keys()) if (!retained.has(id)) this.archiveFiles.delete(id)
    for (const id of this.runRoots.keys()) if (!retained.has(id)) this.runRoots.delete(id)
  }
}

export const projectActionsService = new ProjectActionsService()
