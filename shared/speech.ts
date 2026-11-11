export type SpeechProvider = 'openai' | 'whisper-cpp' | 'faster-whisper'

export interface SpeechConfig {
  provider: SpeechProvider
  baseUrl: string
  model: string
  language: string
  hasApiKey: boolean
  allowModelDownload: boolean
}

export interface SpeechInstallStatus {
  state: 'idle' | 'running' | 'succeeded' | 'failed'
  output: string
  installed: boolean
}

export interface SpeechStatus {
  config: SpeechConfig
  revision: string
  canManage: boolean
  canInstall: boolean
  install: SpeechInstallStatus
}
