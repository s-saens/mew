import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { simpleGit } from 'simple-git'
import { DATA_DIR, DataFileError, readJsonRecord, writeFileAtomic } from './dataDir.ts'
import { assertNotServerDataPath, containsServerDataPath } from './paths.ts'
import { withinPath } from './platform/common/paths.ts'
import { normalizeProjectTabLayout } from '../shared/project-tab-groups.ts'
import { readProjectIcon } from './projectIcons.ts'
import type { StoredRootProjects } from './userUiState.ts'

export class ProjectRegistryError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

type RegisteredProject = { path: string; name: string; managed: boolean; discovered?: boolean }
type Registry = { version: 1; projects: RegisteredProject[]; myProjects: Record<string, StoredRootProjects>; deletedPaths?: string[] }
export type RegistryProject = RegisteredProject & { mine: boolean; icon: string | null; parentPath?: string }
const accountKey = (account: string) => account.trim().toLowerCase()
const validPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0') && path.isAbsolute(value)

function assertManagedName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 120 || name === '.' || name === '..' || /^[.]/.test(name) || /[\\/\p{Cc}<>:"|?*]/u.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new ProjectRegistryError('프로젝트 이름이 올바르지 않습니다')
}

/** Shared installation catalog and account shortcuts live in one atomic YAML ledger. */
export class ProjectRegistry {
  readonly file: string
  readonly managedRoot: string
  private pendingDirectories = new Set<string>()
  private discovery: { promise: Promise<void>; controller: AbortController; waiters: number } | null = null
  constructor(directory = DATA_DIR, managedRoot = path.join(os.homedir(), '.mew', 'projects')) {
    this.file = path.join(directory, 'projects.yaml')
    this.managedRoot = managedRoot
  }

