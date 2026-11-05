import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { domBrowserExecutable, externalBrowserExecutable } from './browser-dom-executable.ts'
import { loadConfigEnvironment } from './config-environment.ts'

type RunOptions = { env: NodeJS.ProcessEnv; inheritOutput?: boolean }
type RunResult = { code: number; stdout: string; stderr: string }
type Runner = (command: string, args: string[], options: RunOptions) => Promise<RunResult>
type PinnedPaths = { chromium: string; headlessShell: string }
type ResolveOptions = { env: NodeJS.ProcessEnv; platform: NodeJS.Platform; bundledExecutable?: string }

interface BrowserDependencyServices {
  run: Runner
  executable: (file: string) => Promise<boolean>
  libraryBinary: (file: string) => Promise<string | undefined>
  resolveChrome: (options: ResolveOptions) => string | undefined
  resolveChromium: (options: ResolveOptions) => string | undefined
  pinnedPaths: (env: NodeJS.ProcessEnv, run: Runner) => Promise<PinnedPaths>
}

export interface BrowserDependencyOptions {
  install?: boolean
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  arch?: string
  dependencies?: Partial<BrowserDependencyServices>
}

const require = createRequire(import.meta.url)
const playwrightRoot = path.dirname(require.resolve('playwright-core/package.json'))
const playwrightCli = path.join(playwrightRoot, 'cli.js')

