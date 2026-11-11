import test from 'node:test'
import assert from 'node:assert/strict'
import type { ProjectActionRun } from '../../shared/project-actions.ts'
import type { ProjectPipelineRun } from '../../shared/project-pipelines.ts'
import { latestProjectReleaseResult } from './project-release-view.ts'

const action = (id: string, at: string, extra: Partial<ProjectActionRun> = {}): ProjectActionRun => ({ id, actionId: id, name: id, kind: 'build', status: 'succeeded', startedAt: at, finishedAt: at, output: '', artifacts: [], ...extra })
const pipeline = (id: string, at: string, extra: Partial<ProjectPipelineRun> = {}): ProjectPipelineRun => ({ id, pipelineId: id, name: id, purpose: 'preview', status: 'succeeded', startedAt: at, finishedAt: at, source: { dirty: false }, steps: [], ...extra })

test('a newer build with files takes priority over an older website preview', () => {
  const older = pipeline('older', '2026-01-01T00:00:00Z', { resultUrl: 'https://old.example.com' })
  const newer = action('newer', '2026-01-02T00:00:00Z', { artifacts: [{ path: 'app.apk', name: 'app.apk' }] })
  assert.deepEqual(latestProjectReleaseResult([older], [newer]), { action: newer, at: newer.finishedAt })
})

test('a completed build without a connected result keeps the last available result accessible', () => {
  const older = action('older', '2026-01-01T00:00:00Z', { previewUrl: 'https://available.example.com' })
  const newer = action('newer', '2026-01-02T00:00:00Z')
  assert.deepEqual(latestProjectReleaseResult([], [newer, older]), { action: older, url: older.previewUrl, at: older.finishedAt })
})

test('a successful website-only pipeline is usable without an embedded action run', () => {
  const result = pipeline('website', '2026-01-01T00:00:00Z', { resultUrl: 'https://preview.example.com' })
  assert.deepEqual(latestProjectReleaseResult([result], []), { url: result.resultUrl, at: result.finishedAt })
})

test('incomplete or failed steps cannot produce a successful result', () => {
  const result = pipeline('failed', '2026-01-01T00:00:00Z', { status: 'failed', resultUrl: 'https://invalid.example.com', steps: [{ id: 'step', name: 'Build', type: 'action', actionId: 'build', status: 'failed', actionRun: action('failed-action', '2026-01-01T00:00:00Z', { status: 'failed', previewUrl: 'https://invalid.example.com' }) }] })
  assert.equal(latestProjectReleaseResult([result], []), undefined)
})
