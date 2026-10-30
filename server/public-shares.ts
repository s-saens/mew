import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { DATA_DIR, readJsonFile, writeFileAtomic } from './dataDir.ts'
import { assertNotServerDataPath, DEFAULT_PROJECT, isDeniedSegment, isSecretFile, pathsForWorkspace, projectRoot, resolveProjectPath, workspaceContext, workspacePaths } from './paths.ts'
import { fileAccess, subtreeAccess } from './access-policy.ts'
import { getUser } from './auth.ts'
import type { RequestAuth } from './reqAuth.ts'
import type { PublicShare, PublicShareFile, PublicShareInfo, PublicShareMode, PublicShareSetting } from '../shared/public-share.ts'
import type { FileVersion } from '../shared/file-version.ts'
import type { TreeNode } from './tree.ts'
import { textFileVersion } from './text-file.ts'
import { noteFileContentChanged } from './fileCatalog.ts'
import { broadcast } from './presence.ts'
import { recordChangeIp } from './change-ip.ts'

const STORE = path.join(DATA_DIR, 'public-shares.json')
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const MAX_TEXT_BYTES = 10 * 1024 * 1024
const EXTRA_PRIVATE = new Set(['.ssh', '.gnupg', '.aws', '.kube', '.npmrc', '.netrc', '.pypirc', '.worktrees'])

interface StoredShare extends Omit<PublicShare, 'url'> {
  project: string
  workspace: string
  root: string
  target: string
  creator: string
  creatorCreatedAt: number
}
interface Store { version: 1; shares: StoredShare[] }

export class PublicShareError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function missing(): never { throw new PublicShareError('Public link or file is unavailable.', 404) }
function within(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
function privateSegment(segment: string): boolean {
  return isDeniedSegment(segment) || isSecretFile(segment) || EXTRA_PRIVATE.has(segment.toLowerCase())
}
function relativePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || value.split('/').some(segment => segment === '..' || segment === '.' || privateSegment(segment))) {
    throw new PublicShareError('Invalid shared path.')
  }
  return value.split('/').filter(Boolean).join('/')
}
function load(): Store {
  const data = readJsonFile<Store>(STORE) ?? { version: 1, shares: [] }
  if (data.version !== 1 || !Array.isArray(data.shares) || data.shares.some(share => !share || !TOKEN.test(share.id) || !['f', 'd'].includes(share.type) || !['view', 'edit'].includes(share.mode) || !['workspace', 'root', 'target', 'creator', 'project', 'path'].every(key => typeof (share as unknown as Record<string, unknown>)[key] === 'string') || !Number.isFinite(share.creatorCreatedAt))) {
    throw new PublicShareError('Public link settings are unavailable.', 503)
  }
  return data
}
function save(data: Store): void { writeFileAtomic(STORE, JSON.stringify(data, null, 2) + '\n') }
function external(share: StoredShare): PublicShare {
  const { id, type, path: relative, mode } = share
  return { id, type, path: relative, mode, url: `/share/${type}/${id}` }
}

/** Public links never follow a project-relative symlink, including intermediate directories. */
function safeTarget(root: string, relative: string): string {
  const target = path.resolve(root, relative)
  if (!within(root, target)) missing()
  assertNotServerDataPath(target)
  let current = root
  for (const segment of relative.split('/').filter(Boolean)) {
    if (privateSegment(segment)) missing()
    current = path.join(current, segment)
    if (fs.lstatSync(current).isSymbolicLink()) missing()
  }
  if (fs.realpathSync(target) !== target) missing()
  return target
}

function currentRoot(project: string): { workspace: string; root: string } {
  const workspace = fs.realpathSync(workspacePaths.root)
  if (project === DEFAULT_PROJECT && !fs.existsSync(workspacePaths.docsRoot)) missing()
  const root = fs.realpathSync(projectRoot(project))
  if (!within(workspace, root) || path.relative(workspace, root).split(path.sep).some(privateSegment)) missing()
  return { workspace, root }
}

function manager(auth: RequestAuth): void {
  if (!auth.email || auth.mustChangePassword || !['owner', 'manager'].includes(auth.role)) throw new PublicShareError('Public link management requires an owner or manager.', 403)
}
function allowed(auth: RequestAuth, project: string, relative: string, mode: PublicShareMode): boolean {
  return fileAccess(auth, project, relative).edit && subtreeAccess(auth, project, relative, mode === 'edit', false)
}

export function getPublicShare(auth: RequestAuth, project: string, input: unknown): PublicShare | null {
  manager(auth)
  const relative = relativePath(input), { workspace, root } = currentRoot(project)
  if (!fileAccess(auth, project, relative).view) throw new PublicShareError('Access denied.', 403)
  const share = load().shares.find(item => item.workspace === workspace && item.root === root && item.path === relative)
  return share ? external(share) : null
}

