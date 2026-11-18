import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { windowsShell } from '../packages/tmux-term/src/server/backends/psmux.ts'
import type { SpawnSpec } from './agentRuntimes.ts'

export const CURSOR_INSTALL_URL = 'https://cursor.com/install'

function localAppData(home: string): string {
  return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
}

export function cursorInstallDirectories(home = os.homedir(), platform = process.platform): string[] {
  return platform === 'win32'
    ? [path.join(localAppData(home), 'cursor-agent')]
    : [path.join(home, '.local', 'bin'), path.join(home, '.cursor', 'bin')]
}

function cursorAliases(home: string): string[] {
  return ['agent', 'cursor-agent'].map(name => path.join(home, '.local/bin', name))
}

function isCursorAlias(alias: string, home: string): boolean {
  if (!fs.lstatSync(alias, { throwIfNoEntry: false })?.isSymbolicLink()) return false
  const target = path.resolve(path.dirname(alias), fs.readlinkSync(alias))
  return path.basename(target) === 'cursor-agent' &&
    path.dirname(path.dirname(target)) === path.join(home, '.local/share/cursor-agent/versions')
}

export function cursorInstallSpec(home = os.homedir(), platform = process.platform): SpawnSpec {
  if (platform === 'win32') {
    const [directory] = cursorInstallDirectories(home, platform)
    const state = fs.lstatSync(directory, { throwIfNoEntry: false })
    if (state) {
      // The official Windows installer deletes this directory before it downloads.
      const entries = state.isDirectory() ? fs.readdirSync(directory) : null
      const versions = path.join(directory, 'versions')
      const emptyRetry = entries?.length === 1 && entries[0] === 'versions' &&
        fs.lstatSync(versions).isDirectory() && fs.readdirSync(versions).length === 0
      if (entries?.length !== 0 && !emptyRetry) throw new Error('기존 Cursor 설치를 보존하기 위해 새로 설치할 수 없습니다. 기존 설치에서 업데이트를 실행하세요.')
    }
    return {
      cmd: windowsShell(),
      args: ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; Invoke-RestMethod '${CURSOR_INSTALL_URL}?win32=true' | Invoke-Expression`],
      env: { LOCALAPPDATA: localAppData(home) },
    }
  }
  // The vendor installer replaces both aliases. Preserve files owned by other installations.
  for (const alias of cursorAliases(home)) {
    if (fs.lstatSync(alias, { throwIfNoEntry: false }) && !isCursorAlias(alias, home)) {
      throw new Error(`다른 실행 파일이 Cursor 설치 경로(${alias})를 사용하고 있습니다`)
    }
  }
  return { cmd: 'bash', args: ['-o', 'pipefail', '-c', `curl -fsSL ${CURSOR_INSTALL_URL} | bash`] }
}

export function cursorUpdateSpec(executable: string, home = os.homedir()): SpawnSpec {
  // The public installer updates standard Unix aliases without CLI account authentication.
  const resolved = path.resolve(executable)
  if (process.platform !== 'win32' && cursorAliases(home).includes(resolved) && isCursorAlias(resolved, home)) {
    return cursorInstallSpec(home)
  }
  return { cmd: executable, args: ['update'] }
}
