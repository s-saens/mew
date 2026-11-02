import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { simpleGit } from 'simple-git'
import { DATA_DIR, DataFileError, readJsonRecord, writeFileAtomic } from './dataDir.ts'
import { assertNotServerDataPath } from './paths.ts'
import { readProjectIcon } from './projectIcons.ts'
import type { StoredRootProjects } from './userUiState.ts'

export class ProjectRegistryError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

type RegisteredProject = { path: string; name: string; managed: boolean }
type Registry = { version: 1; projects: RegisteredProject[]; myProjects: Record<string, StoredRootProjects> }
export type RegistryProject = RegisteredProject & { mine: boolean; icon: string | null }
const accountKey = (account: string) => account.trim().toLowerCase()
const validPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0') && path.isAbsolute(value)

/** Shared installation catalog and account shortcuts live in one atomic YAML ledger. */
export class ProjectRegistry {
  readonly file: string
  readonly managedRoot: string
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
      for (const project of state.projects) {
        if (!project || !validPath(project.path) || typeof project.name !== 'string' || typeof project.managed !== 'boolean') throw new Error('Invalid project')
      }
      for (const value of Object.values(state.myProjects)) {
        if (!value || !Array.isArray(value.paths) || !value.paths.every(validPath) || !value.icons || typeof value.icons !== 'object' || Array.isArray(value.icons)) throw new Error('Invalid shortcuts')
      }
      return state
    } catch {
      throw new DataFileError('프로젝트 목록이 손상되었습니다: projects.yaml')
    }
  }

  private include(state: Registry, directory: string, managed = false): RegisteredProject {
    const normalized = path.resolve(directory)
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
    for (const directory of value.paths) { assertNotServerDataPath(directory); this.include(state, directory) }
    state.myProjects[accountKey(account)] = value
    this.write(state)
    return value
  }

  list(account: string): RegistryProject[] {
    const state = this.read(), mine = new Set(state.myProjects[accountKey(account)]?.paths ?? [])
    return state.projects.map(project => ({ ...project, mine: mine.has(project.path), icon: fs.existsSync(project.path) ? readProjectIcon(project.path) : null }))
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

  async create(account: string, name: unknown, git: unknown = true): Promise<RegistryProject> {
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 120 || name === '.' || name === '..' || /^[.]/.test(name) || /[\\/\p{Cc}<>:"|?*]/u.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new ProjectRegistryError('프로젝트 이름이 올바르지 않습니다')
    if (typeof git !== 'boolean') throw new ProjectRegistryError('Git 설정이 올바르지 않습니다')
    this.read() // Validate the ledger before creating any files.
    fs.mkdirSync(this.managedRoot, { recursive: true })
    const directory = path.join(this.managedRoot, name)
    assertNotServerDataPath(directory)
    try { fs.mkdirSync(directory) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProjectRegistryError('같은 이름의 프로젝트가 이미 있습니다', 409)
      throw error
    }
    try {
      fs.mkdirSync(path.join(directory, '.mew', 'docs'), { recursive: true })
      if (git) {
        await simpleGit(directory).init()
        fs.writeFileSync(path.join(directory, '.gitignore'), '.mew/temp/\n')
      }
      const state = this.read(), project = this.include(state, fs.realpathSync(directory), true)
      const key = accountKey(account), mine = state.myProjects[key] ?? { paths: [], icons: {} }
      if (!mine.paths.includes(project.path)) mine.paths.push(project.path)
      state.myProjects[key] = mine
      this.write(state)
      return { ...project, mine: true, icon: null }
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }
}

export const projectRegistry = new ProjectRegistry()
