import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export async function waitForTermuxHttp(baseUrl, pid, timeout = 30_000) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid Mew process ID.')
  const url = new URL('/api/auth/me', baseUrl)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    process.kill(pid, 0)
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))),
      })
      if (response.ok) {
        const status = await response.json()
        if (typeof status.authenticated === 'boolean' && typeof status.setupRequired === 'boolean') {
          process.kill(pid, 0)
          return
        }
      } else {
        await response.body?.cancel()
      }
    } catch {
      // The server can be running before its HTTP listener is ready.
    }
    await delay(200)
  }
  throw new Error('Mew authentication endpoint did not become ready.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await waitForTermuxHttp(process.argv[2], Number(process.argv[3]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
