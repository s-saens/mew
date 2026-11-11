import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ProjectPipeline, ProjectPipelineStep } from '../shared/project-pipelines.ts'
import type { ProjectAction } from '../shared/project-actions.ts'
import type { ReleaseConnectionSummary } from '../shared/release-providers.ts'
import { assertNotServerDataPath } from './paths.ts'
import { ProjectActionError } from './project-actions.ts'

const MAX_CONFIG = 262_144
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value)
const nameOf = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function pipelineRoot(directory: string): string {
  const root = fs.realpathSync(directory)
  assertNotServerDataPath(root)
  if (!fs.statSync(root).isDirectory()) throw new ProjectActionError('프로젝트 폴더가 필요합니다.')
  return root
}

export function normalizeProjectPipelines(input: unknown): ProjectPipeline[] {
  if (!Array.isArray(input) || input.length > 30) throw new ProjectActionError('프로젝트 흐름은 최대 30개까지 배열로 입력하세요.')
  const ids = new Set<string>()
  return input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProjectActionError('프로젝트 흐름 형식이 올바르지 않습니다.')
    const item = value as Record<string, unknown>, name = nameOf(item.name)
    if (!validId(item.id) || ids.has(item.id) || !name || name.length > 80 || !['preview', 'publish'].includes(String(item.purpose))) throw new ProjectActionError('흐름 ID, 이름, 목적을 확인하세요.')
    if (!Array.isArray(item.steps) || !item.steps.length || item.steps.length > 12) throw new ProjectActionError('실행 단계는 1개에서 12개까지 입력하세요.')
    const stepIds = new Set<string>()
    const steps = item.steps.map((value): ProjectPipelineStep => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProjectActionError('단계 형식이 올바르지 않습니다.')
      const step = value as Record<string, unknown>, name = nameOf(step.name)
      if (!validId(step.id) || stepIds.has(step.id) || !name || name.length > 80) throw new ProjectActionError('단계 ID와 이름을 확인하세요.')
      stepIds.add(step.id)
      if (step.type === 'action' && validId(step.actionId)) return { id: step.id, name, type: 'action', actionId: step.actionId }
      if (step.type === 'provider' && validId(step.connectionId)) return { id: step.id, name, type: 'provider', connectionId: step.connectionId }
      throw new ProjectActionError('단계에서 실행할 작업이나 연결을 선택하세요.')
    })
    let resultUrl: string | undefined
    if (item.resultUrl !== undefined && item.resultUrl !== '') {
      if (typeof item.resultUrl !== 'string' || item.resultUrl.length > 2_000) throw new ProjectActionError('결과 주소를 확인하세요.')
      try {
        const url = new URL(item.resultUrl)
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid URL')
        resultUrl = url.href
      } catch { throw new ProjectActionError('결과 주소는 HTTP 또는 HTTPS 주소를 입력하세요.') }
    }
    ids.add(item.id)
    return { id: item.id, name, purpose: item.purpose as ProjectPipeline['purpose'], steps, ...(resultUrl ? { resultUrl } : {}) }
  })
}

function configFile(root: string): string {
  const directory = path.join(root, '.mew'), file = path.join(directory, 'project-pipelines.json')
  if (fs.existsSync(directory) && !fs.lstatSync(directory).isDirectory()) throw new ProjectActionError('.mew 설정은 실제 폴더여야 합니다.')
  try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.size > MAX_CONFIG) throw new ProjectActionError('프로젝트 흐름 설정은 256KB 이하의 일반 파일이어야 합니다.') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return file
}

export function readPipelines(root: string): { pipelines: ProjectPipeline[]; saved: boolean; invalid: boolean; warnings: string[] } {
  try {
    let raw: string
    try { raw = fs.readFileSync(configFile(root), 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { pipelines: [], saved: false, invalid: false, warnings: [] }; throw error }
    const input = JSON.parse(raw) as { version?: unknown; pipelines?: unknown }
    if (input?.version !== 1) throw new Error('Unsupported pipeline configuration')
    return { pipelines: normalizeProjectPipelines(input.pipelines), saved: true, invalid: false, warnings: [] }
  } catch { return { pipelines: [], saved: true, invalid: true, warnings: ['프로젝트 흐름 설정을 읽을 수 없습니다. 프로젝트 작업은 계속할 수 있습니다. 설정을 수정하거나 에이전트에게 도움을 요청하세요.'] } }
}

export function writePipelines(root: string, pipelines: ProjectPipeline[]): void {
  const contents = `${JSON.stringify({ version: 1, pipelines }, null, 2)}\n`
  if (Buffer.byteLength(contents) > MAX_CONFIG) throw new ProjectActionError('프로젝트 흐름 설정은 256KB 이하여야 합니다.')
  const file = configFile(root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temporary, contents, { flag: 'wx' }); fs.renameSync(temporary, file) }
  finally { try { fs.unlinkSync(temporary) } catch { /* Already renamed. */ } }
}

const stableId = (kind: string, id: string) => `${kind}:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`

export function defaultPipelines(actions: ProjectAction[], connections: ReleaseConnectionSummary[]): ProjectPipeline[] {
  const builds = actions.filter(action => action.kind === 'build'), deploys = actions.filter(action => action.kind === 'deploy')
  const preferredBuild = builds.find(action => action.variant === 'release') ?? builds[0]
  const previews: ProjectPipeline[] = builds.map(action => ({ id: stableId('preview', action.id), name: action.name, purpose: 'preview', steps: [{ id: 'build', name: action.name, type: 'action', actionId: action.id }] }))
  const published: ProjectPipeline[] = deploys.map(action => ({ id: stableId('publish', action.id), name: action.name, purpose: 'publish', steps: [...(preferredBuild ? [{ id: 'build', name: preferredBuild.name, type: 'action' as const, actionId: preferredBuild.id }] : []), { id: 'publish', name: action.name, type: 'action', actionId: action.id }] }))
  const remote: ProjectPipeline[] = connections.map(connection => ({ id: stableId('provider', connection.id), name: connection.label, purpose: 'publish', steps: [{ id: 'publish', name: connection.label, type: 'provider', connectionId: connection.id }] }))
  return [...previews, ...published, ...remote].slice(0, 30)
}
