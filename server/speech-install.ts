import fs from 'node:fs'
import path from 'node:path'
import { execHostFile } from './platform/process.ts'
import { DATA_DIR } from './dataDir.ts'
import { SpeechError } from './speech-settings.ts'
import type { SpeechInstallStatus } from '../shared/speech.ts'

const packageVersion = 'faster-whisper==1.1.1'
type Executor = typeof execHostFile

export class SpeechInstaller {
  private venv: string
  private execute: Executor
  private state: Omit<SpeechInstallStatus, 'installed'> = { state: 'idle', output: '' }
  constructor(root = path.join(DATA_DIR, 'speech', 'faster-whisper'), execute: Executor = execHostFile) {
    this.venv = path.join(root, 'venv')
    this.execute = execute
  }
  get python(): string { return path.join(this.venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') }
  status(): SpeechInstallStatus {
    return { ...this.state, installed: fs.existsSync(this.python) && fs.existsSync(path.join(this.venv, '.mew-ready')) }
  }
  install(): SpeechInstallStatus {
    if (this.state.state === 'running') throw new SpeechError('Installation is already running', 409)
    if (this.status().installed) return this.status()
    this.state = { state: 'running', output: 'Preparing the Python environment.\n' }
    void this.prepare()
    return this.status()
  }
  private async prepare(): Promise<void> {
    try {
      fs.mkdirSync(path.dirname(this.venv), { recursive: true, mode: 0o700 })
      fs.rmSync(path.join(this.venv, '.mew-ready'), { force: true })
      await this.execute(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', this.venv], { timeout: 120_000, maxBuffer: 1024 * 1024 })
      this.state.output += `Installing ${packageVersion}.\n`
      await this.execute(this.python, ['-m', 'pip', 'install', packageVersion], { timeout: 20 * 60_000, maxBuffer: 4 * 1024 * 1024 })
      await this.execute(this.python, ['-c', 'import faster_whisper'], { timeout: 30_000, maxBuffer: 1024 * 1024 })
      fs.writeFileSync(path.join(this.venv, '.mew-ready'), packageVersion, { mode: 0o600 })
      this.state = { state: 'succeeded', output: this.state.output + 'Installation completed.\n' }
    } catch {
      this.state = { state: 'failed', output: this.state.output + 'Installation failed. Check Python 3.9 or newer, venv, pip, and network access, then retry.\n' }
    }
  }
}
const installer = new SpeechInstaller()
export const speechPython = installer.python
export function speechInstallStatus(): SpeechInstallStatus { return installer.status() }
export function installSpeechRuntime(): SpeechInstallStatus { return installer.install() }
