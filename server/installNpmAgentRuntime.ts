import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CODEX_ACP_PACKAGE, DEFAULT_CODEX_ACP_CMD, LEGACY_OPENCODE_NPM_PACKAGE,
  NPM_RUNTIME_PACKAGES, RUNTIMES, findRuntimeExecutable, isNpmAgentRuntime,
  runtimeInstallationCommand, runtimeNodePath, runtimeNpmPrefix, type NpmAgentRuntime, type SpawnSpec,
} from './agentRuntimes.ts'
import { npmGlobalPackageSpec, openClawInstallSpec, runNpmInstaller } from './installOpenClaw.ts'
import { windowsEnvironment } from './platform/windows/process.ts'

function npmEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env, PATH: runtimeNodePath() }
  return process.platform === 'win32' ? windowsEnvironment(env) : env
}

export function codexInstallSteps(): { connector?: SpawnSpec; host: boolean } {
  const hostCommand = RUNTIMES.codex.requiredCommand!()
  const host = !findRuntimeExecutable('codex', hostCommand)
  if (host && hostCommand !== 'codex') throw new Error('설정된 호스트 Codex CLI를 실행할 수 없습니다. MEW_AGENT_CODEX_CLI_CMD 또는 CODEX_PATH를 확인하세요.')
  const connectorCommand = runtimeInstallationCommand('codex', { useSavedSettings: false })
  if (findRuntimeExecutable('codex', connectorCommand)) return { host }
  if (connectorCommand !== DEFAULT_CODEX_ACP_CMD) throw new Error('설정된 Codex 연결 프로그램을 실행할 수 없습니다. MEW_AGENT_CODEX_CMD를 확인하세요.')
  return {
    connector: { cmd: 'npm', args: ['install', '--no-save', CODEX_ACP_PACKAGE], env: npmEnvironment() },
    host,
  }
}

export async function installNpmAgentRuntime(id: NpmAgentRuntime, suppliedPrefix?: string, suppliedPackage?: string) {
  const prefix = suppliedPrefix ?? runtimeNpmPrefix(id)
  const packageName = suppliedPackage ?? NPM_RUNTIME_PACKAGES[id]
  if (!path.isAbsolute(prefix)) throw new Error('npm 전역 설치 경로를 확인할 수 없습니다.')
  if (packageName !== NPM_RUNTIME_PACKAGES[id] && !(id === 'opencode' && packageName === LEGACY_OPENCODE_NPM_PACKAGE)) {
    throw new Error('등록되지 않은 에이전트 패키지입니다.')
  }
  if (id === 'kimi') {
    const [major, minor] = process.versions.node.split('.').map(Number)
    if (major < 22 || (major === 22 && minor < 19)) {
      throw new Error('Kimi Code 설치에는 Node.js 22.19.0 이상이 필요합니다. Mew가 사용하는 Node 버전을 확인하세요.')
    }
  }

  const label = RUNTIMES[id].label
  if (id === 'codex' && suppliedPrefix === undefined) {
    const steps = codexInstallSteps()
    if (steps.connector) await runNpmInstaller(steps.connector, 'Codex 연결 프로그램')
    if (!steps.host) return
  }

  if (suppliedPrefix === undefined) await fs.mkdir(prefix, { recursive: true, mode: 0o700 })
  const env = npmEnvironment()
  const spec = id === 'openclaw'
    ? await openClawInstallSpec({ prefix, env })
    : await npmGlobalPackageSpec(packageName, prefix, env)
  console.log(`${label} 설치 중…`)
  await runNpmInstaller(spec, label)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , id, prefix, packageName] = process.argv
  if (!id || !isNpmAgentRuntime(id)) {
    console.error('알 수 없는 npm 에이전트 런타임입니다')
    process.exitCode = 1
  } else {
    installNpmAgentRuntime(id, prefix, packageName).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
  }
}
