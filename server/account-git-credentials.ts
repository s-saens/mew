import fs from 'node:fs'
import path from 'node:path'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from './dataDir.ts'
import { getUser, normalizeEmail } from './auth.ts'

const directory = path.join(DATA_DIR, 'git-shell-capabilities')
const keyPath = path.join(directory, 'key')

function writeOnce(file: string, contents: string | Buffer): void {
  const temporary = `${file}.${randomBytes(12).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 })
    try { fs.linkSync(temporary, file) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  } finally { fs.rmSync(temporary, { force: true }) }
}

function key(create: boolean): Buffer {
  if (create) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (!fs.existsSync(keyPath)) writeOnce(keyPath, randomBytes(32))
  }
  const value = fs.readFileSync(keyPath)
  if (value.length !== 32) throw new Error('Invalid Git account capability key')
  return value
}

function signature(data: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function accountGitCredentialEnv(base: NodeJS.ProcessEnv, account: string): NodeJS.ProcessEnv {
  const owner = normalizeEmail(account)
  const user = getUser(owner)
  if (!user) throw new Error('Git 명령을 시작한 로그인 계정을 확인하세요.')
  const data = JSON.stringify({ owner, createdAt: user.createdAt })
  const mac = signature(data, key(true))
  const capability = path.join(directory, `${mac}.json`)
  if (!fs.existsSync(capability)) writeOnce(capability, JSON.stringify({ data, mac }))

  const env = { ...base }
  for (const name of Object.keys(env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/i.test(name) || /^(?:GIT_ASKPASS|SSH_ASKPASS|GH_TOKEN|GITHUB_TOKEN)$/i.test(name)) delete env[name]
  }
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  const helper = `!${quote(process.execPath)} ${quote(fileURLToPath(new URL('./account-git-helper.ts', import.meta.url)))}`
  const config: [string, string][] = [
    ['credential.helper', ''], ['credential.helper', helper], ['credential.useHttpPath', 'true'],
    ['credential.https://github.com.username', 'x-access-token'], ['http.extraHeader', ''],
    ['http.cookieFile', ''], ['http.saveCookies', 'false'], ['http.followRedirects', 'false'],
    ['url.https://github.com/.insteadOf', 'git@github.com:'],
    ['url.https://github.com/.insteadOf', 'ssh://git@github.com/'],
  ]
  env.GIT_CONFIG_COUNT = String(config.length)
  config.forEach(([name, value], i) => { env[`GIT_CONFIG_KEY_${i}`] = name; env[`GIT_CONFIG_VALUE_${i}`] = value })
  env.MEW_DATA_DIR = DATA_DIR
  env.MEW_GIT_ACCOUNT_CAPABILITY_FILE = capability
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

export function accountFromGitCapability(file: string): string {
  if (path.dirname(path.resolve(file)) !== path.resolve(directory) || !/^[a-f0-9]{64}\.json$/.test(path.basename(file))) throw new Error('Invalid Git account capability')
  const raw = fs.readFileSync(file, 'utf8')
  if (raw.length > 4096) throw new Error('Invalid Git account capability')
  const value = JSON.parse(raw) as { data?: unknown; mac?: unknown }
  if (typeof value.data !== 'string' || typeof value.mac !== 'string' || !/^[a-f0-9]{64}$/.test(value.mac)) throw new Error('Invalid Git account capability')
  const actual = Buffer.from(value.mac, 'hex'), expected = Buffer.from(signature(value.data, key(false)), 'hex')
  if (!timingSafeEqual(actual, expected) || path.basename(file) !== `${value.mac}.json`) throw new Error('Invalid Git account capability')
  const payload = JSON.parse(value.data) as { owner?: unknown; createdAt?: unknown }
  if (typeof payload.owner !== 'string' || typeof payload.createdAt !== 'number') throw new Error('Invalid Git account capability')
  const user = getUser(payload.owner)
  if (!user || user.createdAt !== payload.createdAt) throw new Error('Mew account no longer exists')
  return payload.owner
}
