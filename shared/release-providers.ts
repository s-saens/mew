export type ReleaseProviderId = 'github-actions' | 'cloudflare-pages' | 'google-cloud-build'

export type ReleaseConnectionConfig =
  | { provider: 'github-actions'; label: string; owner: string; repo: string; workflow: string; ref: string; inputs?: Record<string, string | boolean | number> }
  | { provider: 'cloudflare-pages'; label: string; accountId: string; projectName: string; branch: string }
  | { provider: 'google-cloud-build'; label: string; projectId: string; location: string; triggerId: string; branch: string }

export interface ReleaseConnectionSummary {
  id: string
  provider: ReleaseProviderId
  label: string
  config: ReleaseConnectionConfig
  connected: boolean
}

export type ReleaseProviderRunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown'

export interface ReleaseProviderStep {
  id: string
  label: string
  state: ReleaseProviderRunState | 'pending' | 'skipped'
}

export interface ReleaseProviderRun {
  id: string
  connectionId: string
  provider: ReleaseProviderId
  state: ReleaseProviderRunState
  createdAt: number
  updatedAt: number
  providerRunId?: string
  url?: string
  resultUrl?: string
  steps: ReleaseProviderStep[]
  error?: string
}

export interface ReleaseProvidersState {
  connections: ReleaseConnectionSummary[]
  runs: ReleaseProviderRun[]
}

export interface SaveReleaseConnection {
  id?: string
  config: ReleaseConnectionConfig
  token?: string
}
