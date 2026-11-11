import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ProjectPipelineRun } from '../shared/project-pipelines.ts'
import type { ProjectAction } from '../shared/project-actions.ts'
import type { ReleaseConnectionConfig } from '../shared/release-providers.ts'
import type { ProjectActionRunRecord } from './project-actions.ts'
import { ProjectActionError } from './project-actions.ts'

const MAX_HISTORY_BYTES = 32 * 1024 * 1024
const MAX_HISTORY = 20

export interface PipelineRecord {
  owner: string
  ownerVersion: number | null
  run: ProjectPipelineRun
  actions: Record<string, ProjectAction>
  connections: Record<string, ReleaseConnectionConfig>
  actionRecords: Record<string, ProjectActionRunRecord>
  resultUrl?: string
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }

function validRecord(value: unknown): value is PipelineRecord {
  if (!object(value) || typeof value.owner !== 'string' || !(value.ownerVersion === null || typeof value.ownerVersion === 'number' && Number.isFinite(value.ownerVersion))
    || !object(value.run) || !object(value.actions) || !object(value.connections) || !object(value.actionRecords)) return false
  const run = value.run
  if (typeof run.id !== 'string' || typeof run.pipelineId !== 'string' || typeof run.name !== 'string' || typeof run.startedAt !== 'string'
    || !['preview', 'publish'].includes(String(run.purpose)) || !['running', 'succeeded', 'failed', 'interrupted', 'unknown'].includes(String(run.status))
    || !object(run.source) || !Array.isArray(run.steps) || !run.steps.length || run.steps.length > 12) return false
  if (!run.steps.every(step => object(step) && typeof step.id === 'string' && typeof step.name === 'string'
    && ['pending', 'running', 'succeeded', 'failed', 'interrupted', 'unknown', 'skipped'].includes(String(step.status))
    && (step.type === 'action' && typeof step.actionId === 'string' || step.type === 'provider' && typeof step.connectionId === 'string'))) return false
  return Object.values(value.actionRecords).every(record => object(record) && typeof record.rootIdentity === 'string' && object(record.run) && typeof record.run.id === 'string'
    && Array.isArray(record.run.artifacts) && (record.archiveFiles === undefined || Array.isArray(record.archiveFiles)))
}

export class PipelineStore {
  readonly histories = new Map<string, PipelineRecord[]>()
  readonly errors = new Map<string, string>()
  private readonly identities = new Map<string, string>()
  private readonly directory: string
  constructor(directory: string) { this.directory = directory }

  load(root: string): { records: PipelineRecord[]; fresh: boolean } {
    const stat = fs.statSync(root), identity = `${stat.dev}:${stat.ino}`
    if (this.identities.get(root) !== identity) {
      this.histories.delete(root); this.errors.delete(root); this.identities.set(root, identity)
    }
    const loaded = this.histories.get(root)
    if (loaded && !this.errors.has(root)) return { records: loaded, fresh: false }
    if (loaded) {
      this.histories.delete(root); this.errors.delete(root)
      const retried = this.load(root)
      if (this.errors.has(root)) { this.histories.set(root, loaded); return { records: loaded, fresh: false } }
      if (!loaded.length) return retried
      this.histories.set(root, loaded)
      try { this.save(root) }
      catch { this.errors.set(root, '실행 기록을 저장할 수 없습니다. 기록 저장 위치와 권한을 확인하세요.') }
      return { records: loaded, fresh: false }
    }
    let records: PipelineRecord[] = []
    try {
      const file = this.file(root)
      const stat = fs.lstatSync(file)
      if (!stat.isFile() || stat.size > MAX_HISTORY_BYTES) throw new Error('Invalid history file')
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: unknown; root?: unknown; rootIdentity?: unknown; records?: PipelineRecord[] }
      if (parsed.version !== 1 || parsed.root !== root || parsed.rootIdentity !== identity || !Array.isArray(parsed.records) || parsed.records.length > MAX_HISTORY
        || !parsed.records.every(validRecord)) throw new Error('Invalid history shape')
      records = parsed.records
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.errors.set(root, '실행 기록을 읽을 수 없습니다. 기록 저장 위치와 권한을 확인하세요. 기록을 복구하기 전에는 실행할 수 없습니다.')
    }
    this.histories.set(root, records)
    return { records, fresh: true }
  }

  save(root: string): void {
    if (this.errors.has(root)) throw new ProjectActionError(this.errors.get(root)!, 409)
    const records = this.histories.get(root) ?? []
    while (records.length > MAX_HISTORY) records.pop()
    const stat = fs.statSync(root), rootIdentity = `${stat.dev}:${stat.ino}`
    if (this.identities.get(root) !== rootIdentity) throw new ProjectActionError('프로젝트 폴더가 교체되어 이전 실행 기록을 저장하지 않았습니다.', 409)
    let contents = JSON.stringify({ version: 1, root, rootIdentity, records })
    while (Buffer.byteLength(contents) > MAX_HISTORY_BYTES && records.length > 1) {
      records.pop(); contents = JSON.stringify({ version: 1, root, rootIdentity, records })
    }
    if (Buffer.byteLength(contents) > MAX_HISTORY_BYTES) throw new ProjectActionError('실행 기록의 저장 한도를 초과했습니다.', 413)
    const file = this.file(root), temporary = `${file}.${randomUUID()}.tmp`
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      if (!fs.lstatSync(this.directory).isDirectory()) throw new Error('Invalid storage directory')
      fs.writeFileSync(temporary, `${contents}\n`, { flag: 'wx', mode: 0o600 })
      fs.renameSync(temporary, file)
    } catch { throw new ProjectActionError('실행 기록을 저장할 수 없습니다. 기록 저장 위치와 권한을 확인하세요.', 503) }
    finally { try { fs.unlinkSync(temporary) } catch { /* Already renamed. */ } }
  }

  private file(root: string): string { return path.join(this.directory, `${createHash('sha256').update(`${root}\0${this.identities.get(root)}`).digest('hex')}.json`) }
}
