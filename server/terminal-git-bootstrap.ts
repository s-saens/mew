import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const posixQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const powershellQuote = (value: string) => `'${value.replaceAll("'", "''")}'`
const managedKey = (key: string) => /^(?:GIT_CONFIG_.*|GIT_AUTHOR_.*|GIT_COMMITTER_.*|GIT_TERMINAL_PROMPT|GIT_ASKPASS|SSH_ASKPASS|GCM_INTERACTIVE|GH_TOKEN|GITHUB_TOKEN|MEW_GIT_.*|MEW_DATA_DIR)$/.test(key)

/** Supply session-specific Git settings to a multiplexer without exposing them in argv. */
export function terminalGitBootstrap(env: NodeJS.ProcessEnv): { command: string; cleanup: () => void } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-terminal-env-'))
  const file = path.join(directory, process.platform === 'win32' ? 'start.ps1' : 'start.sh')
  const keys = Object.keys(env).filter(key => managedKey(key) && env[key] !== undefined)
  let script: string
  let command: string
  if (process.platform === 'win32') {
    const assignments = keys.map(key => `$env:${key} = ${powershellQuote(env[key]!)}`).join('\n')
    script = `Get-ChildItem Env: | Where-Object { $_.Name -match '^(GIT_CONFIG_.*|GIT_AUTHOR_.*|GIT_COMMITTER_.*|GIT_TERMINAL_PROMPT|GIT_ASKPASS|SSH_ASKPASS|GCM_INTERACTIVE|GH_TOKEN|GITHUB_TOKEN|MEW_GIT_.*|MEW_DATA_DIR)$' } | ForEach-Object { Remove-Item ("Env:" + $_.Name) -ErrorAction SilentlyContinue }\n${assignments}\nRemove-Item -LiteralPath ${powershellQuote(file)} -Force -ErrorAction SilentlyContinue\nRemove-Item -LiteralPath ${powershellQuote(directory)} -Force -ErrorAction SilentlyContinue\n& powershell.exe -NoLogo\n`
    command = `& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ${powershellQuote(file)}`
  } else {
    const assignments = keys.map(key => `export ${key}=${posixQuote(env[key]!)}`).join('\n')
    const shell = process.env.SHELL || '/bin/sh'
    script = `for key in $(env | sed 's/=.*//'); do\n  case "$key" in GIT_CONFIG_*|GIT_AUTHOR_*|GIT_COMMITTER_*|GIT_TERMINAL_PROMPT|GIT_ASKPASS|SSH_ASKPASS|GCM_INTERACTIVE|GH_TOKEN|GITHUB_TOKEN|MEW_GIT_*|MEW_DATA_DIR) unset "$key";; esac\ndone\n${assignments}\nrm -f -- ${posixQuote(file)}\nrmdir -- ${posixQuote(directory)} 2>/dev/null || :\nexec ${posixQuote(shell)} -l\n`
    command = `exec /bin/sh ${posixQuote(file)}`
  }
  try { fs.writeFileSync(file, script, { mode: 0o600, flag: 'wx' }) } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error }
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true })
  const timeout = setTimeout(cleanup, 60_000)
  timeout.unref()
  return { command, cleanup: () => { clearTimeout(timeout); cleanup() } }
}
