import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { windowsShell } from '../packages/tmux-term/src/server/backends/psmux.ts'
import { findRuntimeExecutable, type SpawnSpec } from './agentRuntimes.ts'
import { DATA_DIR } from './dataDir.ts'
import { runLoggedUpdate } from './updateProcess.ts'

function uvBootstrapSpec(): SpawnSpec {
  const env = { UV_UNMANAGED_INSTALL: path.resolve(DATA_DIR, 'runtimes', 'uv') }
  if (process.platform === 'win32') {
    return {
      cmd: windowsShell(), env,
      args: ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference = 'Stop'; Invoke-RestMethod 'https://astral.sh/uv/install.ps1' | Invoke-Expression"],
    }
  }
  return { cmd: 'bash', args: ['-o', 'pipefail', '-c', 'curl -fsSL https://astral.sh/uv/install.sh | sh'], env }
}

export async function installHermes(
  findUv = () => findRuntimeExecutable('hermes', 'uv'),
  run = (spec: SpawnSpec) => runLoggedUpdate(spec, process.cwd()),
) {
  let uv = findUv()
  if (!uv) {
    console.log('Hermes 설치에 필요한 uv를 준비합니다.')
    await run(uvBootstrapSpec())
    uv = findUv()
    if (!uv) throw new Error('uv 설치 후 실행 파일을 찾지 못했습니다.')
  }
  await run({ cmd: uv, args: ['tool', 'install', '--force', 'hermes-agent[acp]'] })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installHermes().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