  private write(state: Registry): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    writeFileAtomic(this.file, stringify(state))
  }

  private read(): Registry {
    let raw: string
    try { raw = fs.readFileSync(this.file, 'utf8') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const state: Registry = { version: 1, projects: [], myProjects: {} }
      const legacy = readJsonRecord<{ rootProjects?: StoredRootProjects; activeProjectPath?: string; activeWorkspace?: string }>(path.join(path.dirname(this.file), 'user-ui-state.json')) ?? {}
      for (const [account, saved] of Object.entries(legacy)) {
        const paths = [...new Set([...(saved.rootProjects?.paths ?? []).filter(validPath), ...(!saved.rootProjects && validPath(saved.activeProjectPath ?? saved.activeWorkspace) ? [saved.activeProjectPath ?? saved.activeWorkspace!] : [])])]
        if (!saved.rootProjects && !paths.length) continue
        state.myProjects[accountKey(account)] = { ...saved.rootProjects, paths, icons: saved.rootProjects?.icons ?? {} }
        for (const directory of paths) this.include(state, directory)
      }
      this.write(state)
      return state
    }
    try {
      const state = parse(raw) as Registry
      if (!state || state.version !== 1 || !Array.isArray(state.projects) || !state.myProjects || typeof state.myProjects !== 'object' || Array.isArray(state.myProjects)) throw new Error('Invalid registry')
      if (state.deletedPaths !== undefined && (!Array.isArray(state.deletedPaths) || !state.deletedPaths.every(validPath))) throw new Error('Invalid deleted paths')
      for (const project of state.projects) {
        if (!project || !validPath(project.path) || typeof project.name !== 'string' || typeof project.managed !== 'boolean' || (project.discovered !== undefined && typeof project.discovered !== 'boolean')) throw new Error('Invalid project')
      }
      for (const value of Object.values(state.myProjects)) {
        if (!value || !Array.isArray(value.paths) || !value.paths.every(validPath) || !value.icons || typeof value.icons !== 'object' || Array.isArray(value.icons)) throw new Error('Invalid shortcuts')
      }
      const registered = new Set(state.projects.map(project => project.path))
      for (const value of Object.values(state.myProjects)) value.paths = value.paths.filter(directory => registered.has(directory))
      return state
    } catch {
      throw new DataFileError('프로젝트 목록이 손상되었습니다: projects.yaml')
    }
  }

  private include(state: Registry, directory: string, managed = false): RegisteredProject {
    const normalized = path.resolve(directory)
    if (state.deletedPaths?.includes(normalized)) state.deletedPaths = state.deletedPaths.filter(directory => directory !== normalized)
    const existing = state.projects.find(project => project.path === normalized)
    if (existing) return existing
    const project = { path: normalized, name: path.basename(normalized) || normalized, managed }
    state.projects.push(project)
    return project
  }

  ensureMigration(): void {
    if (!fs.existsSync(this.file)) this.read()
  }

  readMine(account: string): StoredRootProjects | null {
    return this.read().myProjects[accountKey(account)] ?? null
  }

  /** Existing browser migrations may contain unavailable paths; preserve those shortcuts. */
  writeMine(account: string, value: StoredRootProjects): StoredRootProjects {
    const state = this.read()
    const deleted = new Set(state.deletedPaths ?? [])
    const paths = value.paths.filter(directory => !deleted.has(path.resolve(directory)))
    for (const directory of paths) { assertNotServerDataPath(directory); this.include(state, directory) }
    const saved = { ...value, paths, icons: Object.fromEntries(Object.entries(value.icons).filter(([directory]) => !deleted.has(path.resolve(directory)))), ...(value.groups ? { groups: normalizeProjectTabLayout(paths, value.groups).groups } : {}) }
    state.myProjects[accountKey(account)] = saved
    this.write(state)
    return saved
  }

  list(account: string): RegistryProject[] {
    const state = this.read()
    let changed = false
    let managed: fs.Dirent[] = []
    try { managed = fs.readdirSync(this.managedRoot, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    for (const entry of managed) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const directory = path.join(this.managedRoot, entry.name)
      if (this.pendingDirectories.has(directory)) continue
      try { assertNotServerDataPath(directory) } catch { continue }
      const canonical = fs.realpathSync(directory)
      if (!state.projects.some(project => project.path === canonical)) { this.include(state, canonical, true); changed = true }
    }
    for (const root of [...state.projects].filter(project => !project.discovered)) {
      for (const directory of discoverNestedProjects(root.path, this.pendingDirectories)) {
        if (!state.projects.some(project => project.path === directory)) {
          this.include(state, directory).discovered = true
          changed = true
        }
      }
    }
    if (changed) this.write(state)
    return this.rows(state, account)
  }

  /** Return the persisted catalog without filesystem discovery or icon reads. */
  snapshot(account: string): RegistryProject[] {
    return this.rows(this.read(), account, false)
  }

  /** Concurrent callers share discovery until all interested requests disconnect. */
  async listAsync(account: string, signal?: AbortSignal): Promise<RegistryProject[]> {
    if (signal?.aborted) throw new DOMException('Discovery canceled', 'AbortError')
    let discovery = this.discovery
    if (!discovery) {
      const controller = new AbortController()
      discovery = { controller, waiters: 0, promise: this.discoverAsync(controller.signal) }
      this.discovery = discovery
    }
    discovery.waiters++
    let canceled: (() => void) | undefined
    try {
      const aborted = new Promise<never>((_, reject) => {
        canceled = () => reject(new DOMException('Discovery canceled', 'AbortError'))
        signal?.addEventListener('abort', canceled, { once: true })
        if (signal?.aborted) canceled()
      })
      await Promise.race([discovery.promise, aborted])
      return this.rows(this.read(), account)
    } finally {
      if (canceled) signal?.removeEventListener('abort', canceled)
      discovery.waiters--
      if (discovery.waiters === 0) {
        if (this.discovery === discovery) this.discovery = null
        discovery.controller.abort()
      }
    }
  }

  private async discoverAsync(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const initial = this.read()
    let entries: fs.Dirent[] = []
    try { entries = await fs.promises.readdir(this.managedRoot, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const managed: string[] = []
    for (const entry of entries) {
      signal.throwIfAborted()
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const directory = path.join(this.managedRoot, entry.name)
      if (this.pendingDirectories.has(directory)) continue
      try { assertNotServerDataPath(directory) } catch { continue }
      try {
        managed.push(await fs.promises.realpath(directory))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') continue
        throw error
      }
    }
    const roots = new Set([...initial.projects.filter(project => !project.discovered).map(project => project.path), ...managed])
    const nested = new Map<string, string[]>()
    for (const root of roots) {
      signal.throwIfAborted()
      nested.set(root, await discoverNestedProjectsAsync(root, this.pendingDirectories, signal))
    }
    signal.throwIfAborted()

    // Discovery yielded to other requests. Merge into the latest ledger so concurrent
    // shortcuts, registrations and permanent deletions cannot be overwritten.
    const state = this.read()
    let changed = false
    const available = (directory: string): boolean => {
      if (this.pendingDirectories.has(directory)) return false
      try { return fs.lstatSync(directory).isDirectory() && fs.realpathSync(directory) === directory } catch { return false }
    }
    for (const directory of managed) {
      if (available(directory) && !state.projects.some(project => project.path === directory)) {
        this.include(state, directory, true)
        changed = true
      }
    }
    for (const [root, directories] of nested) {
      if (!state.projects.some(project => project.path === root) || !available(root)) continue
      for (const directory of directories) {
        if (available(directory) && !state.projects.some(project => project.path === directory)) {
          this.include(state, directory).discovered = true
          changed = true
        }
      }
    }
    if (changed) this.write(state)
  }

  private rows(state: Registry, account: string, withIcons = true): RegistryProject[] {
    const mine = new Set(state.myProjects[accountKey(account)]?.paths ?? [])
    const registered = new Set(state.projects.map(project => project.path))
    return state.projects.map(project => {
      let ancestor = path.dirname(project.path)
      let parentPath: string | undefined
      while (ancestor !== project.path) {
        if (registered.has(ancestor)) { parentPath = ancestor; break }
        const parent = path.dirname(ancestor)
        if (parent === ancestor) break
        ancestor = parent
      }
      return { ...project, mine: mine.has(project.path), icon: withIcons && fs.existsSync(project.path) ? readProjectIcon(project.path) : null, ...(parentPath ? { parentPath } : {}) }
    })
  }

  has(directory: string): boolean {
    return this.read().projects.some(project => project.path === path.resolve(directory))
  }

  link(account: string, directory: unknown): RegistryProject {
    if (!validPath(directory)) throw new ProjectRegistryError('프로젝트 경로가 올바르지 않습니다')
    let canonical: string
    try {
      canonical = fs.realpathSync(directory)
      if (!fs.statSync(canonical).isDirectory()) throw new Error('Not a directory')
    } catch { throw new ProjectRegistryError('프로젝트 폴더를 찾을 수 없습니다', 404) }
    assertNotServerDataPath(canonical)
    const state = this.read()
    const project = this.include(state, canonical)
    const key = accountKey(account), mine = state.myProjects[key] ?? { paths: [], icons: {} }
    if (!mine.paths.includes(project.path)) mine.paths.push(project.path)
    state.myProjects[key] = mine
    this.write(state)
    return { ...project, mine: true, icon: readProjectIcon(canonical) }
  }

  setMine(account: string, directory: unknown, added: unknown): StoredRootProjects {
    if (!validPath(directory) || typeof added !== 'boolean') throw new ProjectRegistryError('프로젝트 선택이 올바르지 않습니다')
    const state = this.read(), normalized = path.resolve(directory)
    if (!state.projects.some(project => project.path === normalized)) throw new ProjectRegistryError('등록되지 않은 프로젝트입니다', 404)
    const key = accountKey(account), mine = state.myProjects[key] ?? { paths: [], icons: {} }
    const paths = mine.paths.filter(item => item !== normalized)
    if (added) paths.push(normalized)
    state.myProjects[key] = { ...mine, paths }
    this.write(state)
    return state.myProjects[key]
  }

  /** Permanently remove one registered directory and every shortcut into its tree. */
  delete(directory: unknown): { removedPaths: string[]; affectedAccounts: string[] } {
    if (!validPath(directory)) throw new ProjectRegistryError('프로젝트 경로가 올바르지 않습니다')
    const state = this.read(), normalized = path.resolve(directory)
    if (!state.projects.some(project => project.path === normalized)) throw new ProjectRegistryError('등록되지 않은 프로젝트입니다', 404)
    let canonical: string
    try {
      canonical = fs.realpathSync(normalized)
      if (!fs.statSync(canonical).isDirectory()) throw new Error('Not a directory')
    } catch { throw new ProjectRegistryError('프로젝트 폴더를 찾을 수 없습니다', 404) }
    if (canonical !== normalized) throw new ProjectRegistryError('프로젝트 경로가 변경되었습니다. 다시 연결한 후 삭제하세요.', 409)
    const home = fs.realpathSync(os.homedir()), source = fs.realpathSync(path.resolve(import.meta.dirname, '..'))
    const metadata = fs.realpathSync(path.dirname(this.file))
    const managed = path.resolve(this.managedRoot)
    const managedContent = withinPath(metadata, managed) && metadata !== managed && withinPath(managed, canonical)
    if (canonical === path.parse(canonical).root || withinPath(canonical, home) || withinPath(canonical, source)
      || containsServerDataPath(canonical) || withinPath(canonical, metadata) || withinPath(metadata, canonical) && !managedContent) {
      throw new ProjectRegistryError('보호된 폴더는 프로젝트에서 삭제할 수 없습니다.', 403)
    }
    assertNotServerDataPath(canonical)
    if ([...this.pendingDirectories].some(pending => withinPath(canonical, pending))) throw new ProjectRegistryError('프로젝트 작업이 진행 중입니다. 완료 후 다시 시도하세요.', 409)
    const affected = (candidate: string) => withinPath(canonical, path.resolve(candidate))
    const removedPaths = state.projects.filter(project => affected(project.path)).map(project => project.path)
    const affectedAccounts: string[] = []
    state.projects = state.projects.filter(project => !affected(project.path))
    state.deletedPaths = [...new Set([...(state.deletedPaths ?? []), ...removedPaths])]
    for (const [account, mine] of Object.entries(state.myProjects)) {
      if (mine.paths.some(affected)) affectedAccounts.push(account)
      const paths = mine.paths.filter(directory => !affected(directory))
      const icons = Object.fromEntries(Object.entries(mine.icons).filter(([directory]) => !affected(directory)))
      state.myProjects[account] = { ...mine, paths, icons, ...(mine.groups ? { groups: normalizeProjectTabLayout(paths, mine.groups).groups } : {}) }
    }
    fs.rmSync(canonical, { recursive: true })
    this.write(state)
    return { removedPaths, affectedAccounts }
  }

  async create(account: string, name: unknown, git: unknown = true): Promise<RegistryProject> {
    assertManagedName(name)
    if (typeof git !== 'boolean') throw new ProjectRegistryError('Git 설정이 올바르지 않습니다')
    return this.createManaged(account, name, async directory => {
      fs.mkdirSync(path.join(directory, '.mew', 'wiki'), { recursive: true })
      if (git) {
        await simpleGit(directory).init()
        fs.writeFileSync(path.join(directory, '.gitignore'), '.mew/temp/\n')
      }
    })
  }

  async clone(account: string, name: string, populate: (directory: string) => Promise<void>): Promise<RegistryProject> {
    assertManagedName(name)
    return this.createManaged(account, name, populate)
  }

  private async createManaged(account: string, name: string, populate: (directory: string) => Promise<void>): Promise<RegistryProject> {
    this.read() // Validate the ledger before creating any files.
    fs.mkdirSync(this.managedRoot, { recursive: true })
    const directory = path.join(this.managedRoot, name)
    assertNotServerDataPath(directory)
    try { fs.mkdirSync(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProjectRegistryError('같은 이름의 프로젝트가 이미 있습니다', 409)
      throw error
    }
    this.pendingDirectories.add(directory)
    try {
      await populate(directory)
      const state = this.read(), project = this.include(state, fs.realpathSync(directory), true)
      const key = accountKey(account), mine = state.myProjects[key] ?? { paths: [], icons: {} }
      if (!mine.paths.includes(project.path)) mine.paths.push(project.path)
      state.myProjects[key] = mine
      this.write(state)
      return { ...project, mine: true, icon: null }
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true })
      throw error
    } finally { this.pendingDirectories.delete(directory) }
  }
}

const ignoredDirectories = new Set(['.git', '.mew', '.worktrees', 'node_modules', 'vendor', 'dist', 'build', '.cache'])
const unityGeneratedDirectories = new Set(['Library', 'Temp'])

function discoveryChildren(entries: fs.Dirent[]): fs.Dirent[] {
  const isUnityProject = ['Assets', 'ProjectSettings'].every(name => entries.some(entry => entry.name === name && entry.isDirectory()))
  return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !ignoredDirectories.has(entry.name)
    && !(isUnityProject && unityGeneratedDirectories.has(entry.name)))
}

