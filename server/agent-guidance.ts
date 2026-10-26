import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { agentSettingsPath } from './agent-account-settings.ts'
import { DATA_DIR, writeFileAtomic } from './dataDir.ts'
import { documentationGuidanceKeys, guidanceOptions, type GuidanceKey, type GuidanceSnapshot } from '../shared/agent-guidance.ts'
import { branchGuidanceText, branchGuidanceValidationError, defaultBranchGuidance, type BranchGuidanceSettings, type BranchGuidanceSnapshot } from '../shared/branch-guidance.ts'
import { legacyBranchGuidanceKeys, legacyBranchGuidanceText, type LegacyBranchGuidanceSettings } from '../shared/branch-guidance-v1.ts'
import { previousBranchGuidanceText } from '../shared/branch-guidance-v2.ts'
import { agentCapacityRetryMetadata, agentCapacityRetryValidationError, defaultAgentCapacityRetrySettings, type AgentCapacityRetrySettings } from '../shared/agent-capacity-retry.ts'

export const AGENT_GUIDANCE_PATH = path.join(DATA_DIR, 'agent-guidance.md')
export const agentGuidancePath = () => agentSettingsPath('agent-guidance.md')
const legacyPath = () => agentSettingsPath('agent-guidance.txt')
const template = new URL('./prompts/agent-guidance.txt', import.meta.url)
const skillUsageGuidance = 'Do not announce skill use in opening or progress messages. If you used skills, end the final response with a single line listing only the skills actually used, without duplicates: "사용된 스킬: <names>" for Korean responses, "Used skills: <names>" for English responses, or an equivalent label in the response language. Omit this line when no skills were used. Follow higher-priority instructions when they require a skill announcement.'
export type CommitLanguageSnapshot = { commitLanguage: string; responseLanguage: string | null }
const commitLanguageContext = new AsyncLocalStorage<CommitLanguageSnapshot>()

function seed(): Buffer {
  try { return fs.readFileSync(legacyPath()) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return fs.readFileSync(template)
  }
}

