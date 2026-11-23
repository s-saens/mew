import fs from 'node:fs'
import path from 'node:path'
import { execHostFile as exec } from './platform/process.ts'
import { userProcessCommands } from './platform/identity.ts'
import { terminalBackend } from '../packages/tmux-term/src/server/backends/index.ts'
import { MEW_APP_ROOT, isReleaseDistribution, RELEASE_UPDATE_MESSAGE } from './mewUpdate.ts'
import {
  claudeCliSpec, findExecutable, findRuntimeExecutable, isNpmAgentRuntime, LEGACY_OPENCODE_NPM_PACKAGE,
  NPM_RUNTIME_PACKAGES, npmAgentInstallSpec, resolvedSpec, RUNTIMES, runtimeNpmBin, runtimeNpmPackageRoot,
  runtimeNpmPrefix, type SpawnSpec,
} from './agentRuntimes.ts'
import { ANTIGRAVITY_ACP_VERSION, antigravityCommand } from './antigravityAcp.ts'
import { CURSOR_INSTALL_URL, cursorUpdateSpec } from './cursorCliInstall.ts'
import { runtimeStatusesAsync } from './agentRuntimeInstall.ts'
import { agentProcessRunning, newer, primeReleaseUrl, primeReleaseVersion } from './update-policy.ts'
import type { UpdateItem, UpdateJob, UpdatesStatus } from '../shared/updates.ts'
import { createTmuxManager, type TmuxManager } from '@mew/tmux-term/server'
import { readUpdateQueue, replaceUpdateSession, updateSessionName, updateWorkerCommand, writeUpdateQueue, type StoredUpdateQueue } from './updateSessions.ts'
export { newer } from './update-policy.ts'

export type UpdateCandidate = UpdateItem & { command?: SpawnSpec; lookup?: () => Promise<string> }
let catalog: UpdateCandidate[] = []
let checkedAt = 0
let checking: Promise<UpdatesStatus> | null = null
let checkedDuringUpdate = false
let starting = false
const queueRunning = () => readUpdateQueue()?.job.running ?? false
const updateTmux = createTmuxManager({ cwd: MEW_APP_ROOT })
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
async function output(cmd: string, args: string[]) {
  const result = await exec(cmd, args, { cwd: MEW_APP_ROOT, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
  return result.stdout.trim()
}
async function remoteJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'mew-update-check' } })
  if (!response.ok) throw new Error(`버전 조회 실패 (${response.status})`)
  return response.json()
}
async function npmLatest(name: string): Promise<string> {
  const data = await remoteJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`)
  if (typeof data.version !== 'string') throw new Error('최신 버전을 읽지 못했습니다')
  return data.version
}
async function codexStandaloneLatest(): Promise<string> {
  const versionAt = async (url: string) => {
    const data = await remoteJson(url)
    const version = typeof data.tag_name === 'string' && data.tag_name.match(/^rust-v(\d+\.\d+\.\d+)$/)?.[1]
    if (!version) throw new Error('Codex 최신 안정 버전을 읽지 못했습니다')
    return version
  }
  try { return await versionAt('https://releases.openai.com/codex/channels/latest') }
  catch { return versionAt('https://api.github.com/repos/openai/codex/releases/latest') }
}
async function primeLatest(): Promise<string> {
  if (process.env.PRIME_AGENT_VERSION) return primeReleaseVersion(process.env.PRIME_AGENT_VERSION)
  const installer = await fetch('https://app.primeintellect.ai/prime-agent/install.sh', { signal: AbortSignal.timeout(15_000) })
  if (!installer.ok) throw new Error(`Prime 배포 조회 실패 (${installer.status})`)
  const url = primeReleaseUrl(await installer.text(), process.env.PRIME_AGENT_DOWNLOAD_BASE_URL, process.env.PRIME_AGENT_RELEASE_CHANNEL || 'stable')
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Prime 버전 조회 실패 (${response.status})`)
  return primeReleaseVersion(await response.text())
}

export async function assertAgentIdle(row: Pick<UpdateCandidate, 'category' | 'id' | 'label'>) {
  if (row.category !== 'agent') return
  const runtime = row.id.split(':')[1]
  const spec = runtime === 'prime' ? { cmd: process.env.MEW_PRIME_AGENT_EXECUTABLE || 'prime-agent' } : resolvedSpec(runtime)
  const cli = runtime === 'claude' ? claudeCliSpec([]).cmd : runtime === 'codex' ? RUNTIMES.codex.logout!().cmd : null
  const commands = [spec?.cmd, cli].filter((cmd): cmd is string => !!cmd && cmd !== process.execPath)
  for (const command of [...commands]) {
    const executable = findRuntimeExecutable(runtime, command) ?? command
    commands.push(executable)
    try { commands.push(fs.realpathSync(executable)) } catch { /* Keep the executable path. */ }
  }
  // Inspect all processes owned by the server user, including detached hosts and terminal CLIs.
  const processes = await userProcessCommands()
  if (agentProcessRunning(processes, runtime, commands)) throw new Error(`${row.label} 실행 중입니다. 에이전트를 종료한 뒤 업데이트해 주세요`)
}

