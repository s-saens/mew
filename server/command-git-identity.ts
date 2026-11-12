import { getUser, normalizeEmail, userProfile } from './auth.ts'
import { gitConnections } from './git-connections.ts'
import { encodedCommand, windowsShell } from '../packages/tmux-term/src/server/backends/psmux.ts'
import { spawnSpecCommand } from './spawnSpecCommand.ts'

/** Scope attribution to one invocation, including commands launched by its shell. */
export function commandWithGitIdentity(command: string, account: string): string {
  const email = normalizeEmail(account)
  const user = getUser(email)
  const identity = gitConnections.get(email)?.identity ?? { name: user ? userProfile(email, user).displayName : email.split('@')[0], email }
  const name = Array.from(identity.name).filter(char => char >= ' ' && char !== '\u007f' && char !== '<' && char !== '>').join('').trim() || email.split('@')[0]
  const env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: identity.email }
  if (process.platform === 'win32') {
    const script = `Remove-Item Env:GIT_AUTHOR_DATE, Env:GIT_COMMITTER_DATE -ErrorAction SilentlyContinue\n${command}`
    return spawnSpecCommand({ cmd: windowsShell(), args: encodedCommand(script), env })
  }
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`
  const exports = Object.entries(env).map(([key, value]) => `export ${key}=${quote(value)}`).join('; ')
  return `(unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE; ${exports};\n${command}\n)`
}
