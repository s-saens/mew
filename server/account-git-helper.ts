import { accountFromGitCapability } from './account-git-credentials.ts'
import { gitConnections } from './git-connections.ts'
import { gitProvider } from './git-providers.ts'

async function main() {
  if (process.argv[2] !== 'get') return
  let input = ''
  for await (const part of process.stdin) {
    input += String(part)
    if (input.length > 8192) throw new Error('Invalid Git credential request')
  }
  const fields = Object.fromEntries(input.trim().split('\n').map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
  const provider = gitProvider()
  if (fields.protocol !== 'https' || fields.host !== provider.host || !provider.acceptsPath('/' + (fields.path ?? ''))) return
  const owner = accountFromGitCapability(process.env.MEW_GIT_ACCOUNT_CAPABILITY_FILE ?? '')
  await gitConnections.resolve(owner, provider.id, provider.host, provider.refresh)
  const connection = gitConnections.require(owner, provider.id, provider.host)
  if (/[\r\n\0]/.test(connection.accessToken)) throw new Error('Invalid Git credential')
  process.stdout.write(`username=${provider.gitUsername}\npassword=${connection.accessToken}\n\n`)
}

main().catch(() => { process.stderr.write('Mew GitHub connection is unavailable. Connect or reconnect GitHub in Mew and retry.\n'); process.exitCode = 1 })
