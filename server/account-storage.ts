import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA_DIR, DataFileError, readJsonFile, writeFileAtomic } from './dataDir.ts'
import { protectDirectory } from './platform/storage.ts'

export type OwnerSetupState = { version: 1; state: 'closed' } | {
  version: 1; state: 'pending'; tokenHash: string; expiresAt: number; workspace?: string
}
export const OWNER_SETUP_FILE = path.join(DATA_DIR, 'owner-setup.json')
const LOCK_FILE = path.join(DATA_DIR, 'accounts.lock')

export class AccountStorageBusyError extends Error {}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' }
}

function releaseOwnedLock(file: string, token: string): void {
  try {
    if ((JSON.parse(fs.readFileSync(file, 'utf8')) as { token?: string }).token === token) fs.unlinkSync(file)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

function completeOwnedOperation<T>(file: string, token: string, action: () => T): T {
  let result: T
  try { result = action() }
  catch (error) {
    try { releaseOwnedLock(file, token) } catch { /* Preserve the mutation failure for local recovery. */ }
    throw error
  }
  releaseOwnedLock(file, token)
  return result
}

/** CLI and HTTP account mutations share an exclusive, synchronous transaction. */
export function withAccountStorageLock<T>(action: () => T): T {
  protectDirectory(DATA_DIR)
  const token = randomUUID(), guard = `${LOCK_FILE}.recovery`
  for (let attempt = 0; attempt < 3; attempt++) {
    let descriptor: number | undefined
    try { descriptor = fs.openSync(LOCK_FILE, 'wx', 0o600) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    if (descriptor !== undefined) {
      try { fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token })) }
      finally { fs.closeSync(descriptor) }
      return completeOwnedOperation(LOCK_FILE, token, action)
    }
    let recovery: number
    try { recovery = fs.openSync(guard, 'wx', 0o600) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      throw new AccountStorageBusyError('Account recovery is busy. If recovery was interrupted, verify no account operation is running before removing accounts.lock.recovery from the Mew data directory.')
    }
    try { fs.writeFileSync(recovery, JSON.stringify({ pid: process.pid, token })) }
    finally { fs.closeSync(recovery) }
    completeOwnedOperation(guard, token, () => {
      let previous: { pid?: number }
      try { previous = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw new DataFileError('Account storage lock is unreadable. Check local account operations before recovering accounts.lock.')
      }
      if (!Number.isSafeInteger(previous.pid) || previous.pid! < 1 || alive(previous.pid!)) throw new AccountStorageBusyError('Account storage is busy. Retry after the other account operation completes.')
      fs.unlinkSync(LOCK_FILE)
    })
  }
  throw new AccountStorageBusyError('Could not acquire the account storage lock.')
}

export function readOwnerSetupState(): OwnerSetupState | null {
  const state = readJsonFile<OwnerSetupState>(OWNER_SETUP_FILE)
  if (state === null) return null
  if (state.version !== 1 || (state.state !== 'closed' && (state.state !== 'pending'
    || !/^[a-f0-9]{64}$/.test(state.tokenHash) || !Number.isSafeInteger(state.expiresAt)
    || state.expiresAt < 0 || (state.workspace !== undefined && !path.isAbsolute(state.workspace))))) {
    throw new DataFileError('Invalid owner setup state. Recover the existing installation instead of creating another administrator.')
  }
  return state
}

export function writeOwnerSetupState(state: OwnerSetupState): void {
  writeFileAtomic(OWNER_SETUP_FILE, JSON.stringify(state) + '\n')
}

/** Persist separately from users.json so deleting account data cannot reopen setup. */
export function sealOwnerSetup(): void {
  if (readOwnerSetupState()?.state !== 'closed') writeOwnerSetupState({ version: 1, state: 'closed' })
}

export function hasExistingInstallationData(): boolean {
  const transient = new Set(['accounts.lock', 'accounts.lock.recovery', 'server.lock', 'server.lock.recovery', 'cli-host.lock', 'cli-host.lock.recovery'])
  return fs.readdirSync(DATA_DIR).some(name => !transient.has(name))
}
