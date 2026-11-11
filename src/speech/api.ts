import { mewFetch } from '../utils/remote-transport'
import type { SpeechConfig, SpeechInstallStatus, SpeechProvider, SpeechStatus } from '../../shared/speech'

export type { SpeechConfig, SpeechProvider }
export type SpeechInstall = SpeechInstallStatus

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await mewFetch(url, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${response.status}`)
  return data as T
}

export function fetchSpeech(signal?: AbortSignal) { return json<SpeechStatus>('/api/speech', { signal }) }
export function saveSpeech(config: Omit<SpeechConfig, 'hasApiKey'> & { apiKey?: string }) {
  return json<{ config: SpeechConfig }>('/api/speech/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
}
export function testSpeech() { return json<{ ok: boolean; message: string }>('/api/speech/test', { method: 'POST' }) }
export function installSpeech() { return json<{ install: SpeechInstall }>('/api/speech/install', { method: 'POST' }) }
export function transcribeSpeech(audio: Blob, revision: string, signal: AbortSignal) {
  const body = new FormData()
  body.append('audio', audio, 'recording.wav')
  body.append('revision', revision)
  return json<{ text: string }>('/api/speech/transcribe', { method: 'POST', body, signal })
}
