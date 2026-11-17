import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { resourceSampleCache } from './resource-sample-cache.ts'

export interface GpuStat {
  name: string
  utilization: number | null
  memoryUsedMb: number | null
  memoryTotalMb: number | null
  temperature: number | null
}

interface GpuOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  release?: string
  readMounts?: () => string | Promise<string>
  executable?: (file: string) => boolean | Promise<boolean>
  run?: (command: string, args: string[]) => Promise<string>
  now?: () => number
}

const exec = promisify(execFile)
const execute = async (command: string, args: string[]) => (await exec(command, args, {
  encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024, windowsHide: true,
})).stdout
const executable = async (file: string) => {
  try { await fs.promises.access(file, fs.constants.X_OK); return true } catch { return false }
}
const unescapeMount = (value: string) => value.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))

async function windowsGpuCommand(options: GpuOptions): Promise<string | undefined> {
  const env = options.env ?? process.env
  const exists = options.executable ?? executable
  const fromPath = (env.PATH ?? '').split(':').filter(Boolean).map(dir => path.posix.join(dir, 'nvidia-smi.exe'))
  for (const file of fromPath) if (await exists(file)) return file
  let mounts = ''
  try { mounts = await (options.readMounts ?? (() => fs.promises.readFile('/proc/mounts', 'utf8')))() } catch { /* Try the standard Windows mount. */ }
  const roots = mounts.split('\n').flatMap(line => {
    const [source = '', mount = ''] = line.split(/\s+/).map(unescapeMount)
    return /^[A-Za-z]:[\\/]?$/.test(source) && mount.startsWith('/') ? [mount] : []
  })
  for (const root of new Set([...roots, '/mnt/c'])) {
    for (const relative of ['Windows/System32/nvidia-smi.exe', 'Program Files/NVIDIA Corporation/NVSMI/nvidia-smi.exe']) {
      const candidate = path.posix.join(root, relative)
      if (await exists(candidate)) return candidate
    }
  }
  return undefined
}

const numberOrNull = (value: string | undefined) => {
  if (!value?.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function parseGpus(stdout: string): GpuStat[] {
  return stdout.trim().split(/\r?\n/).filter(line => line.trim()).flatMap(line => {
    const [name, util, used, total, temp] = line.split(',').map(value => value.trim())
    if (!name || total === undefined || temp === undefined) return []
    return [{ name, utilization: numberOrNull(util), memoryUsedMb: numberOrNull(used), memoryTotalMb: numberOrNull(total), temperature: numberOrNull(temp) }]
  })
}

/** WSL's Linux NVML initialization can leak Windows driver pool memory. Use Windows interop exclusively. */
export function createGpuCollector(options: GpuOptions = {}) {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const wsl = platform === 'linux' && !!(env.WSL_DISTRO_NAME || env.WSL_INTEROP || /microsoft/i.test(options.release ?? os.release()))
  const run = options.run ?? execute
  let windowsCommand: string | undefined
  const command = async () => {
    if (!wsl) return platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi'
    // Reuse a working executable instead of probing slow Windows PATH entries for every sample.
    return windowsCommand ??= await windowsGpuCommand(options)
  }
  const gpus = resourceSampleCache(async (): Promise<GpuStat[]> => {
    try {
      const file = await command()
      if (!file) return []
      return parseGpus(await run(file, ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits']))
    } catch { windowsCommand = undefined; return [] }
  }, value => value.length ? 5000 : 30_000, options.now)

  const processMemory = resourceSampleCache(async () => {
    const values = new Map<number, number>()
    // Windows PIDs cannot be joined to the WSL /proc namespace.
    if (wsl || !(await gpus()).length) return values
    try {
      const file = await command()
      if (!file) return values
      const stdout = await run(file, ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'])
      for (const line of stdout.trim().split(/\r?\n/)) {
        const [rawPid, rawMb] = line.split(',')
        const pid = Number(rawPid), mb = numberOrNull(rawMb)
        if (Number.isInteger(pid) && pid > 0 && mb !== null) values.set(pid, (values.get(pid) ?? 0) + mb)
      }
    } catch { /* Process GPU memory is optional. */ }
    return values
  }, 5000, options.now)
  return { gpus, processMemory }
}
