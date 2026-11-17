import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TmuxManager } from '@mew/tmux-term/server'
import type { CommandButtonResult } from '../shared/command-button-result.ts'
import type { StoredAgentCommand } from './agent-commands.ts'
import { commandWithGitIdentity } from './command-git-identity.ts'
import { DATA_DIR, writeFileAtomic } from './dataDir.ts'
import { spawnSpecCommand } from './spawnSpecCommand.ts'

const runner = fileURLToPath(new URL('./agent-command-runner.ts', import.meta.url))
const SESSION = /^mewcmd-[a-f0-9]{16}$/

export class CommandButtonRunningError extends Error {}

/** One active run and its latest completed predecessor, scoped by the existing session identity. */
export class CommandButtonResultStore {
  private readonly starting = new Set<string>()
  private readonly manager: TmuxManager
  private readonly root: string

  constructor(manager: TmuxManager, root = path.join(DATA_DIR, 'command-button-results')) {
    this.manager = manager
    this.root = root
  }

  private directory(session: string, slot: 'current' | 'previous'): string {
    if (!SESSION.test(session)) throw new Error('Invalid command session')
    return path.join(this.root, session, slot)
  }

  private readRecord(directory: string): StoredAgentCommand | null {
    try { return JSON.parse(fs.readFileSync(path.join(directory, 'record.json'), 'utf8')) as StoredAgentCommand }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private async sessions() {
    try { return await this.manager.list() }
    catch (error) {
      // tmux can exit between its last session closing and a list request.
      if (!(error instanceof Error) || !error.message.includes('server exited unexpectedly')) throw error
      return this.manager.list()
    }
  }

  async start(session: string, command: string, cwd: string, owner: string): Promise<void> {
    const current = this.directory(session, 'current')
    const previous = this.directory(session, 'previous')
    if (this.starting.has(session)) throw new CommandButtonRunningError('명령이 이미 실행 중입니다')
    this.starting.add(session)
    try {
      const record = this.readRecord(current)
      if ((await this.sessions()).some(item => item.name === session)
        || record?.state === 'running' && Date.now() - record.startedAt < 10_000) {
        throw new CommandButtonRunningError('명령이 이미 실행 중입니다')
      }
      fs.mkdirSync(path.dirname(current), { recursive: true, mode: 0o700 })
      if (fs.existsSync(current)) {
        if (record) {
          fs.rmSync(previous, { recursive: true, force: true })
          fs.renameSync(current, previous)
        } else fs.rmSync(current, { recursive: true, force: true })
      }
      fs.mkdirSync(current, { mode: 0o700 })
      const next: StoredAgentCommand = {
        id: crypto.randomUUID(), tab: session, runtime: 'project-command', sessionId: session,
        cwd, command, owner, afterUserCount: 0, session, state: 'running', startedAt: Date.now(),
        finishedAt: null, exitCode: null,
      }
      writeFileAtomic(path.join(current, 'record.json'), JSON.stringify(next))
      try {
        const commandLine = spawnSpecCommand({ cmd: process.execPath, args: [runner, current] })
        await this.manager.startCommand(session, commandWithGitIdentity(commandLine, owner), cwd)
      } catch (error) {
        fs.rmSync(current, { recursive: true, force: true })
        if (fs.existsSync(previous)) fs.renameSync(previous, current)
        throw error
      }
    } finally {
      this.starting.delete(session)
    }
  }

  async result(session: string): Promise<CommandButtonResult | null> {
    const current = this.directory(session, 'current')
    const previous = this.directory(session, 'previous')
    let directory = current
    let record = this.readRecord(current)
    if (!record) { directory = previous; record = this.readRecord(previous) }
    if (!record) return null
    if (record.state === 'running' && !this.starting.has(session) && Date.now() - record.startedAt >= 10_000) {
      const observedId = record.id
      if (!(await this.sessions()).some(item => item.name === session)) {
        // The runner writes the final record before closing the session; re-read after the tmux check.
        record = this.readRecord(directory)
        if (record?.id === observedId && record.state === 'running' && !this.starting.has(session)) {
          record.state = 'interrupted'
          record.finishedAt = Date.now()
          writeFileAtomic(path.join(directory, 'record.json'), JSON.stringify(record))
        }
      }
    }
    if (!record) return null
    const state = record.state === 'queued' ? 'running' : record.state
    const result: CommandButtonResult = {
      command: record.command, state, exitCode: record.exitCode,
      ...(record.error ? { error: record.error } : {}),
      ...(record.previewTruncated ? { previewTruncated: true } : {}),
      ...(record.archived ? { archived: true } : {}),
    }
    if (state !== 'running') {
      const preview = path.join(directory, 'preview.txt')
      result.text = fs.existsSync(preview) ? fs.readFileSync(preview, 'utf8') : ''
      if (directory === current) fs.rmSync(previous, { recursive: true, force: true })
    }
    return result
  }

  archive(session: string): string | null {
    const current = this.directory(session, 'current')
    const record = this.readRecord(current)
    const directory = record ? current : this.directory(session, 'previous')
    return (record ?? this.readRecord(directory))?.archived ? path.join(directory, 'output.gz') : null
  }
}
