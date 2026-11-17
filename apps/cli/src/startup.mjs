import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync as requireRead } from 'node:fs'
import { serviceArguments } from './daemon.mjs'
import { wslStartupDefinition, runWslStartupCommands } from './wsl.mjs'

export async function runStartupCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', windowsHide: true, signal: AbortSignal.timeout(30_000), ...options })
    let stderr = '', stdout = ''
    child.stdout?.on('data', value => { stdout += value.toString() })
    child.stderr?.on('data', value => { stderr += value.toString() })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve({ code, stdout, stderr }) : reject(new Error(`Mew startup registration failed (${signal || code}): ${stderr.trim()}`)))
  })
}

function packageManifest(name, from) {
  let directory = path.dirname(createRequire(path.join(from, 'package.json')).resolve(name))
  for (;;) {
    const manifest = path.join(directory, 'package.json')
    try { if (JSON.parse(requireRead(manifest)).name === name) return manifest } catch { /* Continue to the owning package. */ }
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error(`Could not stage Mew dependency ${name}.`)
    directory = parent
  }
}
async function copyDependency(name, from, destination, ancestry) {
  let manifest
  try { manifest = packageManifest(name, from) } catch (error) {
    const source = JSON.parse(await fs.readFile(path.join(from, 'package.json'), 'utf8'))
    if (source.optionalDependencies?.[name]) return
    throw error
  }
  const source = path.dirname(manifest), real = await fs.realpath(source)
  if (ancestry.has(real)) return
  const target = path.join(destination, 'node_modules', name)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.cp(source, target, { recursive: true, dereference: true, filter: file => !file.slice(source.length + 1).split(path.sep).includes('node_modules') })
  const metadata = JSON.parse(await fs.readFile(manifest, 'utf8'))
  const chain = new Set([...ancestry, real])
  for (const dependency of new Set([...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.optionalDependencies ?? {})])) await copyDependency(dependency, source, target, chain)
}

/** Give OS login services an immutable launcher that survives npx cache removal. */
export async function stagePersistentCli({ packageRoot, version, dataDir, nodePath = process.execPath }) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid Mew launcher version.')
  const base = `${path.resolve(dataDir)}.installation`, directory = path.join(base, 'cli', version)
  const entry = path.join(directory, 'bin', 'mew.mjs')
  try {
    const complete = JSON.parse(await fs.readFile(path.join(directory, '.complete'), 'utf8'))
    if (complete.version === version && Array.isArray(complete.files) && complete.files.length) {
      for (const [file, size] of complete.files) {
        const relative = path.normalize(file)
        if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) throw new Error('Invalid staged launcher metadata.')
        if ((await fs.stat(path.join(directory, relative))).size !== size) throw new Error('A staged launcher file is incomplete.')
      }
      return { directory, entry, nodePath }
    }
  } catch { /* An incomplete stage is rebuilt without touching account data. */ }
  await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 })
  const temporary = `${directory}.prepare-${randomUUID()}`
  await fs.mkdir(temporary, { mode: 0o700 })
  try {
    for (const folder of ['bin', 'src', 'windows-assets']) {
      try { await fs.cp(path.join(packageRoot, folder), path.join(temporary, folder), { recursive: true, dereference: true }) }
      catch (error) { if (folder !== 'windows-assets' || error.code !== 'ENOENT') throw error }
    }
    const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'))
    await fs.copyFile(path.join(packageRoot, 'package.json'), path.join(temporary, 'package.json'))
    for (const dependency of new Set([...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.optionalDependencies ?? {})])) await copyDependency(dependency, packageRoot, temporary, new Set())
    const files = []
    for (const file of await fs.readdir(temporary, { recursive: true })) {
      const item = await fs.stat(path.join(temporary, file))
      if (item.isFile()) files.push([file, item.size])
    }
    await fs.writeFile(path.join(temporary, '.complete'), JSON.stringify({ version, files }) + '\n', { mode: 0o600 })
    const previous = `${directory}.previous-${randomUUID()}`
    try { await fs.rename(directory, previous) } catch (error) { if (error.code !== 'ENOENT') throw error }
    try { await fs.rename(temporary, directory) } catch (error) {
      try { await fs.rename(previous, directory) } catch { /* Keep the old directory for recovery. */ }
      throw error
    }
    await fs.rm(previous, { recursive: true, force: true })
    return { directory, entry, nodePath }
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
}

const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const unitValue = text => `"${String(text).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('\n', '\\n')}"`
const argumentsFor = ({ entry, nodePath, options }) => [nodePath, entry, ...serviceArguments(options)]

export function startupDefinition(config, { platform = process.platform, env = process.env, home = os.homedir(), ...context } = {}) {
  const wsl = wslStartupDefinition(config, { platform, env, ...context })
  if (wsl) return wsl
  const hash = createHash('sha256').update(path.resolve(config.options.dataDir)).digest('hex').slice(0, 12)
  const args = argumentsFor(config)
  if (args.some(value => typeof value !== 'string' || value.includes('\0') || value.includes('\r'))) throw new Error('Invalid Mew startup path.')
  if (platform === 'linux') {
    const name = `mew-${hash}.service`, file = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'systemd', 'user', name)
    const body = `[Unit]\nDescription=Mew workspace\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=${unitValue(config.options.workspace)}\nExecStart=${args.map(unitValue).join(' ')}\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=30\n\n[Install]\nWantedBy=default.target\n`
    return { kind: 'systemd', name, path: file, body, registration: [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', name]]] }
  }
  if (platform === 'darwin') {
    const name = `run.mew.workspace.${hash}`, file = path.join(home, 'Library', 'LaunchAgents', name + '.plist')
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${name}</string><key>ProgramArguments</key><array>${args.map(value => `<string>${xml(value)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(config.options.workspace)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict></dict></plist>\n`
    // launchd reads user LaunchAgents at the next login. Loading it now would race
    // the first-run launcher, so registration deliberately does not bootstrap it.
    return { kind: 'launchd', name, path: file, body, registration: [] }
  }
  throw new Error('Automatic Mew startup is supported by systemd Linux and macOS launchd. Windows uses its managed WSL launcher.')
}

export async function registerAutoStart(config, { run = runStartupCommand, ...environment } = {}) {
  const definition = startupDefinition(config, environment)
  if (definition.kind === 'wsl') { await runWslStartupCommands(definition.registration, run); return { kind: definition.kind, name: definition.name } }
  await fs.mkdir(path.dirname(definition.path), { recursive: true, mode: 0o700 })
  await fs.writeFile(definition.path, definition.body, { mode: 0o600 })
  for (const [command, args] of definition.registration) await run(command, args)
  return { kind: definition.kind, name: definition.name, path: definition.path }
}

export async function unregisterAutoStart(config, { run = runStartupCommand, ...environment } = {}) {
  const definition = startupDefinition(config, environment)
  if (definition.kind === 'wsl') { await runWslStartupCommands(definition.unregistration, run, 'remove'); return { kind: definition.kind, name: definition.name } }
  if (definition.kind === 'systemd') await run('systemctl', ['--user', 'disable', definition.name])
  await fs.rm(definition.path, { force: true })
  if (definition.kind === 'systemd') await run('systemctl', ['--user', 'daemon-reload'])
  return { kind: definition.kind, name: definition.name, path: definition.path }
}
