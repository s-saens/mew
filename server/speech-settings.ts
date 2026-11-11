import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DATA_DIR, readJsonFile, writeFileAtomic } from './dataDir.ts'
import type { SpeechConfig, SpeechProvider } from '../shared/speech.ts'

export interface StoredSpeechConfig extends Omit<SpeechConfig, 'hasApiKey'> { apiKey: string }
export const DEFAULT_SPEECH_CONFIG: StoredSpeechConfig = { provider: 'faster-whisper', baseUrl: '', model: 'small', language: '', apiKey: '', allowModelDownload: false }
export const FASTER_WHISPER_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v1', 'large-v2', 'large-v3', 'large-v3-turbo', 'turbo'] as const

export class SpeechError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function configPath(account: string): string {
  if (!account) throw new SpeechError('Authentication required', 403)
  const digest = createHash('sha256').update(account.toLowerCase()).digest('hex')
  const directory = path.join(DATA_DIR, 'speech-accounts', digest)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  return path.join(directory, 'settings.json')
}

export function readSpeechConfig(account: string): StoredSpeechConfig {
  return readJsonFile<StoredSpeechConfig>(configPath(account)) ?? { ...DEFAULT_SPEECH_CONFIG }
}
export function publicSpeechConfig(config: StoredSpeechConfig): SpeechConfig {
  const { apiKey, ...rest } = config
  return { ...rest, hasApiKey: !!apiKey }
}
export function validateSpeechConfig(input: unknown, previous: StoredSpeechConfig = DEFAULT_SPEECH_CONFIG): StoredSpeechConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SpeechError('Invalid speech settings')
  const value = input as Record<string, unknown>
  const provider = value.provider
  if (provider !== 'openai' && provider !== 'whisper-cpp' && provider !== 'faster-whisper') throw new SpeechError('Unsupported speech provider')
  const stringField = (key: string, max: number) => {
    const item = value[key]
    if (typeof item !== 'string' || item.length > max || Array.from(item).some(char => { const code = char.charCodeAt(0); return code < 32 || code === 127 })) throw new SpeechError(`Invalid ${key}`)
    return item.trim()
  }
  const model = stringField('model', 256)
  const language = stringField('language', 35)
  let baseUrl = stringField('baseUrl', 2048)
  if (language && !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) throw new SpeechError('Invalid language')
  if (provider === 'faster-whisper' && !(FASTER_WHISPER_MODELS as readonly string[]).includes(model)) throw new SpeechError('Unsupported faster-whisper model')
  if (provider === 'openai' && !model) throw new SpeechError('Model is required')
  if (provider !== 'faster-whisper') {
    let url: URL
    try { url = new URL(baseUrl) } catch { throw new SpeechError('Invalid speech service URL') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new SpeechError('Invalid speech service URL')
    baseUrl = url.toString().replace(/\/+$/, '')
  }
  const apiKey = value.apiKey === undefined ? (provider === previous.provider && baseUrl === previous.baseUrl ? previous.apiKey : '') : stringField('apiKey', 4096)
  if (typeof value.allowModelDownload !== 'boolean') throw new SpeechError('Invalid download consent')
  return { provider: provider as SpeechProvider, baseUrl, model, language, apiKey, allowModelDownload: value.allowModelDownload }
}
export function writeSpeechConfig(account: string, input: unknown): SpeechConfig {
  const settings = validateSpeechConfig(input, readSpeechConfig(account))
  writeFileAtomic(configPath(account), JSON.stringify(settings))
  return publicSpeechConfig(settings)
}

export function speechConfigRevision(config: StoredSpeechConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

export function requireSpeechRevision(config: StoredSpeechConfig, revision: unknown): void {
  if (typeof revision !== 'string' || revision !== speechConfigRevision(config)) throw new SpeechError('Speech settings changed. Review the destination and retry.', 409)
}
