import type { ReleaseConnectionConfig, ReleaseProviderRun, ReleaseProviderRunState, ReleaseProviderStep } from '../shared/release-providers.ts'
import { githubState, hasReleaseControl, record, ReleaseProviderClient, ReleaseProviderError, safeReleaseUrl } from './release-providers-common.ts'

export type ProviderTracking = Pick<ReleaseProviderRun, 'state' | 'providerRunId' | 'url' | 'resultUrl' | 'steps'> & { operationId?: string }

function identifier(value: unknown, numeric = false): string | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  return typeof value === 'string' && (numeric ? /^[1-9]\d{0,24}$/ : /^[a-zA-Z\d][a-zA-Z\d-]{0,199}$/).test(value) ? value : undefined
}

function label(value: unknown, fallback: string): string { return typeof value === 'string' ? Array.from(value).filter(character => !hasReleaseControl(character)).join('').slice(0, 200) || fallback : fallback }
function array(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.slice(0, 100).map(record) : [] }

function githubBase(config: Extract<ReleaseConnectionConfig, { provider: 'github-actions' }>): string {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/actions`
}
const githubHeaders = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' }

function pagesBase(config: Extract<ReleaseConnectionConfig, { provider: 'cloudflare-pages' }>): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.projectName}/deployments`
}
function pagesResult(data: Record<string, unknown>, uncertain: boolean): Record<string, unknown> {
  if (data.success === false) throw new ReleaseProviderError('Cloudflare가 요청을 거절했습니다. 프로젝트 설정과 연결 권한을 확인하세요.', 502)
  if (data.success !== true || !record(data.result).id) throw new ReleaseProviderError('Cloudflare 실행 번호를 확인하지 못했습니다. Cloudflare에서 실행 여부를 확인하세요.', 502, uncertain)
  return record(data.result)
}
function pageState(value: unknown): ReleaseProviderStep['state'] {
  if (value === 'success') return 'succeeded'
  if (value === 'active') return 'running'
  if (value === 'failure') return 'failed'
  if (value === 'canceled') return 'cancelled'
  if (value === 'skipped') return 'skipped'
  return 'pending'
}
function pagesTracking(config: Extract<ReleaseConnectionConfig, { provider: 'cloudflare-pages' }>, data: Record<string, unknown>, expectedId?: string): ProviderTracking {
  const id = identifier(data.id)
  if (!id || expectedId && id !== expectedId) throw new ReleaseProviderError('Cloudflare 실행 번호가 일치하지 않습니다. Cloudflare에서 상태를 확인하세요.', 502, !expectedId)
  const latest = record(data.latest_stage), latestState = pageState(latest.status)
  let state: ReleaseProviderRunState = 'queued'
  if (latestState === 'failed' || latestState === 'cancelled') state = latestState
  else if (data.is_skipped === true) state = 'cancelled'
  else if (latest.name === 'deploy' && latestState === 'succeeded') state = 'succeeded'
  else if (latestState !== 'pending') state = 'running'
  const resultUrl = state === 'succeeded' ? safeReleaseUrl(data.url) : undefined
  return { providerRunId: id, state, url: `https://dash.cloudflare.com/${config.accountId}/pages/view/${config.projectName}/${id}`, ...(resultUrl ? { resultUrl } : {}),
    steps: array(data.stages).map((stage, index) => ({ id: `${index}:${label(stage.name, 'stage')}`, label: label(stage.name, `Stage ${index + 1}`), state: pageState(stage.status) })) }
}

