import fs from 'node:fs'
import path from 'node:path'
import { runSpeechProcess } from './speech-process.ts'
import { DATA_DIR } from './dataDir.ts'
import { speechInstallStatus, speechPython } from './speech-install.ts'
import { SpeechError, type StoredSpeechConfig } from './speech-settings.ts'

export const MAX_SPEECH_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
type LocalRunner = (python: string, args: string[], options: { signal: AbortSignal; maxBuffer: number; timeout: number }) => Promise<{ stdout: string }>
const run: LocalRunner = runSpeechProcess
const runner = `import json, sys
from faster_whisper import WhisperModel
model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", download_root=sys.argv[4])
segments, _ = model.transcribe(sys.argv[2], language=sys.argv[3] or None)
print(json.dumps({"text": "".join(segment.text for segment in segments).strip()}, ensure_ascii=False))`

async function readLimited(response: Response): Promise<string> {
  if (!response.body) throw new SpeechError('Speech service returned an empty response', 502)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new SpeechError('Speech service response is too large', 502) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)]) : AbortSignal.timeout(5 * 60_000)
}
function serviceUrl(config: StoredSpeechConfig): string {
  return `${config.baseUrl}${config.provider === 'openai' ? '/audio/transcriptions' : '/inference'}`
}
function headers(config: StoredSpeechConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
}

export function validateSpeechAudio(audio: Buffer): void {
  const invalid = () => new SpeechError('Audio must be a mono 16 kHz PCM16 WAV of at most 62 seconds')
  if (audio.length < 46 || audio.length > MAX_SPEECH_AUDIO_BYTES) throw invalid()
  const validContainer = audio.toString('ascii', 0, 4) === 'RIFF'
    && audio.toString('ascii', 8, 12) === 'WAVE'
    && audio.toString('ascii', 12, 16) === 'fmt '
    && audio.toString('ascii', 36, 40) === 'data'
  const validFormat = audio.readUInt32LE(16) === 16
    && audio.readUInt16LE(20) === 1
    && audio.readUInt16LE(22) === 1
    && audio.readUInt32LE(24) === 16_000
    && audio.readUInt32LE(28) === 32_000
    && audio.readUInt16LE(32) === 2
    && audio.readUInt16LE(34) === 16
  const dataLength = audio.length - 44
  const validLength = audio.readUInt32LE(4) === audio.length - 8
    && audio.readUInt32LE(40) === dataLength
    && dataLength % 2 === 0
    && dataLength <= 62 * 32_000
  if (!validContainer || !validFormat || !validLength) throw invalid()
}

export async function transcribeLocalSpeech(config: StoredSpeechConfig, audio: Buffer, signal?: AbortSignal, options: { root?: string; python?: string; execute?: LocalRunner; installed?: boolean } = {}): Promise<string> {
  validateSpeechAudio(audio)
  const root = options.root ?? DATA_DIR, python = options.python ?? speechPython, execute = options.execute ?? run
  const installed = options.installed ?? speechInstallStatus().installed
  if (!config.allowModelDownload) throw new SpeechError('Model download consent is required')
  if (!installed) throw new SpeechError('Install faster-whisper first')
  const tempRoot = path.join(root, 'speech', 'temp')
  fs.mkdirSync(tempRoot, { recursive: true, mode: 0o700 })
  const directory = fs.mkdtempSync(path.join(tempRoot, 'audio-'))
  const file = path.join(directory, 'audio.wav')
  const modelRoot = path.join(root, 'speech', 'faster-whisper', 'models')
  try {
    fs.mkdirSync(modelRoot, { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, audio, { mode: 0o600 })
    const result = await execute(python, ['-c', runner, config.model, file, config.language, modelRoot], { signal: requestSignal(signal), maxBuffer: MAX_RESPONSE_BYTES, timeout: 5 * 60_000 })
    const data: unknown = JSON.parse(result.stdout)
    if (!data || typeof data !== 'object' || typeof (data as { text?: unknown }).text !== 'string') throw new Error('Invalid transcription')
    return (data as { text: string }).text
  } catch { throw new SpeechError('Local transcription failed or was cancelled', 502) }
  finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

export async function transcribeSpeech(config: StoredSpeechConfig, audio: Buffer, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  validateSpeechAudio(audio)
  if (config.provider === 'faster-whisper') return transcribeLocalSpeech(config, audio, signal)
  const form = new FormData()
  form.append('file', new Blob([Uint8Array.from(audio)], { type: 'audio/wav' }), 'audio.wav')
  if (config.provider === 'openai') form.append('model', config.model)
  if (config.language || config.provider === 'whisper-cpp') form.append('language', config.language || 'auto')
  form.append('response_format', 'json')
  try {
    const response = await fetcher(serviceUrl(config), { method: 'POST', headers: headers(config), body: form, signal: requestSignal(signal), redirect: 'error' })
    if (!response.ok) throw new SpeechError(`Speech service returned HTTP ${response.status}`, 502)
    const result: unknown = JSON.parse(await readLimited(response))
    if (!result || typeof result !== 'object' || typeof (result as { text?: unknown }).text !== 'string') throw new SpeechError('Speech service returned an invalid response', 502)
    return (result as { text: string }).text
  } catch (error) {
    if (error instanceof SpeechError) throw error
    throw new SpeechError('Speech service request failed or was cancelled', 502)
  }
}

export async function testSpeechConnection(config: StoredSpeechConfig, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  if (config.provider === 'faster-whisper') return speechInstallStatus().installed ? { ok: true, message: 'Local runtime is installed. Model readiness is checked during transcription.' } : { ok: false, message: 'Local runtime is not installed.' }
  try {
    const response = await fetcher(config.baseUrl, { method: 'GET', headers: headers(config), redirect: 'error', signal: AbortSignal.timeout(10_000) })
    await response.body?.cancel()
    if (response.status === 401 || response.status === 403 || response.status >= 500) return { ok: false, message: `Speech service returned HTTP ${response.status}.` }
    return { ok: true, message: `Speech service responded (HTTP ${response.status}); transcription compatibility has not been verified.` }
  } catch { return { ok: false, message: 'Speech service could not be reached.' } }
}
