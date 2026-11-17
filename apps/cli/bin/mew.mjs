#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOptions } from '../src/options.mjs'
import { runtimeTarget, prepareRuntime } from '../src/runtime.mjs'
import { launch, runHost, openBrowser, runtimeEnvironment } from '../src/launcher.mjs'
import { prepareBrowserDependencies } from '../src/browser-dependencies.mjs'
import { daemonControl, requestDaemon, startBackground, saveLaunchSettings } from '../src/daemon.mjs'
import { stagePersistentCli, registerAutoStart, unregisterAutoStart } from '../src/startup.mjs'
import { bootstrapWindows } from '../src/windows-bootstrap.mjs'

const { version } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))
const help = `Mew ${version}

Usage: npx mew-ide [start|status|stop|disable-autostart] [options]

  --workspace <path>   Working folder (default: current folder)
  --data-dir <path>    Persistent accounts and conversations
  --cache-dir <path>   Versioned runtime directory
  --port <number>     Local port (default: 5000, 0: available port)
  --foreground        Keep Mew attached to this terminal
  --no-autostart      Do not register login startup
  --no-open           Do not open the browser
  --owner-email <mail> Explicit legacy account automation
  --installer         Private Windows installer transport
  -h, --help          Show help
  -v, --version       Show version

Node.js 24 and npm are required. Mew prepares local Postgres automatically.
Windows CMD/PowerShell prepares a dedicated WSL environment.
Run again to reopen Mew. Use stop to stop it without deleting data.
Existing source data: --data-dir <existing-installation>/.data`

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function execute(options) {
  if (process.platform === 'win32') {
    if (options.action === 'start') runtimeTarget()
    const result = await bootstrapWindows({ version, packageRoot, options })
    return result.exitCode ?? 0
  }
  if (options.action === 'disable-autostart') {
    await unregisterAutoStart({ entry: fileURLToPath(import.meta.url), nodePath: process.execPath, options, version })
    console.log('Mew login startup is disabled. Existing files and running work are preserved.')
    return 0
  }
  if (options.service && await requestDaemon(options, 'status')) return 0
  if (!options.installer && !options.service) {
    const running = await requestDaemon(options, options.action === 'start' ? 'open' : options.action)
    if (running) {
      if (running.url && options.open) openBrowser(running.url)
      console.log(running.url ? `Mew: ${new URL(running.url).origin}` : running.stopping ? 'Mew is stopping.' : running.ready ? 'Mew is running.' : 'Mew is starting.')
      return 0
    }
    if (options.action !== 'start') { console.log('Mew is not running.'); return 0 }
  }
  const target = runtimeTarget()
  if (options.service || options.foreground) {
    const control = options.service ? daemonControl(options) : undefined
    try {
      const code = await launch({ prepare: prepareRuntime, options, version, target, control,
        host: (runtime, settings) => runHost(runtime, settings, { onControl: value => control?.host(value), onReady: url => control?.ready(url) }),
      })
      return options.service && [130,143].includes(code) ? 0 : code
    } catch (error) {
      if (control?.stopRequested) return 0
      throw error
    }
  }
  console.log('Preparing Mew, its database, and login startup…')
  const runtime = await prepareRuntime({ cacheDir: options.cacheDir, version, target, log: console.log })
  await prepareBrowserDependencies(runtime, { env: runtimeEnvironment(runtime, options) })
  const installed = await stagePersistentCli({ packageRoot, version, dataDir: options.dataDir })
  options = await saveLaunchSettings(options)
  if (options.autostart) await registerAutoStart({ entry: installed.entry, nodePath: installed.nodePath, options, version })
  const url = await startBackground(installed.entry, options, { node: installed.nodePath })
  if (options.open) openBrowser(url)
  console.log(`Mew: ${new URL(url).origin}\nRunning in the background. Use npx mew-ide stop to stop it.`)
  return 0
}

try {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) console.log(help)
  else if (options.version) console.log(version)
  else process.exitCode = await execute(options)
} catch (error) {
  console.error(`[mew] ${error.message}`)
  process.exitCode = 1
}
