import { randomUUID } from 'node:crypto'
import type { ReleaseConnectionConfig, ReleaseConnectionSummary, ReleaseProviderRun, ReleaseProvidersState, SaveReleaseConnection } from '../shared/release-providers.ts'
import { connectionConfig, hasReleaseControl, record, ReleaseProviderError } from './release-providers-common.ts'
import { ReleaseProviderAdapters, type ProviderTracking } from './release-providers-adapters.ts'
import { ReleaseProvidersStore, releaseProvidersStore, type ReleaseScope, type StoredReleaseConnection, type StoredReleaseRun, type StoredReleaseState } from './release-providers-store.ts'

export { ReleaseProviderError } from './release-providers-common.ts'
export { removeReleaseProviderAccount } from './release-providers-store.ts'

function summary(value: StoredReleaseConnection): ReleaseConnectionSummary {
  return { id: value.id, provider: value.config.provider, label: value.config.label, config: structuredClone(value.config), connected: !!value.token }
}
function snapshot(value: StoredReleaseRun): ReleaseProviderRun {
  return { id: value.id, connectionId: value.connectionId, provider: value.provider, state: value.state, createdAt: value.createdAt, updatedAt: value.updatedAt,
    ...(value.providerRunId ? { providerRunId: value.providerRunId } : {}), ...(value.url ? { url: value.url } : {}), ...(value.resultUrl ? { resultUrl: value.resultUrl } : {}),
    steps: structuredClone(value.steps), ...(value.error ? { error: value.error } : {}) }
}
function terminal(state: ReleaseProviderRun['state']): boolean { return state === 'succeeded' || state === 'failed' || state === 'cancelled' }
function target(config: SaveReleaseConnection['config']): string { const { label: _label, ...rest } = config; return JSON.stringify(rest) }

