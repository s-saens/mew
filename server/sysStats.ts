// Host resource samples shared by the header, alerts and process dialog.
import fs from 'node:fs'
import os from 'node:os'
import { processes as windowsProcesses } from './platform/windows/metrics.ts'
import { macProcesses } from './platform/macos/metrics.ts'
import { createGpuCollector, type GpuStat } from './gpu-stats.ts'
import { resourceSampleCache } from './resource-sample-cache.ts'
export { parsePsProcesses } from './platform/macos/metrics.ts'
export type { GpuStat } from './gpu-stats.ts'

export interface ProcStat {
  pid: number
  /** /proc/<pid>/stat의 comm — 커널이 15자로 자른다 */
  name: string
  /** 전체 명령줄(잘림). 목록 검색이 이걸 같이 본다 */
  cmd: string
  /** % — 코어 하나 기준(top과 같다). 멀티스레드 프로세스는 100을 넘는다 */
  cpu: number
  /** MB — RSS */
  memMb: number
  /** MB — nvidia-smi가 보고하는 이 pid의 GPU 메모리. GPU를 안 쓰면 0 */
  gpuMemMb: number
}

export interface SystemStats {
  cpu: {
    model: string
    cores: number
    /** % — 직전 호출 이후 구간의 평균. 첫 호출은 프로세스 시작 이후 평균이다 */
    usage: number | null
    loadavg: number[]
    /** ℃ — 센서가 노출되지 않으면 null */
    temperature: number | null
  }
  memory: { total: number; used: number; available: number }
  gpus: GpuStat[]
  /** cpu 내림차순. /proc이 없는 환경(비리눅스)에서는 빈 배열 */
  processes: ProcStat[]
  /** 초 */
  uptime: number
  hostname: string
}

interface CpuTimes {
  idle: number
  total: number
}

function cpuTimes(): CpuTimes {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle
    for (const v of Object.values(cpu.times)) total += v
  }
  return { idle, total }
}

// The summary cache keeps concurrent clients on the same CPU sampling interval.
let prevTimes = cpuTimes()

function cpuUsage(): number | null {
  const now = cpuTimes()
  const dTotal = now.total - prevTimes.total
  const dIdle = now.idle - prevTimes.idle
  prevTimes = now
  if (dTotal <= 0) return null
  return Math.min(100, Math.max(0, ((dTotal - dIdle) / dTotal) * 100))
}