function item(id: string, label: string, category: UpdateItem['category'], current: string | null): UpdateCandidate {
  return { id, label, category, current, latest: null, available: false, canUpdate: false, error: null }
}
const npmAgents: Record<string, string[]> = {
  ...Object.fromEntries(Object.entries(NPM_RUNTIME_PACKAGES).map(([id, pkg]) => [id, [pkg]])),
  opencode: [NPM_RUNTIME_PACKAGES.opencode, LEGACY_OPENCODE_NPM_PACKAGE],
  claude: ['@anthropic-ai/claude-code'],
}

function inDirectory(directory: string, file: string): boolean {
  const relative = path.relative(directory, file)
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isPackageExecutable(root: string, pkg: string, executable: string): boolean {
  try {
    return inDirectory(fs.realpathSync(path.join(root, pkg)), fs.realpathSync(executable))
  } catch { return false }
}

function isCodexStandaloneExecutable(executable: string): boolean {
  try {
    const real = fs.realpathSync(executable)
    if (real === executable || !/^codex(?:\.exe)?$/.test(path.basename(real))) return false
    const binaryDir = path.dirname(real)
    const releaseDir = path.basename(binaryDir) === 'bin' ? path.dirname(binaryDir) : binaryDir
    const releases = path.dirname(releaseDir)
    const standalone = path.dirname(releases)
    if (path.basename(releases) !== 'releases' || path.basename(standalone) !== 'standalone' ||
        path.basename(path.dirname(standalone)) !== 'packages') return false
    const relativeBinary = path.relative(releaseDir, real)
    return fs.realpathSync(path.join(standalone, 'current', relativeBinary)) === real
  } catch { return false }
}

function managedNpmPackage(id: string, executable: string): { pkg: string; version: string; prefix: string } | undefined {
  if (!isNpmAgentRuntime(id) || !inDirectory(runtimeNpmBin(id), executable)) return
  const prefix = runtimeNpmPrefix(id)
  const root = runtimeNpmPackageRoot(prefix)
  for (const pkg of npmAgents[id] ?? []) {
    if (process.platform !== 'win32' && !isPackageExecutable(root, pkg, executable)) continue
    try {
      const { version } = JSON.parse(fs.readFileSync(path.join(root, pkg, 'package.json'), 'utf8'))
      if (typeof version === 'string') return { pkg, version, prefix }
    } catch { /* Missing package metadata. */ }
  }
}

function npmAgentUpdateSpec(id: string, pkg: string, prefix: string): SpawnSpec {
  if (isNpmAgentRuntime(id)) return npmAgentInstallSpec(id, prefix, pkg)
  return { cmd: 'npm', args: ['install', '-g', '--prefix', prefix, `${pkg}@latest`, '--no-audit', '--no-fund'] }
}

async function agents(): Promise<UpdateCandidate[]> {
  let globals: Record<string, { version?: string }> = {}
  try { globals = JSON.parse(await output('npm', ['ls', '-g', '--depth=0', '--json'])).dependencies ?? {} } catch { /* Non-npm installations remain visible. */ }
  let globalRoot: string | null = null
  try { globalRoot = await output('npm', ['root', '-g']) } catch { /* Unmanaged installations are not rewritten. */ }
  const globalPrefix = globalRoot && path.isAbsolute(globalRoot)
    ? path.resolve(globalRoot, process.platform === 'win32' ? '..' : '../..') : null
  const npmInstallation = (id: string, executable: string) => {
    const managed = managedNpmPackage(id, executable)
    if (managed) return managed
    if (!globalRoot || !globalPrefix) return
    for (const pkg of npmAgents[id] ?? []) {
      const version = globals[pkg]?.version
      if (version && isPackageExecutable(globalRoot, pkg, executable)) return { pkg, version, prefix: globalPrefix }
    }
  }
  const rows: UpdateCandidate[] = []
  for (const status of (await runtimeStatusesAsync()).filter(row => row.installed && row.id !== 'tmux')) {
    if (status.id === 'claude' || status.id === 'codex') continue // Bundled ACP adapters are updated with Mew, not independently.
    if (status.id === 'antigravity') {
      const row = item('agent:antigravity', status.label, 'agent', resolvedSpec('antigravity')?.cmd === antigravityCommand() ? ANTIGRAVITY_ACP_VERSION : null)
      row.lookup = async () => (await remoteJson('https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json')).version
      row.error = isReleaseDistribution() ? RELEASE_UPDATE_MESSAGE : '버전 고정 ACP 배포본은 Mew 업데이트로 적용합니다'
      rows.push(row)
      continue
    }
    const spec = status.id === 'prime' ? { cmd: process.env.MEW_PRIME_AGENT_EXECUTABLE || 'prime-agent', args: [] } : resolvedSpec(status.id)
    if (!spec) continue
    const executable = findRuntimeExecutable(status.id, spec.cmd)
    if (!executable) continue
    let current: string | null = null
    const npm = npmAgents[status.id] && npmInstallation(status.id, executable)
    try { current = npm?.version ?? (await output(executable, ['--version'])).match(/\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?/)?.[0] ?? null } catch { /* Show unknown instead of guessing. */ }
    const row = item(`agent:${status.id}`, status.label, 'agent', current)
    if (status.id === 'prime') {
      row.lookup = primeLatest
      row.command = { cmd: executable, args: ['update'] }
    } else if (npmAgents[status.id]) {
      const pkg = npm?.pkg ?? npmAgents[status.id][0]
      row.lookup = () => npmLatest(pkg)
      if (npm) row.command = npmAgentUpdateSpec(status.id, pkg, npm.prefix)
      else row.error = '설치 경로를 자동으로 업데이트할 수 없습니다'
    } else if (status.id === 'hermes') {
      row.lookup = async () => (await remoteJson('https://pypi.org/pypi/hermes-agent/json')).info.version
      const uv = findRuntimeExecutable('hermes', 'uv')
      if (uv) {
        try {
          const tools = await output(uv, ['tool', 'dir'])
          if (isPackageExecutable(tools, 'hermes-agent', executable)) row.command = { cmd: uv, args: ['tool', 'upgrade', 'hermes-agent'] }
        } catch { /* uv does not own this installation. */ }
      }
      if (!row.command) row.error = '현재 Hermes 설치에 사용한 도구에서 업데이트해 주세요'
    } else if (status.id === 'cursor') {
      row.lookup = async () => {
        const response = await fetch(CURSOR_INSTALL_URL, { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error('Cursor 버전 조회 실패')
        const version = (await response.text()).match(/downloads\.cursor\.com\/[^/]+\/([^/]+)\//)?.[1]
        if (!version) throw new Error('Cursor 최신 버전을 읽지 못했습니다')
        return version
      }
      try { row.command = cursorUpdateSpec(executable) }
      catch (error) { row.error = message(error) }
    } else row.error = '공식 최신 버전 조회를 지원하지 않습니다'
    rows.push(row)
  }
  for (const id of ['claude', 'codex']) {
    const [pkg] = npmAgents[id]
    const cli = id === 'codex' ? { cmd: RUNTIMES.codex.logout!().cmd, args: [] } : claudeCliSpec([])
    const command = cli.cmd
    const executable = findExecutable(command)
    if (!executable) continue
    const npm = npmInstallation(id, executable)
    let current: string | null = npm?.version ?? null
    try { current ??= (await output(executable, [...cli.args, '--version'])).match(/\d+\.\d+\.\d+(?:-[\w.-]+)?/)?.[0] ?? null } catch { /* Unknown */ }
    const row = item(`cli:${id}`, id === 'claude' ? 'Claude Code CLI' : 'Codex CLI', 'agent', current)
    row.lookup = () => npmLatest(pkg)
    if (npm) row.command = npmAgentUpdateSpec(id, pkg, npm.prefix)
    else if (id === 'claude' && cli.args.length === 0) row.command = { cmd: command, args: ['update'] }
    else if (id === 'codex' && isCodexStandaloneExecutable(executable)) {
      row.lookup = codexStandaloneLatest
      try {
        await output(executable, ['update', '--help'])
        row.command = { cmd: executable, args: ['update'] }
      } catch { row.error = '현재 Codex CLI에서 자동 업데이트를 지원하지 않습니다' }
    } else row.error = '설치 경로를 자동으로 업데이트할 수 없습니다'
    rows.push(row)
  }
  for (const [id, packages] of Object.entries(npmAgents)) {
    const pkg = packages.find(pkg => globals[pkg]?.version)
    if (!pkg || !globalPrefix || id === 'claude' || id === 'codex' || rows.some(row => row.id === `agent:${id}`)) continue
    const row = item(`agent:${id}`, RUNTIMES[id]?.label ?? pkg, 'agent', globals[pkg].version!)
    row.lookup = () => npmLatest(pkg)
    row.command = npmAgentUpdateSpec(id, pkg, globalPrefix)
    rows.push(row)
  }
  return rows
}
async function systems(): Promise<UpdateCandidate[]> {
  const rows: UpdateCandidate[] = []
  const commands: [string, string[]][] = [['node', ['--version']], ['npm', ['--version']], ['git', ['--version']], ['tmux', ['-V']], ['python3', ['--version']], ['uv', ['--version']], ['cargo', ['--version']], ['rustc', ['--version']], ['docker', ['--version']], ['make', ['--version']], ['gcc', ['--version']], ['g++', ['--version']]]
  for (const [cmd, args] of commands) {
    const executable = cmd === 'tmux' ? terminalBackend.binary : cmd
    if (!findExecutable(executable)) continue
    let current: string | null = null
    try { current = (await output(executable, args)).match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null } catch { /* unknown */ }
    const row = item(`system:${cmd}`, cmd === 'node' ? 'Node.js' : cmd, 'system', current)
    if (cmd === 'tmux' && isReleaseDistribution()) {
      row.error = RELEASE_UPDATE_MESSAGE
      rows.push(row)
      continue
    }
    if (cmd === 'npm') { row.lookup = () => npmLatest('npm'); row.command = { cmd: 'npm', args: ['install', '-g', 'npm@latest'] } }
    else if (cmd === 'uv') {
      row.lookup = async () => (await remoteJson('https://api.github.com/repos/astral-sh/uv/releases/latest')).tag_name.replace(/^v/, '')
      row.command = { cmd: 'uv', args: ['self', 'update'] }
    } else if ((cmd === 'rustc' || cmd === 'cargo') && findExecutable('rustup')) {
      row.lookup = async () => {
        const response = await fetch('https://static.rust-lang.org/dist/channel-rust-stable.toml', { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error('Rust 버전 조회 실패')
        const version = (await response.text()).match(/\[pkg\.rust\]\s+version = "([^" ]+)/)?.[1]
        if (!version) throw new Error('Rust 최신 버전을 읽지 못했습니다')
        return version
      }
      row.command = { cmd: 'rustup', args: ['update', 'stable'] }
    } else if (cmd === 'node') {
      row.lookup = async () => { const releases = await remoteJson('https://nodejs.org/dist/index.json'); return releases.find((release: any) => release.lts)?.version.replace(/^v/, '') }
      row.error = 'Node 설치 관리 도구에서 업데이트해 주세요'
    } else if (findExecutable('brew')) {
      const formula = cmd === 'python3' ? 'python' : cmd === 'rustc' || cmd === 'cargo' ? 'rust' : cmd
      row.lookup = async () => { const data = JSON.parse(await output('brew', ['info', '--json=v2', formula])); return data.formulae[0].versions.stable }
      row.command = { cmd: 'brew', args: ['upgrade', formula] }
    } else if (findExecutable('apt-cache')) {
      const pkg = cmd === 'docker' ? 'docker-ce' : cmd
      row.lookup = async () => {
        const policy = await output('apt-cache', ['policy', pkg])
        const installed = policy.match(/Installed:\s+(\S+)/)?.[1]
        const latest = policy.match(/Candidate:\s+(\S+)/)?.[1]
        if (!latest || latest === '(none)' || !installed || installed === '(none)') throw new Error('패키지 관리자가 설치한 도구가 아닙니다')
        row.current = installed
        return latest
      }
      row.error = '배포판 패키지 목록 기준입니다. 시스템 패키지 관리자에서 업데이트해 주세요'
    } else row.error = '설치 관리 도구에서 업데이트해 주세요'
    rows.push(row)
  }
  return rows
}
async function snapshot(): Promise<UpdatesStatus> {
  const queue = readUpdateQueue()
  const sessions = queue ? new Set((await updateTmux.list()).map(row => row.name)) : new Set<string>()
  return {
    items: catalog.map(({ command: _command, lookup: _lookup, ...row }) => ({ ...row, session: queue?.sessions[row.id] && sessions.has(queue.sessions[row.id]) ? queue.sessions[row.id] : null })),
    checkedAt,
    job: queue ? { ...queue.job, items: queue.job.items.map(entry => ({ ...entry, session: entry.session && sessions.has(entry.session) ? entry.session : null })) } : { running: false, items: [] },
  }
}
export async function updatesStatus(refresh = false): Promise<UpdatesStatus> {
  if (checking) return checking
  const running = queueRunning()
  if (checkedDuringUpdate && !running) { checkedAt = 0; checkedDuringUpdate = false }
  if (running && catalog.length || checkedAt && !refresh) return snapshot()
  checking = (async () => {
    const [agentRows, systemRows] = await Promise.all([agents(), systems()])
    const rows = [...agentRows, ...systemRows]
    let next = 0
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < rows.length) {
        const row = rows[next++]
        if (!row.lookup) continue
        try {
          row.latest = await row.lookup()
          row.available = newer(row.current, row.latest)
          if (row.id.startsWith('system:') && row.error?.startsWith('배포판') && row.current && row.latest) {
            try { await exec('dpkg', ['--compare-versions', row.latest, 'gt', row.current], { timeout: 5000 }); row.available = true }
            catch { row.available = false }
          }
          row.canUpdate = row.available && !!row.command
        } catch (error) { row.error = message(error) }
      }
    }))
    catalog = rows
    checkedAt = Date.now()
    checkedDuringUpdate = running || queueRunning()
    return snapshot()
  })().finally(() => { checking = null })
  return checking
}
export function updatesRunning(): boolean { return starting || queueRunning() }
export async function startUpdates(ids: unknown, manager: TmuxManager = updateTmux): Promise<UpdatesStatus> {
  if (updatesRunning()) throw new Error('이미 업데이트 중입니다')
  starting = true
  try {
    if ((await runtimeStatusesAsync()).some(row => row.installing)) throw new Error('에이전트 설치 작업이 끝난 뒤 업데이트해 주세요')
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('업데이트 항목이 필요합니다')
    await updatesStatus(true)
    if (queueRunning()) throw new Error('이미 업데이트 중입니다')
    const selected = selectUpdates(catalog, ids)
    for (const row of selected) await assertAgentIdle(row)
    if (queueRunning()) throw new Error('이미 업데이트 중입니다')
    const session = updateSessionName(selected.map(row => row.id))
    const sessions = { ...readUpdateQueue()?.sessions }
    for (const id of Object.keys(sessions)) if (sessions[id] === session) delete sessions[id]
    for (const row of selected) sessions[row.id] = session
    const queue: StoredUpdateQueue = {
      job: { running: true, items: selected.map(row => ({ id: row.id, state: 'queued' as const, error: null, session })) },
      startedAt: Date.now(), workerPid: null,
      selected: selected.map(row => ({ id: row.id, label: row.label, category: row.category, command: row.command! })),
      sessions,
    }
    writeUpdateQueue(queue)
    try {
      await replaceUpdateSession(manager, session, updateWorkerCommand(path.join(MEW_APP_ROOT, 'server/runUpdates.ts')), MEW_APP_ROOT)
    } catch (error) {
      queue.job.running = false
      queue.job.items = queue.job.items.map(entry => ({ ...entry, state: 'failed', error: message(error) }))
      writeUpdateQueue(queue)
      throw error
    }
    checkedAt = 0
    return snapshot()
  } finally { starting = false }
}
export function selectUpdates(catalog: UpdateCandidate[], ids: unknown): UpdateCandidate[] {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) throw new Error('업데이트 항목이 필요합니다')
  if (isReleaseDistribution() && ids.includes('system:tmux')) throw new Error(RELEASE_UPDATE_MESSAGE)
  const selected = [...new Set(ids as string[])].map(id => catalog.find(row => row.id === id))
  if (selected.some(row => !row?.canUpdate || !row.command || row.id.startsWith('npm:') || row.category === 'dependency')) throw new Error('업데이트할 수 없는 항목입니다. 버전을 다시 확인해 주세요')
  if (selected.some(row => row?.category === 'agent') && selected.length !== 1) throw new Error('에이전트는 개별 업데이트만 가능합니다')
  return selected as UpdateCandidate[]
}
export async function runUpdateQueue(selected: Pick<UpdateCandidate, 'id' | 'command'>[], job: UpdateJob, run: (spec: SpawnSpec) => Promise<void>, changed: () => void = () => {}) {
  try {
    for (const row of selected) {
      const entry = job.items.find(entry => entry.id === row.id)!
      entry.state = 'running'
      changed()
      try { await run(row.command!); entry.state = 'succeeded' }
      catch (error) { entry.state = 'failed'; entry.error = message(error).slice(-2000) }
      changed()
    }
  } finally { job.running = false; changed() }
}
