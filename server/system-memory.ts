import fs from 'node:fs'
import os from 'node:os'
import { readMacMemoryUsed } from './platform/macos/memory.ts'

export type SystemMemory = { total: number; used: number; available: number }

export async function readSystemMemory({
  platform = process.platform,
  total = os.totalmem(),
  free = os.freemem(),
  readLinux = () => fs.readFileSync('/proc/meminfo', 'utf8'),
  readMac = readMacMemoryUsed,
}: {
  platform?: NodeJS.Platform
  total?: number
  free?: number
  readLinux?: () => string
  readMac?: (total: number) => Promise<number | null>
} = {}): Promise<SystemMemory> {
  let available = free
  if (platform === 'darwin') {
    try {
      const used = await readMac(total)
      if (used !== null && Number.isFinite(used) && used >= 0 && used <= total) available = total - used
    } catch {
      // Preserve the existing free-memory fallback if the platform sample fails.
    }
  } else if (platform === 'linux') {
    try {
      const match = /^MemAvailable:\s+(\d+) kB/m.exec(readLinux())
      if (match) available = Number(match[1]) * 1024
    } catch {
      // Preserve the existing free-memory fallback if /proc is unavailable.
    }
  }
  return { total, available, used: Math.max(0, total - available) }
}