function cpuTemperature(): number | null {
  try {
    for (const zone of fs.readdirSync('/sys/class/thermal')) {
      if (!zone.startsWith('thermal_zone')) continue
      const milli = Number(fs.readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf8').trim())
      if (Number.isFinite(milli) && milli > 0) return milli / 1000
    }
  } catch {
    // 센서 없음 — WSL·컨테이너에서 정상이다
  }
  return null
}

function memory(): SystemStats['memory'] {
  const total = os.totalmem()
  // freemem은 캐시를 쓴 메모리까지 사용 중으로 세서 리눅스에서 항상 과장된다 — MemAvailable이 실제 여유분
  let available = os.freemem()
  try {
    const m = /^MemAvailable:\s+(\d+) kB/m.exec(fs.readFileSync('/proc/meminfo', 'utf8'))
    if (m) available = Number(m[1]) * 1024
  } catch {
    // /proc 없음(비리눅스) — freemem으로 간다
  }
  return { total, available, used: Math.max(0, total - available) }
}

// 리눅스 기본값. sysconf(_SC_CLK_TCK)·getpagesize()를 노드에서 읽을 방법이 없다.
// ponytail: 이 값이 다른 아키텍처를 만나면 프로세스 CPU%만 비례해 틀어진다. 그때 sysconf를 부르는
// 애드온이나 `getconf CLK_TCK` 1회 캐시로 바꾼다.
const CLK_TCK = 100
const PAGE_SIZE = 4096

/** 프로세스별 CPU는 누적 tick의 차분이라 직전 표본이 필요하다 — 전역 표본 하나를 공유한다 */
let prevProcTicks = new Map<number, { ticks: number; at: number }>()

function linuxProcesses(gpuMem: Map<number, number>, cores: number): ProcStat[] {
  let entries: string[]
  try {
    entries = fs.readdirSync('/proc')
  } catch {
    return []
  }

  const now = Date.now()
  const next = new Map<number, { ticks: number; at: number }>()
  const out: ProcStat[] = []

  for (const entry of entries) {
    const pid = Number(entry)
    if (!Number.isInteger(pid) || pid <= 0) continue

    let stat: string
    try {
      stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8')
    } catch {
      continue // 읽는 사이 종료됐거나 권한 없음
    }

    // comm은 괄호에 싸여 있고 공백·괄호를 품을 수 있다 — 마지막 ')' 뒤부터 필드를 센다.
    // 그 뒤 배열의 index N은 stat(5)의 field N+3 이다: utime=14, stime=15, rss=24.
    const open = stat.indexOf('(')
    const close = stat.lastIndexOf(')')
    if (open < 0 || close < open) continue
    const fields = stat.slice(close + 2).split(' ')
    const ticks = Number(fields[11]) + Number(fields[12])
    const rssPages = Number(fields[21])
    if (!Number.isFinite(ticks) || !Number.isFinite(rssPages)) continue

    next.set(pid, { ticks, at: now })
    const prev = prevProcTicks.get(pid)
    let cpu = 0
    if (prev && now > prev.at) {
      const seconds = (now - prev.at) / 1000
      cpu = Math.max(0, ((ticks - prev.ticks) / CLK_TCK / seconds) * 100)
    }

    const memMb = (rssPages * PAGE_SIZE) / 1024 ** 2
    const gpuMemMb = gpuMem.get(pid) ?? 0
    // RSS도 CPU도 GPU도 0이면 커널 스레드다 — 목록에서 뺀다
    if (memMb === 0 && cpu === 0 && gpuMemMb === 0) continue

    let cmd = ''
    try {
      // 인자 구분자는 NUL이고, 인자 자체에 줄바꿈이 들어 있을 수 있다 — 한 줄로 눕힌다
      cmd = fs
        .readFileSync(`/proc/${entry}/cmdline`, 'utf8')
        .replace(/[\p{Cc}\s]+/gu, ' ')
        .trim()
        .slice(0, 200)
    } catch {
      // 종료됨 — 이름만으로 간다
    }

    out.push({
      pid,
      name: stat.slice(open + 1, close),
      cmd,
      cpu: Math.min(cores * 100, cpu),
      memMb,
      gpuMemMb,
    })
  }

  prevProcTicks = next
  return out.sort((a, b) => b.cpu - a.cpu)
}


async function processes(gpuMem: Map<number, number>, cores: number): Promise<ProcStat[]> {
  if (process.platform === 'win32') return windowsProcesses(gpuMem)
  if (process.platform === 'darwin') return macProcesses(gpuMem, cores)
  return linuxProcesses(gpuMem, cores)
}

type ResourceSummary = Omit<SystemStats, 'gpus' | 'processes'>

async function resourceSummary(): Promise<ResourceSummary> {
  const cpus = os.cpus()
  return {
    cpu: {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      usage: cpuUsage(),
      loadavg: os.loadavg(),
      temperature: cpuTemperature(),
    },
    memory: memory(),
    uptime: os.uptime(),
    hostname: os.hostname(),
  }
}

const gpu = createGpuCollector()

export function createSystemStatsCollector({
  summary = resourceSummary,
  gpus = gpu.gpus,
  processStats = async () => processes(await gpu.processMemory(), os.cpus().length),
  now = () => performance.now(),
}: {
  summary?: () => Promise<ResourceSummary>
  gpus?: () => Promise<GpuStat[]>
  processStats?: () => Promise<ProcStat[]>
  now?: () => number
} = {}) {
  const readSummary = resourceSampleCache(summary, 500, now)
  const readProcesses = resourceSampleCache(processStats, 2000, now)
  return async (options: { processes?: boolean } = {}): Promise<SystemStats> => {
    const [sample, gpuList, processList] = await Promise.all([
      readSummary(), gpus(), options.processes === false ? [] : readProcesses(),
    ])
    return { ...sample, gpus: gpuList, processes: processList }
  }
}

export const collectSystemStats = createSystemStatsCollector()