export async function runBrowserDependencyCommand(command: string, args: string[], options: RunOptions, spawnImpl: typeof spawn = spawn): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      env: options.env,
      shell: false,
      stdio: options.inheritOutput ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      ...(options.inheritOutput ? {} : { signal: AbortSignal.timeout(30_000) }),
    })
    let stdout = '', stderr = '', interrupted: 'SIGINT' | 'SIGTERM' | undefined, failure: Error | undefined
    const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
      interrupted = signal
      try { child.kill(signal) } catch { /* The child may already have exited. */ }
    }
    const onInterrupt = () => interrupt('SIGINT')
    const onTerminate = () => interrupt('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    child.stdout?.on('data', chunk => { stdout += chunk.toString() })
    child.stderr?.on('data', chunk => { stderr += chunk.toString() })
    child.once('error', error => { failure = error })
    child.once('close', code => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      if (interrupted) {
        const error = Object.assign(new Error(`Browser dependency preparation cancelled (${interrupted}).`), { name: 'AbortError', signal: interrupted })
        reject(error)
      } else if (failure) reject(failure)
      else resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

async function executable(file: string): Promise<boolean> {
  try { await fs.access(file, fs.constants.X_OK); return (await fs.stat(file)).isFile() }
  catch { return false }
}

async function isElf(file: string): Promise<boolean> {
  const handle = await fs.open(file, 'r')
  try {
    const bytes = Buffer.alloc(4)
    await handle.read(bytes, 0, bytes.length, 0)
    return bytes.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  } finally { await handle.close() }
}

async function libraryBinary(file: string): Promise<string | undefined> {
  const real = await fs.realpath(file)
  if (await isElf(real)) return real
  // Ordinary Chrome's launcher is a shell script beside the actual ELF binary.
  const sibling = path.join(path.dirname(real), 'chrome')
  if (await executable(sibling) && await isElf(sibling)) return sibling
}

async function pinnedPaths(env: NodeJS.ProcessEnv, runner: Runner): Promise<PinnedPaths> {
  const script = `const root = process.argv[1]; const {chromium} = require(root); const {registry} = require(root + '/lib/coreBundle.js').registry; process.stdout.write(JSON.stringify({chromium:chromium.executablePath(),headlessShell:registry.findExecutable('chromium-headless-shell').executablePath()}));`
  const result = await runner(process.execPath, ['-e', script, playwrightRoot], { env })
  if (result.code !== 0) throw new Error('Cannot resolve the pinned Playwright browser paths. Reinstall Mew dependencies.')
  const paths: unknown = JSON.parse(result.stdout)
  if (!paths || typeof paths !== 'object' || !('chromium' in paths) || typeof paths.chromium !== 'string' || !paths.chromium || !('headlessShell' in paths) || typeof paths.headlessShell !== 'string' || !paths.headlessShell) {
    throw new Error('The installed Playwright version did not provide Chromium and headless-shell paths.')
  }
  return { chromium: paths.chromium, headlessShell: paths.headlessShell }
}

/** Install missing browser prerequisites, or check them without changing the host. */
export async function ensureBrowserDependencies({
  install = true, env = process.env, platform = process.platform, arch = process.arch, dependencies = {},
}: BrowserDependencyOptions = {}): Promise<{ chrome: string; chromium: string }> {
  if (platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') {
    throw new Error(`Mew browser dependency management does not support ${platform}. Install the browser prerequisites manually on a supported Linux, macOS, or Windows host.`)
  }
  const services: BrowserDependencyServices = { run: runBrowserDependencyCommand, executable, libraryBinary, resolveChrome: externalBrowserExecutable, resolveChromium: domBrowserExecutable, pinnedPaths, ...dependencies }
  const options = { env, platform, bundledExecutable: '' }
  // Validate both role overrides before running any installer.
  let chrome = services.resolveChrome(options)
  const chromiumOverride = env.MEW_CHROMIUM_EXECUTABLE || env.MEW_BROWSER_EXECUTABLE
  let chromium = chromiumOverride ? services.resolveChromium(options) : undefined
  const pinned = chromiumOverride ? undefined : await services.pinnedPaths(env, services.run)
  const chromiumPaths = pinned ? [pinned.chromium, pinned.headlessShell] : chromium ? [chromium] : []
  const missingChromium = !chromiumPaths.length || (await Promise.all(chromiumPaths.map(file => services.executable(file)))).some(found => !found)
  if (!chrome && platform === 'linux' && arch !== 'x64') {
    throw new Error(`Ordinary Google Chrome automatic installation requires Linux x64 (this host is ${arch}). Install a supported Chrome build manually and set MEW_CHROME_EXECUTABLE; Chromium does not replace Chrome for login or external sites.`)
  }
  const installPlaywright = async (...args: string[]) => {
    const result = await services.run(process.execPath, [playwrightCli, ...args], { env, inheritOutput: true })
    if (result.code !== 0) throw new Error(`Browser dependency installation failed (${args.join(' ')}). Check network access and administrator/sudo permissions, then retry npm run browsers:install.`)
  }
  if (!install && (missingChromium || !chrome)) {
    const missing = [missingChromium ? 'pinned Playwright Chromium (including headless shell)' : '', !chrome ? 'ordinary Google Chrome' : ''].filter(Boolean)
    throw new Error(`Missing browser dependencies: ${missing.join(', ')}. Run npm run browsers:install, or set MEW_CHROMIUM_EXECUTABLE and MEW_CHROME_EXECUTABLE to valid browser executables.`)
  }
  if (missingChromium) {
    await installPlaywright('install', 'chromium')
    for (const file of chromiumPaths) {
      if (!await services.executable(file)) throw new Error('Playwright Chromium installation did not produce the required pinned Chromium and headless-shell executables.')
    }
  }
  chromium = chromium ?? pinned?.chromium
  if (!chrome) {
    await installPlaywright('install', 'chrome')
    chrome = services.resolveChrome(options)
    if (!chrome) throw new Error('Google Chrome installation completed without a discoverable executable. Set MEW_CHROME_EXECUTABLE to the installed Chrome executable and retry.')
  }
  if (!chromium) throw new Error('No Chromium executable was resolved. Set MEW_CHROMIUM_EXECUTABLE and retry.')
  if (platform === 'linux') {
    const binaries = new Set<string>()
    for (const file of [chrome, ...chromiumPaths]) {
      const binary = await services.libraryBinary(file)
      if (binary) binaries.add(binary)
    }
    const missingLibraries = async () => {
      const missing = new Set<string>()
      for (const binary of binaries) {
        const result = await services.run('ldd', [binary], { env })
        const libraries = [...(result.stdout + '\n' + result.stderr).matchAll(/^\s*(\S+)\s+=>\s+not found\s*$/gm)].map(match => match[1]!)
        if (result.code !== 0 && !libraries.length) throw new Error('Cannot inspect browser native libraries with ldd. Install libc tools and check the browser executable before retrying.')
        for (const library of libraries) missing.add(library)
      }
      return [...missing]
    }
    let missing = await missingLibraries()
    if (missing.length && install) {
      await installPlaywright('install-deps', 'chromium')
      missing = await missingLibraries()
    }
    if (missing.length) throw new Error(`Missing browser native libraries: ${missing.join(', ')}. Run npm run browsers:install with administrator/sudo access, or install these libraries manually.`)
  }
  return { chrome, chromium }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some(arg => arg !== '--install' && arg !== '--check')) {
    process.stderr.write('Usage: browser-dependencies [--install | --check]\n')
    process.exitCode = 1
  } else {
    try {
      loadConfigEnvironment()
      await ensureBrowserDependencies({ install: !args.includes('--check') })
      process.stdout.write('Browser dependencies ready: Playwright Chromium and Google Chrome.\n')
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : 'Browser dependency check failed.'}\n`)
      process.exitCode = error instanceof Error && 'signal' in error && error.signal === 'SIGINT' ? 130
        : error instanceof Error && 'signal' in error && error.signal === 'SIGTERM' ? 143 : 1
    }
  }
}