function googleBase(config: Extract<ReleaseConnectionConfig, { provider: 'google-cloud-build' }>): string {
  return `https://cloudbuild.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}`
}
function googleState(value: unknown): ReleaseProviderRunState {
  if (value === 'SUCCESS') return 'succeeded'
  if (value === 'WORKING') return 'running'
  if (value === 'PENDING' || value === 'QUEUED') return 'queued'
  if (value === 'CANCELLED') return 'cancelled'
  if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'EXPIRED'].includes(String(value))) return 'failed'
  return 'unknown'
}
function googleTracking(config: Extract<ReleaseConnectionConfig, { provider: 'google-cloud-build' }>, data: Record<string, unknown>, expectedId?: string): ProviderTracking {
  const id = identifier(data.id)
  if (!id || expectedId && id !== expectedId) throw new ReleaseProviderError('Google 실행 번호가 일치하지 않습니다. Google Cloud에서 상태를 확인하세요.', 502, !expectedId)
  return { providerRunId: id, state: googleState(data.status), url: `https://console.cloud.google.com/cloud-build/builds;region=${config.location}/${id}?project=${config.projectId}`,
    steps: array(data.steps).map((step, index) => ({ id: String(index), label: label(step.id, `Step ${index + 1}`), state: step.status ? googleState(step.status) : 'pending' })) }
}
function googleOperation(config: Extract<ReleaseConnectionConfig, { provider: 'google-cloud-build' }>, data: Record<string, unknown>, expected?: string): ProviderTracking {
  const prefix = `projects/${config.projectId}/locations/${config.location}/operations/`
  const name = typeof data.name === 'string' ? data.name : ''
  const operationId = name.startsWith(prefix) ? identifier(name.slice(prefix.length)) : expected
  if (!operationId || expected && operationId !== expected) throw new ReleaseProviderError('Google 작업 번호를 확인하지 못했습니다. Google Cloud에서 실행 여부를 확인하세요.', 502, !expected)
  const build = record(record(data.metadata).build)
  if (build.id) return { ...googleTracking(config, build), operationId }
  if (data.done && data.error) return { operationId, state: 'failed', steps: [] }
  return { operationId, state: data.done ? 'unknown' : 'queued', steps: [] }
}

export class ReleaseProviderAdapters {
  private client: ReleaseProviderClient
  constructor(request: typeof fetch) { this.client = new ReleaseProviderClient(request) }
  async start(config: ReleaseConnectionConfig, token: string): Promise<ProviderTracking> {
    switch (config.provider) {
      case 'github-actions': {
        const data = await this.client.json(`${githubBase(config)}/workflows/${encodeURIComponent(config.workflow)}/dispatches`, token, {
          method: 'POST', headers: githubHeaders, body: JSON.stringify({ ref: config.ref, return_run_details: true, ...(config.inputs ? { inputs: config.inputs } : {}) }),
        })
        const id = identifier(data.workflow_run_id, true)
        if (!id) throw new ReleaseProviderError('GitHub 실행 번호를 확인하지 못했습니다. GitHub에서 실행 여부를 확인하세요.', 502, true)
        return { providerRunId: id, state: 'queued', steps: [], url: `https://github.com/${config.owner}/${config.repo}/actions/runs/${id}` }
      }
      case 'cloudflare-pages': {
        const body = new FormData(); body.set('branch', config.branch)
        const data = await this.client.json(pagesBase(config), token, { method: 'POST', body })
        return pagesTracking(config, pagesResult(data, true))
      }
      case 'google-cloud-build': {
        const data = await this.client.json(`${googleBase(config)}/triggers/${config.triggerId}:run`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: config.projectId, triggerId: config.triggerId, source: { branchName: config.branch } }) })
        return googleOperation(config, data)
      }
    }
  }
  async refresh(config: ReleaseConnectionConfig, token: string, tracking: ProviderTracking): Promise<ProviderTracking> {
    switch (config.provider) {
      case 'github-actions': {
        if (!tracking.providerRunId) return tracking
        const id = tracking.providerRunId
        const data = await this.client.json(`${githubBase(config)}/runs/${id}`, token, { headers: githubHeaders })
        if (identifier(data.id, true) !== id) throw new ReleaseProviderError('GitHub 실행 번호가 일치하지 않습니다. GitHub에서 상태를 확인하세요.', 502)
        const jobs = await this.client.json(`${githubBase(config)}/runs/${id}/jobs?per_page=100`, token, { headers: githubHeaders })
        const steps: ReleaseProviderStep[] = array(jobs.jobs).map((job, index) => ({ id: String(identifier(job.id, true) ?? index), label: label(job.name, `Job ${index + 1}`), state: job.conclusion === 'skipped' ? 'skipped' : githubState(job.status, job.conclusion) }))
        return { ...tracking, state: githubState(data.status, data.conclusion), steps }
      }
      case 'cloudflare-pages': {
        if (!tracking.providerRunId) return tracking
        const data = await this.client.json(`${pagesBase(config)}/${tracking.providerRunId}`, token)
        return pagesTracking(config, pagesResult(data, false), tracking.providerRunId)
      }
      case 'google-cloud-build': {
        if (tracking.providerRunId) {
          const data = await this.client.json(`${googleBase(config)}/builds/${tracking.providerRunId}`, token)
          return { ...googleTracking(config, data, tracking.providerRunId), ...(tracking.operationId ? { operationId: tracking.operationId } : {}) }
        }
        if (!tracking.operationId) return tracking
        return googleOperation(config, await this.client.json(`${googleBase(config)}/operations/${tracking.operationId}`, token), tracking.operationId)
      }
    }
  }
}
