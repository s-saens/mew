import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executableCandidates, type SpawnSpec } from './agentRuntimes.ts'
import { execHostFile, spawnHostProcess } from './platform/process.ts'

const PROBE_TIMEOUT = 5_000
const NODE_SEARCH_TIMEOUT = 15_000

function supportedNode(version: string): boolean {
  const match = version.match(/^v?(\d+)\.(\d+)\.\d+(-[\w.-]+)?(?:\+[\w.-]+)?$/)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  // Match the official package engine and its release checks for Node 24 and 26.
  return major > 26 || (!match[3] && ((major === 24 && minor >= 16) || (major === 26 && minor >= 1)))
}

async function compatibleNode(env: NodeJS.ProcessEnv, searchPath: string, run: typeof execHostFile): Promise<string | undefined> {
  const candidates = executableCandidates('node', { ...env, PATH: searchPath })
  if (path.basename(process.execPath) === (process.platform === 'win32' ? 'node.exe' : 'node')) {
    candidates.push(process.execPath)
  }
  const deadline = Date.now() + NODE_SEARCH_TIMEOUT
  for (const candidate of new Set(candidates.filter(item => path.isAbsolute(item)))) {
    const timeout = Math.min(deadline - Date.now(), PROBE_TIMEOUT)
    if (timeout <= 0) break
    try {
      const { stdout } = await run(candidate, ['--version'], { env, timeout, maxBuffer: 4096 })
      if (supportedNode(stdout.trim())) return candidate
    } catch { /* Try the next Node already installed on the host. */ }
  }
  return undefined
}

export async function openClawInstallSpec({
  env = process.env,
  prefix,
  run = execHostFile,
}: {
  env?: NodeJS.ProcessEnv
  prefix?: string
  run?: typeof execHostFile
} = {}): Promise<SpawnSpec> {
  const pathKey = process.platform === 'win32'
    ? Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH'
    : 'PATH'
  const searchPath = env[pathKey] ?? ''
  const node = await compatibleNode(env, searchPath, run)
  if (!node) throw new Error('OpenClaw 설치에는 Node.js 24.16.0 이상(24.x) 또는 26.1.0 이상이 필요합니다. 호환 버전을 Mew 서버의 PATH에 추가하고 다시 시도하세요.')

  const probe = async (args: string[], childEnv: NodeJS.ProcessEnv) => {
    const { stdout } = await run('npm', args, { env: childEnv, timeout: PROBE_TIMEOUT, maxBuffer: 4096 })
    return stdout.trim()
  }
  const npmPrefix = prefix ?? await probe(['prefix', '-g'], env)
  if (!path.isAbsolute(npmPrefix)) throw new Error('npm 전역 설치 경로를 확인할 수 없습니다.')

  // Keep npm's original global destination even when using another installed Node.
  const npmEnv = { ...env, [pathKey]: [path.dirname(node), searchPath].filter(Boolean).join(path.delimiter) }
  return npmGlobalPackageSpec('openclaw', npmPrefix, npmEnv, run)
}

export async function npmGlobalPackageSpec(packageName: string, prefix: string, env: NodeJS.ProcessEnv, run = execHostFile): Promise<SpawnSpec> {
  const probe = async (args: string[]) => {
    const { stdout } = await run('npm', args, { env, timeout: PROBE_TIMEOUT, maxBuffer: 4096 })
    return stdout.trim()
  }
  const version = (await probe(['--version'])).match(/^(\d+)\.(\d+)\.\d+(?:[-+][\w.-]+)?$/)
  if (!version) throw new Error('npm 버전을 확인할 수 없습니다.')

  const args = ['install', '-g', '--prefix', prefix, `${packageName}@latest`, '--no-audit', '--no-fund']
  if (await probe(['config', 'get', 'ignore-scripts', '-g', '--prefix', prefix]) === 'true') {
    throw new Error('런타임 설치에는 npm 설치 스크립트가 필요합니다. npm의 ignore-scripts 설정을 확인하세요.')
  }
  const npmMajor = Number(version[1])
  const npmMinor = Number(version[2])
  if (npmMajor >= 12 || (npmMajor === 11 && npmMinor >= 16)) args.push(`--allow-scripts=${packageName}`)
  return { cmd: 'npm', args, env }
}

export async function runNpmInstaller(spec: SpawnSpec, label: string) {
  const child = spawnHostProcess(spec.cmd, spec.args, { env: spec.env, stdio: ['ignore', 'inherit', 'inherit'] })
  const [code, signal] = await once(child, 'close')
  if (code !== 0) throw new Error(`${label} 설치가 실패했습니다 (${signal ?? code}).`)
}

async function installOpenClaw(prefix?: string) {
  const spec = await openClawInstallSpec({ prefix })
  await runNpmInstaller(spec, 'OpenClaw')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installOpenClaw(process.argv[2]).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
