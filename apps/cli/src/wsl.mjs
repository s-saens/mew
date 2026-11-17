import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { serviceArguments } from './daemon.mjs'
import { browserArgs } from './platform/windows.mjs'

const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const encoded = script => ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
const argument = value => '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"'

export function wslContext({ platform = process.platform, env = process.env, kernel = os.release(), user = os.userInfo().username } = {}) {
  if (platform !== 'linux' || !/microsoft/i.test(kernel)) return null
  if (!/WSL2|microsoft-standard/i.test(kernel)) throw new Error('Mew requires WSL 2. Upgrade this distribution before installing Mew.')
  const distro = env.WSL_DISTRO_NAME
  if (![distro, user].every(value => typeof value === 'string' && value.length && !/[\0\r\n]/.test(value))) throw new Error('Cannot identify this WSL distribution and Linux user. Open its normal WSL terminal and retry.')
  return { distro, user }
}

/** Register only this Windows user's existing distribution; never change WSL configuration. */
export function wslStartupDefinition(config, environment = {}) {
  const context = wslContext(environment)
  if (!context) return null
  const args = ['--distribution', context.distro, '--user', context.user, '--exec', config.nodePath, config.entry, ...serviceArguments(config.options)]
  if (args.some(value => typeof value !== 'string' || /[\0\r\n]/.test(value))) throw new Error('Invalid Mew WSL startup path.')
  const id = createHash('sha256').update(JSON.stringify([context.distro, context.user, path.resolve(config.options.dataDir)])).digest('hex').slice(0, 24)
  const name = `Mew-WSL-${id}`, marker = `Mew existing-WSL login startup ${id}`
  const preamble = `$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$name = ${literal(name)} + '-' + $sid
$marker = ${literal(marker)}
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing) {
  $owner = $existing.Principal.UserId
  if ($owner -notmatch '^S-1-') { $owner = ([System.Security.Principal.NTAccount]::new($owner)).Translate([System.Security.Principal.SecurityIdentifier]).Value }
  if ($owner -ne $sid -or $existing.Description -ne $marker) { throw 'An unrelated Windows task occupies the Mew startup name. Existing tasks were preserved.' }
}
`
  const register = preamble + `$wsl = Join-Path $env:SystemRoot 'System32\\wsl.exe'
$action = New-ScheduledTaskAction -Execute $wsl -Argument ${literal(args.map(argument).join(' '))}
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
$principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $name -Description $marker -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
`
  const unregister = preamble + "if ($existing) { Unregister-ScheduledTask -TaskName $name -Confirm:$false | Out-Null }\n"
  return { kind: 'wsl', name, registration: [['powershell.exe', encoded(register)]], unregistration: [['powershell.exe', encoded(unregister)]] }
}

export async function runWslStartupCommands(commands, run, action = 'register') {
  try { for (const [command, args] of commands) await run(command, args) }
  catch { throw new Error(`Mew could not ${action} Windows login startup from WSL. Enable Windows interop and access to PowerShell/Task Scheduler, then retry. No unrelated distribution or task was changed.`) }
}

export function wslBrowserLaunch(url, environment = {}) {
  if (!wslContext(environment)) return null
  const address = new URL(url)
  if (address.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || address.username || address.password) throw new Error('Mew can open only its local browser address from WSL.')
  return { command: 'powershell.exe', args: browserArgs(address.href) }
}
