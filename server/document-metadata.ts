import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PROJECT, projectRoot, workspacePaths } from './paths.ts'
import { safeProjectPath } from './project-agent-settings.ts'

type MetadataFile = 'comments.json' | 'table-layout.json' | 'frontmatter-options.json'
type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('문서 메타데이터 형식을 확인하세요')
  return value as JsonObject
}

function read(file: string): JsonObject {
  const data = object(JSON.parse(fs.readFileSync(file, 'utf8')))
  if (data.version !== 1) throw new Error('문서 메타데이터 버전을 확인하세요')
  return data
}

/** Documents is a view of the active project, so its sidecars belong to that project. */
export function documentMetadataKey(project: string, relative: string): string {
  return project === DEFAULT_PROJECT
    ? path.posix.join(workspacePaths.docsDir.split(path.sep).join('/'), relative)
    : relative
}

function mergeThreads(current: unknown, legacy: unknown): unknown[] {
  if (!Array.isArray(current) || !Array.isArray(legacy)) throw new Error('댓글 저장 형식을 확인하세요')
  const threads = new Map<string, JsonObject>()
  for (const value of [...legacy, ...current]) {
    const thread = object(value)
    if (typeof thread.id !== 'string' || !Array.isArray(thread.comments)) throw new Error('댓글 저장 형식을 확인하세요')
    const previous = threads.get(thread.id)
    const comments = new Map<string, JsonObject>()
    for (const item of [...(previous?.comments as unknown[] ?? []), ...thread.comments]) {
      const comment = object(item)
      if (typeof comment.id !== 'string') throw new Error('댓글 저장 형식을 확인하세요')
      comments.set(comment.id, comment)
    }
    threads.set(thread.id, { ...thread, comments: [...comments.values()] })
  }
  return [...threads.values()]
}

function mergeOptions(current: JsonObject, legacy: JsonObject): JsonObject {
  const fields = new Map<string, unknown>()
  for (const data of [legacy, current]) {
    for (const [key, value] of Object.entries(object(data.fields ?? {}))) {
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('선택 항목 저장 형식을 확인하세요')
      fields.set(key, [...new Set([...(fields.get(key) as string[] ?? []), ...value])])
    }
  }
  const colors = new Map<string, unknown>()
  for (const data of [legacy, current]) {
    for (const [key, value] of Object.entries(object(data.colors ?? {}))) {
      colors.set(key, { ...object(colors.get(key) ?? {}), ...object(value) })
    }
  }
  return { ...legacy, ...current, fields: Object.fromEntries(fields), colors: Object.fromEntries(colors) }
}

/** Migrate on access; publish the merged file before removing only the known legacy file. */
export function documentMetadataFile(project: string, name: MetadataFile): string {
  const root = project === DEFAULT_PROJECT ? workspacePaths.root : projectRoot(project)
  const file = safeProjectPath(root, `.mew/${name}`)
  if (project !== DEFAULT_PROJECT) return file
  const legacyFile = safeProjectPath(projectRoot(project), `.mew/${name}`)
  if (!fs.existsSync(legacyFile)) return file

  const legacy = read(legacyFile)
  const current = fs.existsSync(file) ? read(file) : { version: 1 }
  let merged: JsonObject
  if (name === 'frontmatter-options.json') {
    merged = mergeOptions(current, legacy)
  } else {
    const docs = new Map(Object.entries(object(current.docs ?? {})))
    for (const [key, value] of Object.entries(object(legacy.docs))) {
      const target = documentMetadataKey(project, key)
      const previous = docs.get(target)
      docs.set(target, previous === undefined ? value : name === 'comments.json' ? mergeThreads(previous, value) : previous)
    }
    merged = { ...legacy, ...current, docs: Object.fromEntries(docs) }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = safeProjectPath(root, `.mew/${name}.${randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  fs.unlinkSync(legacyFile)
  try {
    fs.rmdirSync(path.dirname(legacyFile))
  } catch (error) {
    if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
  return file
}
