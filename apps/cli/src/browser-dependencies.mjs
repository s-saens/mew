import { spawn } from 'node:child_process'
import path from 'node:path'

/** Prepare host browsers before the server's startup timer or IPC process starts. */
export async function prepareBrowserDependencies(runtime, { env = process.env, spawnImpl = spawn, installer = false } = {}) {
  const child = spawnImpl(process.execPath, [path.join(runtime, 'server/browser-dependencies.js'), '--install'], {
    cwd: runtime, env, stdio: installer ? ['inherit', process.stderr, process.stderr] : 'inherit', windowsHide: true,
  })
  let interrupted
  const interrupt = signal => {
    interrupted = signal
    child.kill(signal)
  }
  const onInterrupt = () => interrupt('SIGINT')
  const onTerminate = () => interrupt('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0 && !interrupted) resolve()
        else reject(new Error(`Browser dependency preparation failed (${interrupted || signal || code}). Follow the installer output and run Mew again.`))
      })
    })
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}
