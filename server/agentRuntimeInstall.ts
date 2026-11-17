import { execHostFile } from './platform/process.ts'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIMES, executableCandidates, findExecutable, runtimeInstallationCommand, type AgentRuntime } from './agentRuntimes.ts'

const run = execHostFile
const installing = new Set<string>()
const installations = new Map<string, NonNullable<RuntimeStatus['installation']>>()
let statusVersion = 0
let pendingStatus: { key: string; work: Promise<Map<string, boolean>> } | undefined

export type RuntimeStatus = {
  id: string
  label: string
  surface: 'acp' | 'terminal'
  installed: boolean
  installing: boolean
  installable: boolean
  uninstallable: boolean
  logoutable: boolean
  installation?: { state: 'running' | 'succeeded' | 'failed'; output: string }
}

function executableExists(command: string): boolean {
  if (!command) return false
  if (!path.isAbsolute(command)) return findExecutable(command) !== null
  try {
    fs.accessSync(command, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function runtimeStatuses(): RuntimeStatus[] {
  return Object.values(RUNTIMES).map(runtime => runtimeStatus(runtime, executableExists(runtimeInstallationCommand(runtime.id))))
}

function runtimeStatus(runtime: AgentRuntime, installed: boolean): RuntimeStatus {
  return {
    id: runtime.id,
    label: runtime.label,
    surface: runtime.surface,
    // 설정 화면에서 바꾼 실행 파일 기준으로 판정한다 — 저장한 경로가 실제로 있는지가 "설치됨"이다
    installed,
    installing: installing.has(runtime.id),
    installation: installations.get(runtime.id),
    installable: runtime.install !== undefined,
    uninstallable: runtime.uninstall !== undefined,
    logoutable: runtime.logout !== undefined,
  }
}

/** Keep slow PATH mounts off the HTTP event loop and share simultaneous presence checks. */
export async function runtimeStatusesAsync(): Promise<RuntimeStatus[]> {
  const runtimes = Object.values(RUNTIMES)
  const commands = runtimes.map(runtime => [runtime.id, runtimeInstallationCommand(runtime.id)] as const)
  const key = JSON.stringify([statusVersion, commands, process.env.PATH, process.env.Path, process.env.PATHEXT])
  if (pendingStatus?.key !== key) {
    const checks = new Map<string, Promise<boolean>>()
    const exists = (command: string): Promise<boolean> => {
      let check = checks.get(command)
      if (!check) {
        check = (async () => {
          if (!command) return false
          for (const candidate of executableCandidates(command)) {
            try { await fs.promises.access(candidate, fs.constants.X_OK); return true } catch { /* next candidate */ }
          }
          return false
        })()
        checks.set(command, check)
      }
      return check
    }
    const work = Promise.all(commands.map(async ([id, command]) => [id, await exists(command)] as const)).then(rows => new Map(rows))
    pendingStatus = { key, work }
  }
  const pending = pendingStatus
  try {
    const installed = await pending.work
    return runtimes.map(runtime => runtimeStatus(runtime, installed.get(runtime.id) ?? false))
  } finally { if (pendingStatus === pending) pendingStatus = undefined }
}

export class RuntimeInstallError extends Error {}

/** 등록표의 고정 명령만 실행한다. runtime id 외의 인자는 HTTP에서 받지 않는다. */
export async function installRuntime(id: string): Promise<{ status: RuntimeStatus; output: string }> {
  const runtime = RUNTIMES[id]
  if (!runtime) throw new RuntimeInstallError('알 수 없는 에이전트 런타임입니다')
  const before = runtimeStatuses().find((item) => item.id === id)!
  if (before.installed) return { status: before, output: '이미 설치되어 있습니다.' }
  if (!runtime.install) throw new RuntimeInstallError('자동 설치를 지원하지 않는 런타임입니다')
  if (installing.has(id)) throw new RuntimeInstallError('이 런타임을 설치하고 있습니다')

  installing.add(id)
  statusVersion++
  const installation: NonNullable<RuntimeStatus['installation']> = { state: 'running', output: '' }
  installations.set(id, installation)
  try {
    const spec = runtime.install()
    const result = await run(spec.cmd, spec.args, {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, ...spec.env },
      timeout: 10 * 60_000,
      maxBuffer: 2 * 1024 * 1024,
      onOutput: (text) => { installation.output = (installation.output + text).slice(-12_000) },
    })
    const status = runtimeStatuses().find((item) => item.id === id)!
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-12_000)
    if (!status.installed) throw new RuntimeInstallError(output || '설치는 끝났지만 실행 파일을 찾지 못했습니다')
    installation.state = 'succeeded'
    return { status: { ...status, installing: false }, output }
  } catch (err) {
    installation.state = 'failed'
    if (err instanceof RuntimeInstallError) {
      installation.output = (installation.output + '\n' + err.message).slice(-12_000)
      throw err
    }
    const detail = err as Error & { stdout?: string; stderr?: string }
    const output = `${detail.stdout ?? ''}\n${detail.stderr ?? ''}`.trim().slice(-12_000)
    installation.output = (installation.output || output || detail.message).slice(-12_000)
    throw new RuntimeInstallError(output || detail.message)
  } finally {
    installing.delete(id)
    statusVersion++
  }
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
