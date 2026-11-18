import { execHostFile, spawnHostProcess, stopProcessGroup } from './platform/process.ts'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIMES, findRuntimeExecutable, isBundledAgentExecutable, runtimeExecutableCandidates, runtimeInstallationCommand, type AgentRuntime, type SpawnSpec } from './agentRuntimes.ts'

const run = execHostFile
const installing = new Set<string>()
const installations = new Map<string, RuntimeInstallation>()
let statusVersion = 0
type RuntimePresence = { installed: boolean; defaultInstalled: boolean; connectorInstalled?: boolean }
let pendingStatus: { key: string; work: Promise<RuntimePresence[]> } | undefined

export type RuntimeStatus = {
  id: string
  label: string
  surface: 'acp' | 'terminal'
  installed: boolean
  connectorInstalled?: boolean
  installing: boolean
  installable: boolean
  uninstallable: boolean
  logoutable: boolean
  installBlocker?: 'configured-command'
  installation?: { state: 'running' | 'succeeded' | 'failed'; output: string }
}

type RuntimeInstallResult = { status: RuntimeStatus; output: string }
type RuntimeInstallation = {
  attempt: string
  progress: NonNullable<RuntimeStatus['installation']>
  result?: RuntimeInstallResult
  error?: RuntimeInstallError
}

function executableExists(runtimeId: string, command: string): boolean {
  return !!findRuntimeExecutable(runtimeId, command)
}

export function runtimeStatuses(): RuntimeStatus[] {
  return Object.values(RUNTIMES).map(readRuntimeStatus)
}

function readRuntimeStatus(runtime: AgentRuntime): RuntimeStatus {
  const command = runtimeInstallationCommand(runtime.id)
  const installed = executableExists(runtime.id, command)
  const standard = runtimeInstallationCommand(runtime.id, { useSavedSettings: false })
  const required = runtime.requiredCommand?.()
  return runtimeStatus(runtime, {
    installed: installed && (!required || executableExists(runtime.id, required)),
    defaultInstalled: !installed && command !== standard && executableExists(runtime.id, standard),
    connectorInstalled: required ? installed : undefined,
  })
}

function runtimeStatus(runtime: AgentRuntime, { installed, defaultInstalled, connectorInstalled }: RuntimePresence): RuntimeStatus {
  const installBlocker = defaultInstalled && runtime.install ? 'configured-command' : undefined
  return {
    id: runtime.id,
    label: runtime.label,
    surface: runtime.surface,
    // 설정 화면에서 바꾼 실행 파일 기준으로 판정한다 — 저장한 경로가 실제로 있는지가 "설치됨"이다
    installed,
    connectorInstalled,
    installing: installing.has(runtime.id),
    installation: installations.get(runtime.id)?.progress,
    installable: runtime.install !== undefined && !installBlocker,
    installBlocker,
    uninstallable: runtime.uninstall !== undefined,
    logoutable: runtime.logout !== undefined,
  }
}

/** Keep slow PATH mounts off the HTTP event loop and share simultaneous presence checks. */
export async function runtimeStatusesAsync(): Promise<RuntimeStatus[]> {
  const runtimes = Object.values(RUNTIMES)
  const commands = runtimes.map(runtime => {
    const candidates = (command: string) => runtimeExecutableCandidates(runtime.id, command)
    const required = runtime.requiredCommand?.()
    return {
      primary: candidates(runtimeInstallationCommand(runtime.id)),
      standard: candidates(runtimeInstallationCommand(runtime.id, { useSavedSettings: false })),
      required: required ? candidates(required) : undefined,
      excludeBundled: runtime.id === 'codex' && required === 'codex',
    }
  })
  const key = JSON.stringify([statusVersion, runtimes.map(runtime => runtime.id), commands])
  if (pendingStatus?.key !== key) {
    const checks = new Map<string, Promise<boolean>>()
    const exists = (candidates: string[], excludeBundled = false): Promise<boolean> => {
      const key = JSON.stringify([candidates, excludeBundled])
      let check = checks.get(key)
      if (!check) {
        check = (async () => {
          for (const candidate of candidates) {
            try {
              await fs.promises.access(candidate, fs.constants.X_OK)
              if (excludeBundled && isBundledAgentExecutable(await fs.promises.realpath(candidate))) continue
              if ((await fs.promises.stat(candidate)).isFile()) return true
            } catch { /* next candidate */ }
          }
          return false
        })()
        checks.set(key, check)
      }
      return check
    }
    const work = Promise.all(commands.map(async ({ primary, standard, required, excludeBundled }) => {
      const primaryInstalled = await exists(primary)
      return {
        installed: primaryInstalled && (!required || await exists(required, excludeBundled)),
        defaultInstalled: !primaryInstalled && JSON.stringify(primary) !== JSON.stringify(standard) && await exists(standard),
        connectorInstalled: required ? primaryInstalled : undefined,
      }
    }))
    pendingStatus = { key, work }
  }
  const pending = pendingStatus
  try {
    return (await pending.work).map((presence, index) => runtimeStatus(runtimes[index], presence))
  } finally { if (pendingStatus === pending) pendingStatus = undefined }
}

export class RuntimeInstallError extends Error {}