export function listPublicShares(auth: RequestAuth, project: string): PublicShare[] {
  manager(auth)
  const { workspace, root } = currentRoot(project)
  return load().shares.filter(share => share.workspace === workspace && share.root === root && fileAccess(auth, project, share.path).view).map(external)
}

export function setPublicShare(auth: RequestAuth, project: string, input: unknown, mode: unknown): PublicShare | null {
  manager(auth)
  if (!['off', 'view', 'edit'].includes(mode as PublicShareSetting)) throw new PublicShareError('Choose a public link permission.')
  const relative = relativePath(input), { workspace, root } = currentRoot(project)
  if (!fileAccess(auth, project, relative).edit) throw new PublicShareError('Access denied.', 403)
  const data = load(), matches = (share: StoredShare) => share.workspace === workspace && share.root === root && share.path === relative
  const existing = data.shares.find(matches)
  data.shares = data.shares.filter(share => !matches(share))
  if (mode === 'off') { save(data); broadcast({ type: 'tree' }); return null }
  if (!allowed(auth, project, relative, mode as PublicShareMode)) throw new PublicShareError('The entire shared scope must allow the selected permission.', 403)
  const user = getUser(auth.email!)
  if (!user || user.role !== auth.role || user.mustChangePassword) throw new PublicShareError('Account access changed. Sign in again.', 403)
  const target = safeTarget(root, relative), stat = fs.statSync(target)
  if (!stat.isFile() && !stat.isDirectory()) throw new PublicShareError('Only files and folders can be shared.')
  // Check the ordinary resolver too, so aliases cannot lift its server data boundary.
  resolveProjectPath(project, relative)
  const share: StoredShare = { id: existing?.id ?? randomBytes(32).toString('base64url'), type: stat.isDirectory() ? 'd' : 'f', mode: mode as PublicShareMode, path: relative, project, workspace, root, target, creator: auth.email!, creatorCreatedAt: user.createdAt }
  data.shares.push(share)
  save(data)
  broadcast({ type: 'tree' })
  return external(share)
}

function scope<T>(type: unknown, id: unknown, action: (share: StoredShare, auth: RequestAuth) => T): T {
  if (typeof id !== 'string' || !TOKEN.test(id) || !['f', 'd'].includes(type as string)) missing()
  const share = load().shares.find(item => item.id === id && item.type === type)
  if (!share) missing()
  try {
    const user = getUser(share.creator)
    if (!user || user.createdAt !== share.creatorCreatedAt || !['owner', 'manager'].includes(user.role) || user.mustChangePassword) missing()
    const auth: RequestAuth = { role: user.role, email: share.creator, mustChangePassword: user.mustChangePassword }
    return workspaceContext.run(pathsForWorkspace(share.workspace, share.creator), () => {
      const current = currentRoot(share.project)
      if (current.workspace !== share.workspace || current.root !== share.root || safeTarget(share.root, share.path) !== share.target || !allowed(auth, share.project, share.path, share.mode)) missing()
      const stat = fs.statSync(share.target)
      if (share.type === 'f' ? !stat.isFile() : !stat.isDirectory()) missing()
      return action(share, auth)
    })
  } catch (error) {
    if (error instanceof PublicShareError) throw error
    missing()
  }
}

function targetFor(share: StoredShare, auth: RequestAuth, input: unknown): { target: string; relative: string; projectPath: string } {
  let relative: string
  try { relative = relativePath(input ?? '') } catch { missing() }
  if (share.type === 'f') {
    if (relative && relative !== path.basename(share.target)) missing()
    relative = ''
  }
  const projectPath = [share.path, relative].filter(Boolean).join('/')
  const target = safeTarget(share.root, projectPath)
  if (share.type === 'd' && !within(share.target, target) || share.type === 'f' && target !== share.target || !fileAccess(auth, share.project, projectPath).view) missing()
  return { target, relative, projectPath }
}

export function publicShareInfo(type: unknown, id: unknown): PublicShareInfo {
  return scope(type, id, share => ({ name: path.basename(share.target), type: share.type, mode: share.mode }))
}

export function publicShareTree(type: unknown, id: unknown, input: unknown): TreeNode[] {
  return scope(type, id, (share, auth) => {
    if (share.type !== 'd') missing()
    const { target, relative } = targetFor(share, auth, input)
    if (!fs.statSync(target).isDirectory()) missing()
    return fs.readdirSync(target, { withFileTypes: true }).flatMap(entry => {
      try {
        if (privateSegment(entry.name) || entry.isSymbolicLink()) return []
        const childPath = [relative, entry.name].filter(Boolean).join('/')
        const child = targetFor(share, auth, childPath)
        const stat = fs.statSync(child.target)
        if (!stat.isFile() && !stat.isDirectory()) return []
        return [{ name: entry.name, path: childPath, type: stat.isDirectory() ? 'dir' as const : 'file' as const, editable: share.mode === 'edit' && fileAccess(auth, share.project, child.projectPath).edit, ...(stat.isDirectory() ? { children: [] } : {}) }]
      } catch { return [] }
    }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)
  })
}

