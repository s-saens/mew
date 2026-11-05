import type { AgentJobView, MewUpdateStatus, SystemStats } from '../api/client.ts'
import type { UpdatesStatus } from '../../shared/updates.ts'

export function demoSystemStats(now = Date.now()): SystemStats {
  const wave = Math.sin(now / 4200), total = 16 * 1024 ** 3, used = Math.round((6.2 + wave * .15) * 1024 ** 3)
  return {
    hostname: 'mew-demo', uptime: 86400 + Math.floor(now / 1000) % 86400,
    cpu: { model: 'Demo CPU · 8 cores', cores: 8, usage: 24 + wave * 6, loadavg: [1.42, 1.18, .96], temperature: 48 + wave * 2 },
    memory: { total, used, available: total - used },
    gpus: [{ name: 'Demo GPU', utilization: 18 + wave * 4, memoryUsedMb: 1280, memoryTotalMb: 8192, temperature: 44 }],
    processes: [
      { pid: 1200, name: 'mew', cmd: 'node server/index.ts (demo)', cpu: 12 + wave, memMb: 384, gpuMemMb: 0 },
      { pid: 1201, name: 'agent', cmd: 'demo-agent · simulated', cpu: 8, memMb: 256, gpuMemMb: 0 },
      { pid: 1202, name: 'desktop', cmd: 'demo desktop renderer', cpu: 4, memMb: 96, gpuMemMb: 1280 },
    ],
  }
}

export const demoMewUpdate: MewUpdateStatus = { supported: true, canUpdate: true, branch: 'demo', localHash: 'demo001', remoteHash: 'demo002', ahead: 0, behind: 1, available: true, dirty: false, running: false, managedByMew: true, error: null, job: null }
export const demoUpdates: UpdatesStatus = {
  checkedAt: 0, job: { running: false, items: [] },
  items: [
    { id: 'demo-agent', label: 'Demo agent', category: 'agent', current: '1.0-demo', latest: '1.1-demo', available: true, canUpdate: true, error: null },
    { id: 'demo-desktop', label: 'Remote desktop · Demo', category: 'system', current: '1.0-demo', latest: '1.1-demo', available: true, canUpdate: true, error: null },
    { id: 'demo-dependencies', label: 'Mew dependencies · Demo', category: 'dependency', current: 'snapshot.1', latest: 'snapshot.2', available: true, canUpdate: true, error: null },
  ],
}

export function demoScheduleJobs(project: string): AgentJobView[] {
  return [
    { id: 'demo-docs', name: '문서 변경 요약 · Demo', cron: '0 9 * * 1-5', project, agent: 'codex', agentSetId: 'demo-default', prompt: '바뀐 문서를 요약하고 확인할 항목을 정리해 주세요.', enabled: true },
    { id: 'demo-tasks', name: '태스크 검토 · Demo', cron: '0 14 * * 1', project, agent: 'codex', agentSetId: 'demo-default', prompt: '미완료 태스크와 다음 작업을 정리해 주세요.', enabled: false },
  ].map(job => ({ ...job, command: `demo-agent --job ${job.id} (simulated)`, lastRun: null, session: `mewcmd-job-${job.id}`, running: false }))
}
