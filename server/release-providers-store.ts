import fs from 'node:fs'
import path from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { DATA_DIR, writeFileAtomic } from './dataDir.ts'
import { getUser } from './auth.ts'
import type { ReleaseConnectionConfig, ReleaseProviderRun } from '../shared/release-providers.ts'
import { ReleaseProviderError } from './release-providers-common.ts'

export interface StoredReleaseConnection { id: string; generation: string; config: ReleaseConnectionConfig; token: string }
export interface StoredReleaseRun extends ReleaseProviderRun {
  revision: number
  requestId: string
  config: ReleaseConnectionConfig
  generation: string
  operationId?: string
}
export interface StoredReleaseState { version: 1; connections: StoredReleaseConnection[]; runs: StoredReleaseRun[] }
export interface ReleaseScope { root: string; owner: string; accountVersion: number | null; identity: string }

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Tokens and remote run tracking remain outside the editable project and browser state. */
export class ReleaseProvidersStore {
  private directory: string
  private accountVersion: (owner: string) => number | null
  constructor(directory = path.join(DATA_DIR, 'release-providers'), accountVersion = (owner: string) => getUser(owner)?.createdAt ?? null) {
    this.directory = directory; this.accountVersion = accountVersion
  }
  scope(root: string, owner: string): ReleaseScope {
    if (!owner || owner.length > 1000) throw new ReleaseProviderError('Mew에 로그인하세요.', 403)
    const canonical = fs.realpathSync(root), stat = fs.statSync(canonical)
    if (!stat.isDirectory()) throw new ReleaseProviderError('프로젝트 폴더를 확인하세요.')
    return { root: canonical, owner, accountVersion: this.accountVersion(owner), identity: `${stat.dev}:${stat.ino}` }
  }
  current(scope: ReleaseScope): boolean {
    try {
      const current = this.scope(scope.root, scope.owner)
      return current.accountVersion === scope.accountVersion && current.identity === scope.identity
    } catch { return false }
  }
  private binding(scope: ReleaseScope): string { return JSON.stringify([scope.owner, scope.accountVersion, scope.root, scope.identity]) }
  private file(scope: ReleaseScope): string { return path.join(this.directory, digest(scope.owner), digest([scope.accountVersion, scope.root, scope.identity]) + '.json') }
  private key(create: boolean): Buffer {
    const file = path.join(this.directory, 'key')
    if (create) {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      try { fs.writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    const key = fs.readFileSync(file)
    if (key.length !== 32) throw new Error('key')
    return key
  }
  read(scope: ReleaseScope): StoredReleaseState {
    let raw: string
    try { raw = fs.readFileSync(this.file(scope), 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, connections: [], runs: [] }; throw new ReleaseProviderError('공개 서비스 연결 정보를 읽지 못했습니다.', 503) }
    try {
      const encrypted = JSON.parse(raw), decipher = createDecipheriv('aes-256-gcm', this.key(false), Buffer.from(encrypted.iv, 'base64'))
      decipher.setAAD(Buffer.from(this.binding(scope))); decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'))
      const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.data, 'base64')), decipher.final()]).toString())
      if (value.version !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.runs)) throw new Error('shape')
      return value as StoredReleaseState
    } catch { throw new ReleaseProviderError('공개 서비스 연결 저장소를 읽지 못했습니다. 암호화 키와 저장 파일을 확인하세요.', 503) }
  }
  write(scope: ReleaseScope, value: StoredReleaseState): void {
    if (!this.current(scope)) throw new ReleaseProviderError('계정이나 프로젝트가 변경되었습니다. 다시 여세요.', 409)
    const iv = randomBytes(12), encryption = createCipheriv('aes-256-gcm', this.key(true), iv)
    encryption.setAAD(Buffer.from(this.binding(scope)))
    const data = Buffer.concat([encryption.update(JSON.stringify(value)), encryption.final()])
    const file = this.file(scope)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    writeFileAtomic(file, JSON.stringify({ iv: iv.toString('base64'), tag: encryption.getAuthTag().toString('base64'), data: data.toString('base64') }))
  }
  removeAccount(owner: string): void { fs.rmSync(path.join(this.directory, digest(owner)), { recursive: true, force: true }) }
}

export const releaseProvidersStore = new ReleaseProvidersStore()
export function removeReleaseProviderAccount(owner: string): void { releaseProvidersStore.removeAccount(owner) }