/** Bounded, link-free discovery keeps dependency trees and server metadata outside the catalog. */
export function discoverNestedProjects(root: string, excluded: ReadonlySet<string> = new Set()): string[] {
  const result: string[] = [], pending = [{ directory: root, depth: 0 }]
  let visited = 0
  while (pending.length && visited < 10_000) {
    const current = pending.pop()!
    if (current.depth >= 20) continue
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(current.directory, { withFileTypes: true }) } catch { continue }
    for (const entry of discoveryChildren(entries)) {
      if (++visited > 10_000) break
      const directory = path.join(current.directory, entry.name)
      if (excluded.has(directory)) continue
      try { assertNotServerDataPath(directory) } catch { continue }
      const marker = ['.mew', '.git'].some(name => {
        try { const stat = fs.lstatSync(path.join(directory, name)); return stat.isDirectory() || (name === '.git' && stat.isFile()) } catch { return false }
      })
      if (marker) result.push(directory)
      pending.push({ directory, depth: current.depth + 1 })
    }
  }
  return result.sort()
}

/** Match synchronous catalog discovery while allowing authentication and file requests to proceed. */
export async function discoverNestedProjectsAsync(root: string, excluded: ReadonlySet<string> = new Set(), signal?: AbortSignal): Promise<string[]> {
  const result: string[] = [], pending = [{ directory: root, depth: 0 }]
  let visited = 0
  while (pending.length && visited < 10_000) {
    signal?.throwIfAborted()
    // Bound directory and marker reads instead of queuing the whole workspace at once.
    await Promise.all(pending.splice(-4).map(async ({ directory, depth }) => {
      let entries: fs.Dirent[]
      try { entries = await fs.promises.readdir(directory, { withFileTypes: true }) } catch { return }
      const children = discoveryChildren(entries)
      for (let offset = 0; offset < children.length && visited < 10_000; offset += 16) {
        signal?.throwIfAborted()
        await Promise.all(children.slice(offset, offset + 16).map(async entry => {
          if (visited++ >= 10_000) return
          const child = path.join(directory, entry.name)
          if (excluded.has(child)) return
          try { assertNotServerDataPath(child) } catch { return }
          let marker = false
          for (const name of ['.mew', '.git']) {
            try { const stat = await fs.promises.lstat(path.join(child, name)); marker = stat.isDirectory() || name === '.git' && stat.isFile() } catch { /* no marker */ }
            if (marker) break
          }
          if (marker) result.push(child)
          if (depth < 19) pending.push({ directory: child, depth: depth + 1 })
        }))
      }
    }))
  }
  return result.sort()
}

export const projectRegistry = new ProjectRegistry()
