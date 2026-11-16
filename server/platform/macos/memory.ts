import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Estimate the physical memory in use, excluding reclaimable cached files. */
export function parseVmStatUsed(text: string, total: number): number | null {
  const pageSize = Number(/^Mach Virtual Memory Statistics:\s*\(page size of (\d+) bytes\)/m.exec(text)?.[1])
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || !Number.isSafeInteger(total) || total <= 0) return null

  const counts: number[] = []
  for (const name of ['Anonymous pages', 'Pages wired down', 'Pages occupied by compressor', 'Pages purgeable']) {
    const lines = text.split('\n').filter(line => line.startsWith(`${name}:`))
    if (lines.length !== 1) return null
    const match = /^.+:\s*(\d+)\.\s*$/.exec(lines[0])
    if (!match) return null
    const value = Number(match[1])
    if (!Number.isSafeInteger(value) || value * pageSize > total) return null
    counts.push(value)
  }
  const [anonymous, wired, compressed, purgeable] = counts
  const used = (anonymous + wired + compressed - purgeable) * pageSize
  return Number.isSafeInteger(used) && used >= 0 && used <= total ? used : null
}

export async function readMacMemoryUsed(total: number): Promise<number | null> {
  try {
    const { stdout } = await run('/usr/bin/vm_stat', [], {
      encoding: 'utf8', timeout: 1000, maxBuffer: 64 * 1024, env: { ...process.env, LC_ALL: 'C' },
    })
    return parseVmStatUsed(stdout, total)
  } catch {
    return null
  }
}