/** Publish a complete seed atomically; concurrent hosts never replace an existing file. */
export function ensureAgentGuidance(): string {
  try { fs.lstatSync(agentGuidancePath()); return agentGuidancePath() }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  fs.mkdirSync(path.dirname(agentGuidancePath()), { recursive: true, mode: 0o700 })
  const temporaryDir = fs.mkdtempSync(path.join(DATA_DIR, '.agent-guidance-'))
  const temporary = path.join(temporaryDir, 'seed')
  try {
    fs.writeFileSync(temporary, seed(), { mode: 0o600 })
    try { fs.linkSync(temporary, agentGuidancePath()) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  } finally { fs.rmSync(temporaryDir, { recursive: true, force: true }) }
  return agentGuidancePath()
}

/** No cache: edits apply to the next request. Preview alone does not create state. */
export function readAgentGuidance(locale?: string): string {
  try { return effectiveGuidance(fs.readFileSync(agentGuidancePath(), 'utf8').trim(), locale) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return effectiveGuidance(seed().toString('utf8').trim(), locale)
  }
}

/** Runtime policy is account-scoped and reread for each new request. */
export function readAgentCapacityRetrySettings(): AgentCapacityRetrySettings {
  try { return capacityRetrySettings(fs.readFileSync(agentGuidancePath(), 'utf8')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return capacityRetrySettings(seed().toString('utf8'))
  }
}

function effectiveGuidance(content: string, locale?: string): string {
  // Retry timing belongs to the supervisor, not the agent's instruction text.
  try {
    const retry = isolatedRegion(content, 'capacityRetry')
    if (retry) content = content.slice(0, retry.from) + content.slice(retry.to)
  } catch { /* Preserve handwritten text surrounding damaged markers. */ }
  let defaults = withDocumentationDefaults(currentDocumentationGuidance(content))
  defaults = withBranchDefault(withTestingDefault(withDebuggerDefault(withCommitLanguageDefault(defaults))))
  const branch = branchSnapshot(defaults)
  if (!branch.custom) {
    const block = region(defaults, 'branch')
    if (block && /^<!-- mew:branch-guidance:v[12] /.test(block.text)) {
      const [start, end] = markers('branch')
      defaults = defaults.slice(0, block.from) + `${start}\n${branchGuidanceText(branch.value)}\n${end}` + defaults.slice(block.to)
    }
  }
  if (!branch.custom && branch.value.strategy !== 'inherit' && branch.value.workflow !== 'manual') {
    // Keep saved preferences and handwritten instructions intact; only the
    // redundant standard commit block is omitted from the request.
    try {
      const commit = region(defaults, 'commit')
      if (commit && Object.values(guidanceOptions.commit).some(text => text === commit.text)) {
        content = defaults.slice(0, commit.from) + defaults.slice(commit.to)
      } else content = defaults
    } catch { content = defaults }
  } else content = defaults
  return withCommitLanguageSnapshot(resolveCommitLanguage(resolveGuidanceLanguage(withSkillUsageDefault(content), locale), locale))
}

/** The AI commit planner uses the same account preference as ordinary agents. */
export function readCommitLanguageGuidance(locale?: string): string {
  const content = readAgentGuidance(locale)
  try {
    const block = isolatedRegion(content, 'commitLanguage')
    if (!block) return ''
    if (block.text !== guidanceOptions.commitLanguage.agent) return block.text
    const response = isolatedRegion(content, 'language')
    const instructions = isolatedRegion(content, 'instructions')
    const context = [response?.text, instructions?.text, handwrittenGuidance(content)].filter(Boolean).join('\n\n')
    return `${block.text}\nResponse-language guidance captured when this job started:\n${context || '(No explicit response-language guidance.)'}\nIf this guidance does not establish a response language, use English for this automatic planning request, which has no user-language sample.`
  }
  catch { return '' }
}

export function captureCommitLanguageSnapshot(locale?: string): CommitLanguageSnapshot | undefined {
  const content = readAgentGuidance(locale)
  try {
    const commit = isolatedRegion(content, 'commitLanguage')
    const response = isolatedRegion(content, 'language')
    if (!commit?.text || (!response && markers('language').some(marker => content.includes(marker)))) return undefined
    return { commitLanguage: commit.text, responseLanguage: response?.text ?? null }
  } catch { return undefined }
}

/** Scope only the two language preferences; all other current guidance stays intact. */
export function runWithCommitLanguageSnapshot<T>(snapshot: CommitLanguageSnapshot | undefined, action: () => T): T {
  if (!snapshot || typeof snapshot.commitLanguage !== 'string' || !snapshot.commitLanguage.trim()
    || (snapshot.responseLanguage !== null && typeof snapshot.responseLanguage !== 'string')
    || [snapshot.commitLanguage, snapshot.responseLanguage].some(text => text && /<!--\s*\/?mew:agent-setting:/.test(text))) return action()
  return commitLanguageContext.run(snapshot, action)
}

function withCommitLanguageSnapshot(content: string): string {
  const snapshot = commitLanguageContext.getStore()
  if (!snapshot) return content
  for (const [key, text] of [['commitLanguage', snapshot.commitLanguage], ['language', snapshot.responseLanguage]] as const) {
    try {
      const block = isolatedRegion(content, key), [start, end] = markers(key)
      if (!block && (content.includes(start) || content.includes(end))) continue
      const replacement = text === null ? '' : `${start}\n${text}\n${end}`
      if (block) content = content.slice(0, block.from) + replacement + content.slice(block.to)
      else if (replacement) content += `${content ? '\n\n' : ''}${replacement}`
    } catch { /* Keep damaged live blocks available for manual repair. */ }
  }
  return content
}

function handwrittenGuidance(content: string): string {
  const regions = regionKeys.map(key => region(content, key)).filter(block => block !== null).sort((a, b) => a.from - b.from)
  if (regions.some((block, i) => i > 0 && block.from < regions[i - 1].to)) return ''
  for (const block of regions.reverse()) content = content.slice(0, block.from) + content.slice(block.to)
  return content.trim()
}

function withSkillUsageDefault(content: string): string {
  return content.includes(skillUsageGuidance) ? content : `${content}${content ? '\n\n' : ''}${skillUsageGuidance}`
}

function resolveGuidanceLanguage(content: string, locale?: string): string {
  const key = locale === 'zh-CN' ? 'zh' : locale
  if (!key || !['ko', 'en', 'ja', 'zh'].includes(key)) return content
  try {
    const block = isolatedRegion(content, 'language')
    if (block?.text !== guidanceOptions.language.mew) return content
    const text = guidanceOptions.language[key as 'ko' | 'en' | 'ja' | 'zh']
    return content.slice(0, block.from) + content.slice(block.from, block.to).replace(block.text, text) + content.slice(block.to)
  } catch { return content }
}

function resolveCommitLanguage(content: string, locale?: string): string {
  try {
    const block = isolatedRegion(content, 'commitLanguage')
    if (!block) return content
    let key: string | undefined
    if (block.text === guidanceOptions.commitLanguage.mew) key = locale === 'zh-CN' ? 'zh' : locale
    else if (block.text === guidanceOptions.commitLanguage.agent) {
      const response = isolatedRegion(content, 'language')
      key = Object.entries(guidanceOptions.language).find(([, text]) => text && text === response?.text)?.[0]
    }
    if (!key || !['ko', 'en', 'ja', 'zh'].includes(key)) return content
    const text = guidanceOptions.commitLanguage[key as 'ko' | 'en' | 'ja' | 'zh']
    return content.slice(0, block.from) + content.slice(block.from, block.to).replace(block.text, text) + content.slice(block.to)
  } catch { return content }
}

/** Update only the former default wording; handwritten guidance and stored settings stay intact. */
function currentDocumentationGuidance(content: string): string {
  return content
    .replace('Use Documents entrypoints and maps to find only the current documents relevant to the task.', 'Use Documents entrypoints, then scan document paths and frontmatter description fields to select only the current documents relevant to the task before reading their bodies. Do not use MOC navigation or require map registration.')
    .replace('Update map links for new or moved documents.', 'For new or moved documents, no MOC update is required.')
    .replace('using the supplied Change intent recorder, after updating canonical docs.', 'using the supplied Change intent recorder, after any required canonical documentation updates.')
}

export class GuidanceError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

const revisionOf = (content: string) => createHash('sha256').update(content).digest('hex')
type GuidanceRegionKey = GuidanceKey | 'branch' | 'instructions' | 'capacityRetry'
const regionKeys: GuidanceRegionKey[] = [...Object.keys(guidanceOptions) as GuidanceKey[], 'branch', 'instructions', 'capacityRetry']
const markers = (key: GuidanceRegionKey) => [`<!-- mew:agent-setting:${key} -->`, `<!-- /mew:agent-setting:${key} -->`]

function withDocumentationDefaults(content: string): string {
  // Replace only complete former default paragraphs outside setting blocks.
  // The stored file, custom prose, examples, and explicit settings stay intact.
  const legacy = 'When code, features, or operating procedures change, update the owning canonical documentation in the same task. Give every new or changed document an accurate frontmatter description, and update existing links when paths move; no MOC update is required. Preserve historical sources; keep secrets and temporary debugging logs out of docs.'
  const legacyMetadata = 'Give every new or changed document an accurate frontmatter description, and update existing links when paths move; no MOC update is required.'
  let regions: ReturnType<typeof region>[] | undefined
  try { regions = regionKeys.map(key => region(content, key)) } catch { /* Preserve damaged files for editor repair. */ }
  if (regions) {
    const protectedRegions = regions
    let offset = 0, fence: string | undefined
    content = content.split('\n').map(line => {
      const from = offset
      offset += line.length + 1
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
      if (marker) {
        if (!fence) fence = marker
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
        return line
      }
      if (fence || protectedRegions.some(block => block && block.from <= from && from < block.to)) return line
      const text = line.replace(/\r$/, '')
      if (text === legacy) return 'Preserve historical sources; keep secrets and temporary debugging logs out of docs.'
      if (text === legacyMetadata) return ''
      return line
    }).join('\n')
  }
  for (const key of documentationGuidanceKeys) {
    const [start, end] = markers(key)
    if (!content.includes(start) && !content.includes(end)) content += `${content ? '\n\n' : ''}${start}\n${guidanceOptions[key].required}\n${end}`
  }
  return content
}

function withCommitLanguageDefault(content: string): string {
  const [start, end] = markers('commitLanguage')
  if (content.includes(start) || content.includes(end)) return content
  return `${content}${content ? '\n\n' : ''}${start}\n${guidanceOptions.commitLanguage.en}\n${end}`
}

function withTestingDefault(content: string): string {
  const [start, end] = markers('testing')
  if (content.includes(start) || content.includes(end)) return content
  return `${content}${content ? '\n\n' : ''}${start}\n${guidanceOptions.testing.required}\n${end}`
}

function withDebuggerDefault(content: string): string {
  const [start, end] = markers('debugger')
  // Preserve explicit/custom blocks, including damaged markers, for editor repair.
  if (content.includes(start) || content.includes(end)) return content
  return `${content}${content ? '\n\n' : ''}${start}\n${guidanceOptions.debugger.enabled}\n${end}`
}

function withBranchDefault(content: string): string {
  const [start, end] = markers('branch')
  if (content.includes(start) || content.includes(end)) return content
  return `${content}${content ? '\n\n' : ''}${start}\n${branchGuidanceText(defaultBranchGuidance)}\n${end}`
}

function region(content: string, key: GuidanceRegionKey) {
  const [start, end] = markers(key)
  const from = content.indexOf(start), closing = content.indexOf(end)
  if (from < 0 && closing < 0) return null
  if (from < 0 || closing < from + start.length || content.indexOf(start, from + start.length) >= 0 || content.indexOf(end, closing + end.length) >= 0) {
    throw new GuidanceError('설정 구간을 읽을 수 없습니다. 파일 보기에서 중복되거나 누락된 설정 표시를 확인하세요.', 409)
  }
  return { from, to: closing + end.length, text: content.slice(from + start.length, closing).trim() }
}

function isolatedRegion(content: string, key: GuidanceRegionKey) {
  const block = region(content, key)
  if (!block) return null
  for (const otherKey of regionKeys) {
    if (otherKey === key) continue
    const other = region(content, otherKey)
    if (other && other.from < block.to && block.from < other.to) return null
  }
  return block
}

function branchSnapshot(content: string): BranchGuidanceSnapshot {
  const fallback = () => ({ value: { ...defaultBranchGuidance }, custom: true })
  try {
    const block = region(content, 'branch')
    if (!block) return { value: { ...defaultBranchGuidance }, custom: false }
    for (const key of regionKeys) {
      if (key === 'branch') continue
      const other = region(content, key)
      if (other && other.from < block.to && block.from < other.to) return fallback()
    }
    const metadata = block.text.split('\n', 1)[0].match(/^<!-- mew:branch-guidance:v([123]) (.+) -->$/)
    if (!metadata) return fallback()
    const decoded: unknown = JSON.parse(metadata[2])
    if (metadata[1] === '1') {
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || Object.keys(decoded).length !== legacyBranchGuidanceKeys.length || legacyBranchGuidanceKeys.some(key => !Object.hasOwn(decoded, key))) return fallback()
      const value = { ...decoded, workflow: defaultBranchGuidance.workflow }
      if (branchGuidanceValidationError(value)) return fallback()
      return { value: value as BranchGuidanceSettings, custom: block.text !== legacyBranchGuidanceText(decoded as LegacyBranchGuidanceSettings) }
    }
    const value = decoded
    if (branchGuidanceValidationError(value)) return fallback()
    const settings = value as BranchGuidanceSettings
    const expected = metadata[1] === '2' ? previousBranchGuidanceText(settings) : branchGuidanceText(settings)
    return { value: settings, custom: block.text !== expected }
  } catch { return fallback() }
}

function capacityRetrySettings(content: string): AgentCapacityRetrySettings {
  try {
    const block = isolatedRegion(content, 'capacityRetry')
    const metadata = block?.text.match(/^<!-- mew:agent-capacity-retry:v1 (.+) -->$/)
    const value: unknown = metadata && JSON.parse(metadata[1])
    if (value && !agentCapacityRetryValidationError(value)) return { ...value as AgentCapacityRetrySettings }
  } catch { /* Invalid or damaged metadata uses the safe default policy. */ }
  return { ...defaultAgentCapacityRetrySettings }
}

function snapshot(content: string): GuidanceSnapshot {
  const settings = {} as GuidanceSnapshot['settings']
  for (const key of Object.keys(guidanceOptions) as GuidanceKey[]) {
    try {
      const block = region(content, key)
      settings[key] = block ? Object.entries(guidanceOptions[key]).find(([, text]) => text === block.text)?.[0] ?? 'custom' : key === 'testing' || documentationGuidanceKeys.some(docKey => docKey === key) ? 'required' : key === 'debugger' ? 'enabled' : key === 'commitLanguage' ? 'en' : 'inherit'
    } catch { settings[key] = 'custom' }
  }
  let instructions = ''
  try { instructions = region(content, 'instructions')?.text ?? '' } catch { /* Keep file editing available for damaged markers. */ }
  return { path: agentGuidancePath(), content, revision: revisionOf(content), instructions, settings, branch: branchSnapshot(content), capacityRetry: capacityRetrySettings(content) }
}

export function agentGuidanceSettings(): GuidanceSnapshot {
  return snapshot(fs.readFileSync(ensureAgentGuidance(), 'utf8'))
}

export function updateAgentGuidance(input: unknown): GuidanceSnapshot {
  const value = input as { key?: unknown; value?: unknown; revision?: unknown } | null
  if (!value || typeof value.key !== 'string' || (!['branch', 'instructions', 'capacityRetry'].includes(value.key) && !Object.hasOwn(guidanceOptions, value.key))) throw new GuidanceError('올바른 설정 항목을 선택하세요.')
  const key = value.key as GuidanceRegionKey
  if (typeof value.revision !== 'string') throw new GuidanceError('올바른 설정값을 선택하세요.')
  let text: string
  if (key === 'instructions') {
    if (typeof value.value !== 'string' || value.value.length > 8000 || /<!--\s*\/?mew:agent-setting:/.test(value.value)) throw new GuidanceError('추가 지침은 설정 구간 표시 없이 최대 8,000자로 입력하세요.')
    text = value.value.trim()
  } else if (key === 'capacityRetry') {
    const validationError = agentCapacityRetryValidationError(value.value)
    if (validationError) throw new GuidanceError(validationError)
    text = agentCapacityRetryMetadata(value.value as AgentCapacityRetrySettings)
  } else if (key === 'branch') {
    const validationError = branchGuidanceValidationError(value.value)
    if (validationError) throw new GuidanceError(validationError)
    text = branchGuidanceText(value.value as BranchGuidanceSettings)
  } else {
    const options = guidanceOptions[key] as Record<string, string>
    if (typeof value.value !== 'string' || !Object.hasOwn(options, value.value)) throw new GuidanceError('올바른 설정값을 선택하세요.')
    text = options[value.value]
  }
  const current = agentGuidanceSettings()
  if (current.revision !== value.revision) throw new GuidanceError('지침 파일이 변경되었습니다. 다시 불러온 뒤 설정을 변경하세요.', 409)
  // Validate every region before writing so damaged/nested markers never consume other instructions.
  const regions = regionKeys.map(k => region(current.content, k)).filter(r => r !== null).sort((a, b) => a.from - b.from)
  if (regions.some((r, i) => i > 0 && r.from < regions[i - 1].to)) throw new GuidanceError('설정 구간이 겹칩니다. 파일 보기에서 설정 표시를 확인하세요.', 409)
  const block = region(current.content, key), [start, end] = markers(key)
  const replacement = text ? `${start}\n${text}\n${end}` : ''
  const content = block
    ? current.content.slice(0, block.from) + replacement + current.content.slice(block.to)
    : replacement ? current.content + `${current.content.endsWith('\n\n') || !current.content ? '' : current.content.endsWith('\n') ? '\n' : '\n\n'}${replacement}\n` : current.content
  writeFileAtomic(agentGuidancePath(), content)
  return snapshot(content)
}
