import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Download } from 'iconoir-react'
import { useUiLocale } from '@mew/ui/i18n'
import type { ProjectActionArtifact } from '../../shared/project-actions'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { DownloadLink } from './DownloadLink'
import { projectActionsStore, recentProjectActionRuns, type ProjectActionsScope } from './ProjectActionsState'
import { projectActionsCopy } from './project-actions-copy'

function fileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Output paths found on disk are presented separately from recorded successful runs. */
export function ProjectAvailableArtifacts({ project, directory, workspacePath, placement = 'menu' }: ProjectActionsScope & { placement?: 'menu' | 'dialog' }) {
  const api = useWorkspaceApi(), locale = useUiLocale(), copy = projectActionsCopy(locale)
  const store = useMemo(() => projectActionsStore(api, { project, directory, workspacePath }), [api, project, directory, workspacePath])
  const { state } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [found, setFound] = useState<ProjectActionArtifact[]>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const labels = {
    en: { found: 'Found build files', recorded: 'Recent build files', failed: 'Could not find build files.', retry: 'Retry' },
    ko: { found: '찾은 빌드 파일', recorded: '최근 빌드 파일', failed: '빌드 파일을 찾지 못했습니다.', retry: '다시 시도' },
    ja: { found: '見つかったビルドファイル', recorded: '最近のビルドファイル', failed: 'ビルドファイルを取得できませんでした。', retry: '再試行' },
    'zh-CN': { found: '找到的构建文件', recorded: '最近的构建文件', failed: '无法获取构建文件。', retry: '重试' },
  }[locale]

  useEffect(() => {
    let active = true
    let pending = false, failures = 0
    if (placement === 'menu') void store.load(false)
    const refresh = () => {
      if (pending || failures >= 12) return
      pending = true
      api.fetchAvailableProjectArtifacts(project, directory, workspacePath)
        .then(result => { if (active) { failures = 0; setFailed(false); setFound(Array.isArray(result.artifacts) ? result.artifacts : []) } })
        .catch(() => { if (active) { failures++; setFailed(true) } })
        .finally(() => { pending = false })
    }
    refresh()
    const timer = setInterval(refresh, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [api, store, project, directory, workspacePath, placement, attempt])

  const latest = placement === 'menu' ? recentProjectActionRuns((state?.runs ?? []).filter(run => run.kind === 'build' && run.status === 'succeeded' && run.artifacts.length > 0))[0] : undefined
  const recorded = latest?.artifacts ?? []
  const discovered = found.filter(file => !recorded.some(item => item.path === file.path))
  const renderFile = (file: ProjectActionArtifact, href: string, duplicate: boolean) => <div key={file.path} data-command-row={placement === 'menu' || undefined}>
    <DownloadLink href={href} name={file.name} className={placement === 'menu' ? 'mew-action-menu-item min-w-0' : 'flex w-full min-w-0 items-center gap-2 rounded-md border border-edge px-2 py-2 text-left text-xs hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ink'}>
      <Download width={16} height={16} aria-hidden="true" />
      <span className="sr-only">{copy.download} {file.name}{duplicate ? ` (${file.path})` : ''}</span>
      <span aria-hidden="true" className="min-w-0 flex-1">
        <span className="block truncate">{file.name}{placement === 'menu' && duplicate ? ` (${file.path})` : ''}</span>
        {placement === 'dialog' && (duplicate || file.size != null) && <span className="block break-all text-ink-secondary">{duplicate ? file.path : ''}{duplicate && file.size != null ? ' · ' : ''}{file.size != null ? fileSize(file.size) : ''}</span>}
      </span>
      {placement === 'menu' && file.size != null && <span aria-hidden="true" className="shrink-0 text-xs text-ink-secondary">{fileSize(file.size)}</span>}
    </DownloadLink>
  </div>
  if (!recorded.length && !discovered.length && !failed) return null
  return <div className={placement === 'menu' ? 'border-t border-edge py-1' : 'mt-4 border-t border-edge pt-3'} data-project-available-artifacts>
    {discovered.length > 0 && <><div className="px-3 py-1 text-xs text-ink-secondary">{labels.found}</div>
      {discovered.map(file => renderFile(file, api.availableProjectArtifactUrl(project, file.path, directory, workspacePath), discovered.some(other => other !== file && other.name === file.name)))}</>}
    {recorded.length > 0 && <><div className="px-3 py-1 text-xs text-ink-secondary">{labels.recorded}</div>
      {recorded.map(file => renderFile(file, store.artifactUrl(latest!.id, file.path), recorded.some(other => other !== file && other.name === file.name)))}</>}
    {failed && <div className="px-3 py-1 text-xs text-ink-secondary">{labels.failed} <button type="button" className="underline" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{labels.retry}</button></div>}
  </div>
}