function openFile(target: string, write = false): number {
  const descriptor = fs.openSync(target, (write ? fs.constants.O_RDWR : fs.constants.O_RDONLY) | (fs.constants.O_NOFOLLOW ?? 0))
  const stat = fs.fstatSync(descriptor)
  if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) {
    fs.closeSync(descriptor)
    throw new PublicShareError(stat.size > MAX_TEXT_BYTES ? 'This file is too large for the public editor.' : 'File unavailable.', stat.size > MAX_TEXT_BYTES ? 413 : 404)
  }
  return descriptor
}
function decodeText(content: Buffer): string {
  try {
    if (content.includes(0)) throw new Error('Binary')
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch { throw new PublicShareError('This file cannot be opened as text.', 415) }
}

export function readPublicShareFile(type: unknown, id: unknown, input: unknown): PublicShareFile {
  return scope(type, id, (share, auth) => {
    const { target, relative } = targetFor(share, auth, input)
    const descriptor = openFile(target)
    try {
      const before = textFileVersion(target, fs.fstatSync(descriptor))
      const content = decodeText(fs.readFileSync(descriptor))
      const version = textFileVersion(target, fs.fstatSync(descriptor))
      if (before.tag !== version.tag) throw new PublicShareError('The file changed. Reload it.', 409, 'file-conflict')
      return { content, version, path: relative, name: path.basename(target) }
    } finally { fs.closeSync(descriptor) }
  })
}

export function writePublicShareFile(type: unknown, id: unknown, input: unknown, content: unknown, baseVersion: unknown, ip?: string): PublicShareFile {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_TEXT_BYTES || content.includes('\0')) throw new PublicShareError('Invalid file content.')
  return scope(type, id, (share, auth) => {
    if (share.mode !== 'edit') throw new PublicShareError('This public link is read-only.', 403)
    const { target, relative, projectPath } = targetFor(share, auth, input)
    if (!fileAccess(auth, share.project, projectPath).edit) missing()
    const descriptor = openFile(target, true)
    try {
      const version = textFileVersion(target, fs.fstatSync(descriptor))
      if (!(baseVersion as FileVersion | undefined)?.tag || (baseVersion as FileVersion).tag !== version.tag) throw new PublicShareError('The file changed. Reload it before saving.', 409, 'file-conflict')
      decodeText(fs.readFileSync(descriptor))
      // Recheck the opened inode after reading, before the first write; never create a missing file.
      if (textFileVersion(target, fs.fstatSync(descriptor)).tag !== version.tag || fs.statSync(target).ino !== fs.fstatSync(descriptor).ino) throw new PublicShareError('The file changed. Reload it before saving.', 409, 'file-conflict')
      const bytes = Buffer.from(content)
      let written = 0
      while (written < bytes.length) written += fs.writeSync(descriptor, bytes, written, bytes.length - written, written)
      fs.ftruncateSync(descriptor, bytes.length)
      noteFileContentChanged(share.project, projectPath)
      if (ip) recordChangeIp(target, ip, content)
      return { content, version: textFileVersion(target, fs.fstatSync(descriptor)), path: relative, name: path.basename(target) }
    } finally { fs.closeSync(descriptor) }
  })
}

/** The route streams this descriptor, keeping validation and opening in the same synchronous scope. */
export function openPublicShareRaw(type: unknown, id: unknown, input: unknown): { descriptor: number; name: string; size: number } {
  return scope(type, id, (share, auth) => {
    const { target } = targetFor(share, auth, input)
    const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile()) { fs.closeSync(descriptor); missing() }
    return { descriptor, name: path.basename(target), size: stat.size }
  })
}

export function decoratePublicShares(project: string, nodes: TreeNode[]): TreeNode[] {
  try {
    const { workspace, root } = currentRoot(project)
    const shares = new Map(load().shares.filter(share => share.workspace === workspace && share.root === root).map(share => [share.path, share.mode]))
    const visit = (entries: TreeNode[]): TreeNode[] => entries.map(node => ({ ...node, ...(shares.has(node.path) ? { publicShare: shares.get(node.path) } : {}), ...(node.children ? { children: visit(node.children) } : {}) }))
    return visit(nodes)
  } catch { return nodes }
}