/** 등록표의 고정 명령만 실행한다. runtime id 외의 인자는 HTTP에서 받지 않는다. */
export async function installRuntime(id: string, background = false): Promise<RuntimeInstallResult & { attempt?: string }> {
  const runtime = Object.hasOwn(RUNTIMES, id) ? RUNTIMES[id] : undefined
  if (!runtime) throw new RuntimeInstallError('알 수 없는 에이전트 런타임입니다')
  if (installing.has(id)) throw new RuntimeInstallError('이 런타임을 설치하고 있습니다')
  const before = readRuntimeStatus(runtime)
  if (before.installed) return { status: before, output: '이미 설치되어 있습니다.' }
  if (before.installBlocker) throw new RuntimeInstallError('기본 실행 파일이 설치되어 있습니다. 런타임 설정의 실행 파일 경로를 수정하거나 비워 주세요.')
  if (!runtime.install) throw new RuntimeInstallError('자동 설치를 지원하지 않는 런타임입니다')

  installing.add(id)
  statusVersion++
  const installation: RuntimeInstallation = { attempt: randomUUID(), progress: { state: 'running', output: '' } }
  installations.set(id, installation)
  const status = { ...before, installing: true, installation: { ...installation.progress } }
  const completion = runInstallation(runtime, runtime.install, installation)
  if (!background) return completion
  void completion.catch(() => { /* The attempt retains the failure for polling. */ })
  return { status, output: '', attempt: installation.attempt }
}

export function runtimeInstallResult(id: string, attempt: string): RuntimeInstallResult | null {
  const installation = installations.get(id)
  if (!installation || installation.attempt !== attempt) return null
  if (installation.error) throw installation.error
  return installation.result ?? { status: runtimeStatus(RUNTIMES[id], { installed: false, defaultInstalled: false }), output: '' }
}

async function runInstallation(runtime: AgentRuntime, installer: () => SpawnSpec, installation: RuntimeInstallation): Promise<RuntimeInstallResult> {
  const progress = installation.progress
  try {
    await streamInstaller(installer(), text => { progress.output = (progress.output + text).slice(-12_000) })
    const status = readRuntimeStatus(runtime)
    if (!status.installed) throw new Error('설치는 끝났지만 실행 파일을 찾지 못했습니다. 런타임 설정의 경로와 Mew 서버의 PATH를 확인하세요.')
    progress.state = 'succeeded'
    installation.result = { status: { ...status, installing: false }, output: progress.output.trim() }
    return installation.result
  } catch (err) {
    progress.state = 'failed'
    const detail = err instanceof Error ? err.message : String(err)
    progress.output = [progress.output.trimEnd(), detail].filter(Boolean).join('\n').slice(-12_000)
    installation.error = new RuntimeInstallError(progress.output)
    throw installation.error
  } finally {
    installing.delete(runtime.id)
    statusVersion++
  }
}

async function streamInstaller(spec: SpawnSpec, onOutput: (text: string) => void): Promise<void> {
  const child = spawnHostProcess(spec.cmd, spec.args, {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, ...spec.env },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.setEncoding('utf8').on('data', onOutput)
  child.stderr?.setEncoding('utf8').on('data', onOutput)
  await new Promise<void>((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid) stopProcessGroup(child.pid, 'SIGKILL')
    }, 10 * 60_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('런타임 설치 시간이 초과되었습니다.'))
      else if (code === 0) resolve()
      else reject(new Error(`런타임 설치 명령 실패 (${signal ?? code})`))
    })
  })
}

/** 등록표의 역설치 명령만 실행한다. 설치 방법이 불명확한 런타임의 파일을 추측해 지우지 않는다. */
export async function uninstallRuntime(id: string): Promise<{ status: RuntimeStatus; output: string }> {
  const runtime = RUNTIMES[id]
  if (!runtime) throw new RuntimeInstallError('알 수 없는 에이전트 런타임입니다')
  if (!runtime.uninstall) throw new RuntimeInstallError('이 런타임은 안전한 자동 제거를 지원하지 않습니다')
  if (installing.has(id)) throw new RuntimeInstallError('이 런타임을 설치 또는 제거하고 있습니다')
  installing.add(id)
  statusVersion++
  installations.delete(id)
  try {
    const spec = runtime.uninstall()
    const result = await run(spec.cmd, spec.args, { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, ...spec.env }, timeout: 10 * 60_000, maxBuffer: 2 * 1024 * 1024 })
    return { status: { ...runtimeStatuses().find((item) => item.id === id)!, installing: false }, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-12_000) }
  } catch (err) {
    const detail = err as Error & { stdout?: string; stderr?: string }
    throw new RuntimeInstallError(`${detail.stdout ?? ''}\n${detail.stderr ?? ''}`.trim().slice(-12_000) || detail.message)
  } finally { installing.delete(id); statusVersion++ }
}

/** API 키·토큰은 다루지 않고, 공급자 CLI가 선언한 로그아웃 명령만 실행한다. */
export async function logoutRuntime(id: string): Promise<{ output: string }> {
  const runtime = RUNTIMES[id]
  if (!runtime?.logout) throw new RuntimeInstallError('이 런타임은 자동 로그아웃을 지원하지 않습니다')
  const spec = runtime.logout()
  try {
    const result = await run(spec.cmd, spec.args, { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, ...spec.env }, timeout: 60_000, maxBuffer: 256 * 1024 })
    return { output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-12_000) }
  } catch (err) {
    const detail = err as Error & { stdout?: string; stderr?: string }
    throw new RuntimeInstallError(`${detail.stdout ?? ''}\n${detail.stderr ?? ''}`.trim().slice(-12_000) || detail.message)
  }
}
