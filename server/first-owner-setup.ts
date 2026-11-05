import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { hasExistingInstallationData, readOwnerSetupState, sealOwnerSetup, withAccountStorageLock, writeOwnerSetupState } from './account-storage.ts'
import { hashPassword, isValidEmail, mutateAccountDirectory, normalizeEmail, readAccountDirectory, validateDisplayName, validateNewPassword } from './auth.ts'

const TOKEN_TTL_MS = 60 * 60_000

export class FirstOwnerSetupError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

/** Only a trusted local installer/CLI calls this; no HTTP endpoint can arm setup. */
export function prepareFirstOwnerSetup(workspace?: string): { setupRequired: boolean; token?: string } {
  return withAccountStorageLock(() => {
    if (Object.keys(readAccountDirectory().accounts).length) { sealOwnerSetup(); return { setupRequired: false } }
    const previous = readOwnerSetupState()
    if (previous?.state === 'closed') return { setupRequired: false }
    if (!previous && hasExistingInstallationData()) { sealOwnerSetup(); return { setupRequired: false } }
    const token = randomBytes(32).toString('base64url')
    writeOwnerSetupState({ version: 1, state: 'pending', tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: Date.now() + TOKEN_TTL_MS, ...(workspace ? { workspace: path.resolve(workspace) } : {}) })
    return { setupRequired: true, token }
  })
}

export function firstOwnerSetupRequired(): boolean {
  return Object.keys(readAccountDirectory().accounts).length === 0 && readOwnerSetupState()?.state === 'pending'
}

export interface FirstOwnerInput { token?: unknown; email?: unknown; password?: unknown; displayName?: unknown }

export function createFirstOwner(input: FirstOwnerInput): { email: string; workspace?: string } {
  const email = normalizeEmail(input.email), password = input.password
  if (!isValidEmail(email) || typeof password !== 'string') throw new FirstOwnerSetupError('Enter a valid email and password.', 400)
  const policyError = validateNewPassword(password, email)
  if (policyError) throw new FirstOwnerSetupError(policyError, 400)
  const displayName = input.displayName === undefined ? undefined : validateDisplayName(input.displayName)
  if (displayName === null) throw new FirstOwnerSetupError('Display name must contain 1–50 characters without control characters.', 400)
  return mutateAccountDirectory(directory => {
    const state = readOwnerSetupState()
    if (Object.keys(directory.accounts).length || state?.state !== 'pending') throw new FirstOwnerSetupError('Administrator setup is already closed. Sign in with an existing account.', 409)
    const supplied = typeof input.token === 'string' && input.token.length <= 256 ? input.token : ''
    const actual = createHash('sha256').update(supplied).digest(), expected = Buffer.from(state.tokenHash, 'hex')
    if (!supplied || state.expiresAt <= Date.now() || !timingSafeEqual(actual, expected)) throw new FirstOwnerSetupError('The setup link is invalid or expired. Reopen Mew from the local installer.', 403)
    const hash = hashPassword(password), now = Date.now()
    // Close enrollment first: an interrupted account write requires local recovery.
    sealOwnerSetup()
    directory.accounts[email] = { id: email, role: 'owner', createdAt: now, contactEmail: email, ...(displayName ? { displayName } : {}) }
    directory.passwordCredentials[email] = { email, hash, mustChangePassword: false, passwordChangedAt: now }
    return { email, ...(state.workspace ? { workspace: state.workspace } : {}) }
  })
}