export class ReleaseProvidersService {
  private store: ReleaseProvidersStore
  private adapters: ReleaseProviderAdapters
  private pending = new Map<string, Promise<ReleaseProviderRun>>()
  private active = new Set<string>()
  constructor(options: { storage?: string; request?: typeof fetch; accountVersion?: (owner: string) => number | null } = {}) {
    this.store = options.storage || options.accountVersion ? new ReleaseProvidersStore(options.storage, options.accountVersion) : releaseProvidersStore
    this.adapters = new ReleaseProviderAdapters(options.request ?? fetch)
  }
  state(root: string, owner: string): ReleaseProvidersState {
    const scope = this.store.scope(root, owner), value = this.store.read(scope)
    let recovered = false
    for (const run of value.runs) {
      if (run.state !== 'queued' || run.providerRunId || run.operationId || this.active.has(run.id)) continue
      Object.assign(run, { state: 'unknown', error: '이전 요청의 실행 여부를 확인할 수 없습니다. 서비스 화면에서 확인하세요.', updatedAt: Date.now(), revision: run.revision + 1 })
      recovered = true
    }
    if (recovered) this.store.write(scope, value)
    return { connections: value.connections.map(summary), runs: value.runs.map(snapshot).reverse() }
  }
  findByRequestId(root: string, owner: string, requestId: string): ReleaseProviderRun | undefined {
    const value = this.store.read(this.store.scope(root, owner))
    const run = value.runs.find(item => item.requestId === requestId)
    return run ? snapshot(run) : undefined
  }
  save(root: string, owner: string, input: SaveReleaseConnection): ReleaseConnectionSummary {
    const scope = this.store.scope(root, owner), value = this.store.read(scope), config = connectionConfig(record(input).config)
    if (input.id !== undefined && typeof input.id !== 'string') throw new ReleaseProviderError('공개 서비스 연결을 선택하세요.')
    const existing = input.id ? value.connections.find(item => item.id === input.id) : undefined
    if (input.id && !existing) throw new ReleaseProviderError('공개 서비스 연결을 찾을 수 없습니다.', 404)
    if (!existing && value.connections.length >= 20) throw new ReleaseProviderError('프로젝트에 공개 서비스를 최대 20개까지 연결할 수 있습니다.')
    let token = existing?.token ?? ''
    if (input.token !== undefined) {
      if (typeof input.token !== 'string' || !input.token || input.token.length > 8192 || hasReleaseControl(input.token) || /\s/u.test(input.token)) throw new ReleaseProviderError('접근 토큰을 확인하세요.')
      token = input.token
    }
    if (existing && existing.config.provider !== config.provider && input.token === undefined) token = ''
    const connection: StoredReleaseConnection = { id: existing?.id ?? randomUUID(), generation: existing && target(existing.config) === target(config) ? existing.generation : randomUUID(), config, token }
    if (existing) value.connections[value.connections.indexOf(existing)] = connection
    else value.connections.push(connection)
    this.store.write(scope, value)
    return summary(connection)
  }
  remove(root: string, owner: string, id: unknown): void {
    const scope = this.store.scope(root, owner), value = this.store.read(scope)
    const index = value.connections.findIndex(connection => connection.id === id)
    if (index < 0) throw new ReleaseProviderError('공개 서비스 연결을 찾을 수 없습니다.', 404)
    value.connections.splice(index, 1)
    this.store.write(scope, value)
  }
  async start(root: string, owner: string, connectionId: unknown, requestId: unknown, expectedConfig?: ReleaseConnectionConfig): Promise<ReleaseProviderRun> {
    if (typeof requestId !== 'string' || !/^[\w.:-]{1,200}$/.test(requestId)) throw new ReleaseProviderError('실행 요청 번호가 필요합니다.')
    const scope = this.store.scope(root, owner), key = JSON.stringify([scope, requestId])
    const value = this.store.read(scope)
    const previous = value.runs.find(run => run.requestId === requestId)
    if (previous) {
      if (previous.connectionId !== connectionId) throw new ReleaseProviderError('같은 요청 번호로 다른 공개 서비스를 실행할 수 없습니다.', 409)
      const pending = this.pending.get(key)
      if (pending) return pending
      // A restart after recording intent cannot prove whether a POST reached the provider.
      if (previous.state === 'queued' && !previous.providerRunId && !previous.operationId) {
        previous.state = 'unknown'; previous.error = '이전 요청의 실행 여부를 확인할 수 없습니다. 서비스 화면에서 확인하세요.'; previous.updatedAt = Date.now(); previous.revision++; this.store.write(scope, value)
      }
      return snapshot(previous)
    }
    const connection = this.connection(value, connectionId)
    if (expectedConfig && JSON.stringify(connection.config) !== JSON.stringify(connectionConfig(expectedConfig))) throw new ReleaseProviderError('검토한 공개 설정이 변경되었습니다. 다시 검토하세요.', 409)
    if (value.runs.some(run => run.connectionId === connection.id && (run.state === 'queued' || run.state === 'running'))) throw new ReleaseProviderError('이미 실행 중입니다. 현재 실행이 끝난 뒤 다시 시도하세요.', 409)
    while (value.runs.length >= 200) {
      const old = value.runs.findIndex(run => terminal(run.state))
      if (old < 0) throw new ReleaseProviderError('확인이 필요한 실행이 많습니다. 공개 서비스 화면에서 상태를 확인하세요.', 409)
      value.runs.splice(old, 1)
    }
    const now = Date.now()
    const run: StoredReleaseRun = { id: randomUUID(), connectionId: connection.id, provider: connection.config.provider, requestId, config: structuredClone(connection.config), generation: connection.generation, revision: 0, state: 'queued', createdAt: now, updatedAt: now, steps: [] }
    value.runs.push(run)
    // Durable intent precedes the external side effect, so recovery never dispatches blindly.
    this.store.write(scope, value)
    this.active.add(run.id)
    const task = this.begin(scope, connection, run)
    this.pending.set(key, task)
    try { return await task } finally { this.pending.delete(key); this.active.delete(run.id) }
  }
  private async begin(scope: ReleaseScope, connection: StoredReleaseConnection, run: StoredReleaseRun): Promise<ReleaseProviderRun> {
    let update: ProviderTracking & { error?: string }
    try { update = await this.adapters.start(run.config, connection.token) }
    catch (error) { update = { state: error instanceof ReleaseProviderError && !error.uncertain ? 'failed' : 'unknown', steps: [], error: error instanceof ReleaseProviderError ? error.message : '공개 요청의 실행 여부를 확인하지 못했습니다. 서비스 화면에서 확인하세요.' } }
    return this.complete(scope, run, update, connection.token)
  }
  async refresh(root: string, owner: string, runId: unknown): Promise<ReleaseProviderRun> {
    const scope = this.store.scope(root, owner), value = this.store.read(scope), run = value.runs.find(item => item.id === runId)
    if (!run) throw new ReleaseProviderError('공개 실행을 찾을 수 없습니다.', 404)
    if (!run.providerRunId && !run.operationId) return snapshot(run)
    const connection = this.connection(value, run.connectionId)
    if (connection.generation !== run.generation) throw new ReleaseProviderError('공개 서비스의 대상이 변경되었습니다. 기존 실행은 서비스 화면에서 확인하세요.', 409)
    let update: ProviderTracking & { error?: string }
    try { update = await this.adapters.refresh(run.config, connection.token, run) }
    catch (error) { update = { ...run, state: terminal(run.state) ? run.state : 'unknown', error: error instanceof ReleaseProviderError ? error.message : '실행 상태를 확인하지 못했습니다. 서비스 화면에서 확인하세요.' } }
    return this.complete(scope, run, update, connection.token)
  }
  private connection(value: StoredReleaseState, id: unknown): StoredReleaseConnection {
    const connection = value.connections.find(item => item.id === id)
    if (!connection) throw new ReleaseProviderError('공개 서비스 연결을 찾을 수 없습니다.', 404)
    if (!connection.token) throw new ReleaseProviderError('연결 설정에서 접근 토큰을 추가하세요.', 428)
    return connection
  }
  private complete(scope: ReleaseScope, run: StoredReleaseRun, update: ProviderTracking & { error?: string }, token: string): ReleaseProviderRun {
    if (!this.store.current(scope)) throw new ReleaseProviderError('계정이나 프로젝트가 변경되었습니다. 서비스 화면에서 실행 여부를 확인하세요.', 409)
    const current = this.store.read(scope), connection = current.connections.find(item => item.id === run.connectionId), saved = current.runs.find(item => item.id === run.id)
    if (!saved) throw new ReleaseProviderError('실행 기록을 찾을 수 없습니다. 서비스 화면에서 실행 여부를 확인하세요.', 409)
    if (saved.revision !== run.revision) return snapshot(saved)
    const scrub = (value: string) => value.split(token).join('[redacted]')
    const result: StoredReleaseRun = { ...saved, ...update, revision: saved.revision + 1, steps: update.steps.map(step => ({ ...step, id: scrub(step.id), label: scrub(step.label) })), updatedAt: Date.now() }
    if (update.error) result.error = scrub(update.error)
    else delete result.error
    for (const key of ['url', 'resultUrl'] as const) if (result[key]?.includes(token)) delete result[key]
    for (const key of ['providerRunId', 'operationId'] as const) {
      if (!result[key]?.includes(token)) continue
      delete result[key]; result.state = 'unknown'; result.error = '서비스 실행 번호를 확인하지 못했습니다. 서비스 화면에서 확인하세요.'
    }
    if (!connection || connection.generation !== run.generation) {
      result.state = 'unknown'; result.error = '연결 설정이 변경되었습니다. 서비스 화면에서 이전 실행을 확인하세요.'
    }
    // Re-read and replace only this run; never restore old tokens or removed connections.
    current.runs[current.runs.indexOf(saved)] = result
    this.store.write(scope, current)
    return snapshot(result)
  }
}

export const releaseProvidersService = new ReleaseProvidersService()
