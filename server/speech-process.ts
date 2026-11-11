import { spawnHostProcess, stopProcessGroup } from './platform/process.ts'

interface ProcessOptions { signal: AbortSignal; maxBuffer: number; timeout: number }
interface ProcessDependencies { spawn: typeof spawnHostProcess; stop: typeof stopProcessGroup }
const KILL_GRACE_MS = 2_000

/** Keep the caller's lease until the process and its streams have closed. */
export function runSpeechProcess(command: string, args: string[], options: ProcessOptions, dependencies: ProcessDependencies = { spawn: spawnHostProcess, stop: stopProcessGroup }): Promise<{ stdout: string }> {
  if (options.signal.aborted) return Promise.reject(new Error('Speech process cancelled'))
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawnHostProcess>
    try {
      child = dependencies.spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    } catch { reject(new Error('Speech process could not start')); return }
    const chunks: Buffer[] = []
    let bytes = 0, failure: Error | null = null, escalation: ReturnType<typeof setTimeout> | undefined
    const stop = (reason: string) => {
      if (failure) return
      failure = new Error(reason)
      if (child.pid) dependencies.stop(child.pid, 'SIGTERM')
      escalation = setTimeout(() => { if (child.pid) dependencies.stop(child.pid, 'SIGKILL') }, KILL_GRACE_MS)
    }
    const timeout = setTimeout(() => stop('Speech process timed out'), options.timeout)
    const abort = () => stop('Speech process cancelled')
    const output = (chunk: Buffer, stdout: boolean) => {
      bytes += chunk.length
      if (bytes > options.maxBuffer) { stop('Speech process output exceeded the limit'); return }
      if (stdout) chunks.push(chunk)
    }
    child.stdout?.on('data', (chunk: Buffer) => output(chunk, true))
    child.stderr?.on('data', (chunk: Buffer) => output(chunk, false))
    child.once('error', () => stop('Speech process failed'))
    child.once('close', code => {
      clearTimeout(timeout)
      if (escalation) clearTimeout(escalation)
      if (failure && child.pid) dependencies.stop(child.pid, 'SIGKILL')
      options.signal.removeEventListener('abort', abort)
      if (failure || code !== 0) reject(failure ?? new Error('Speech process failed'))
      else resolve({ stdout: Buffer.concat(chunks).toString('utf8') })
    })
    options.signal.addEventListener('abort', abort, { once: true })
    if (options.signal.aborted) abort()
  })
}
