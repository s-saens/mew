import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { launchChromiumEngine } from './chromium-engine.mjs'
import { launchNativeEngine } from './native-engines.mjs'
import { launchWpeEngine } from './wpe-engine.mjs'
import { INITIAL_URL, navigationTarget } from './protocol.mjs'

export async function launchEngine(id, runtime, profileDir) {
  if (id === 'chrome' || id === 'shell') return launchChromiumEngine(id, runtime, profileDir)
  if (id === 'wpe') return launchWpeEngine(runtime, profileDir)
  return launchNativeEngine(id, runtime, profileDir)
}

function deadline(operation, milliseconds, message) {
  let timer
  return Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds)
  })]).finally(() => clearTimeout(timer))
}

export class BrowserSession extends EventEmitter {
  constructor({ id, runtime, initialUrl = INITIAL_URL, factory = launchEngine, viewerHosts = [] }) {
    super()
    this.id = id
    this.runtime = runtime
    this.viewerHosts = viewerHosts
    this.initialUrl = navigationTarget(initialUrl, viewerHosts)
    this.factory = factory
    this.width = 1280
    this.height = 800
    this.phase = 'idle'
    this.error = ''
    this.lastUrl = this.initialUrl
    this.title = ''
    this.viewed = false
    this.closing = false
    this.commands = Promise.resolve()
    this.pending = 0
    this.lastFrame = null
    this.lastHash = ''
    this.captureBlocked = false
    this.generation = 0
    this.pageOperations = Promise.resolve()
  }

  state() {
    return { type: 'state', phase: this.phase, url: this.lastUrl, title: this.title,
      width: this.width, height: this.height, error: this.error,
      canScreenshot: this.engine?.canScreenshot ?? this.id !== 'lightpanda',
      canPointer: this.engine?.canPointer ?? this.id !== 'lightpanda',
      note: this.engine?.note ?? (this.id === 'lightpanda' ? 'Lightpanda는 실제 웹 화면을 그리지 않습니다. 이 비교 화면에서는 페이지 텍스트만 확인할 수 있습니다.' : '') }
  }

  sendState() { this.emit('message', this.state()) }

  async ensureStarted() {
    if (this.starting) return this.starting
    if (this.engine) return
    if (this.closing) throw new Error('비교 브라우저가 종료 중입니다.')
    this.phase = 'starting'; this.error = ''; this.sendState()
    this.starting = (async () => {
      const profileDir = await mkdtemp(join(tmpdir(), `mew-browser-lab-${this.id}-`))
      this.profileDir = profileDir
      try {
        this.engine = await this.factory(this.id, this.runtime, profileDir)
        this.engine.page.setDefaultTimeout(5000)
        this.engine.page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}) })
        this.engine.page.on('crash', () => {
          this.phase = 'error'; this.error = '브라우저가 종료됐습니다. 세션 초기화를 눌러 다시 연결해 주세요.'; this.sendState()
        })
        await this.engine.page.setViewportSize({ width: this.width, height: this.height })
        this.phase = 'ready'; this.sendState()
        await this.navigate(this.lastUrl)
      } catch (error) {
        this.phase = 'error'; this.error = error.message; this.sendState()
        if (!this.engine) { await rm(profileDir, { recursive: true, force: true }); this.profileDir = undefined }
        throw error
      }
    })().finally(() => { this.starting = undefined })
    return this.starting
  }

  async navigate(url) {
    return this.pageOperation(async () => {
      this.generation++
      this.lastUrl = navigationTarget(url, this.viewerHosts)
      this.captureBlocked = false
      this.lastFrame = null; this.lastHash = ''
      this.phase = 'starting'; this.error = ''; this.sendState()
      try {
        await deadline(this.engine.page.goto(this.lastUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }), 22000, '페이지 이동 응답이 없습니다. 화면이 남아 있으면 직접 확인하거나 세션 초기화를 눌러 주세요.')
      } catch (error) {
        this.error = error.message
      }
      this.captureBlocked = false; this.phase = 'ready'; this.sendState()
    })
  }

  pageOperation(operation) {
    const task = this.pageOperations.catch(() => {}).then(operation)
    this.pageOperations = task
    return task
  }

  setViewed(viewed) {
    this.viewed = viewed
    if (viewed && !this.pumping && !this.closing) void this.pump()
  }

  async pump() {
    if (this.pumping || this.closing) return
    this.pumping = true
    try {
      await this.ensureStarted()
      while (this.viewed && !this.closing && !this.captureBlocked && this.engine) {
        const generation = this.generation
        try {
          await this.pageOperation(async () => {
          if (generation !== this.generation || !this.engine || this.closing) return
          const page = this.engine.page
          this.lastUrl = page.url() === 'about:blank' ? this.lastUrl : page.url()
          this.title = await deadline(page.title(), 5000, '페이지 정보 응답이 없습니다.')
          if (this.engine.canScreenshot) {
            const image = await deadline(page.screenshot({ type: this.engine.screenshotType || 'png', timeout: 8000 }), 10000, '화면을 읽지 못했습니다. 세션 초기화를 눌러 다시 연결해 주세요.')
            if (generation !== this.generation || this.closing) return
            const hash = createHash('sha256').update(image).digest('hex')
            if (hash !== this.lastHash) {
              this.lastHash = hash
              const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              this.lastFrame = { type: 'frame', mime: this.engine.screenshotType === 'jpeg' ? 'image/jpeg' : 'image/png', data: image.toString('base64'), width: png ? image.readUInt32BE(16) : this.width, height: png ? image.readUInt32BE(20) : this.height }
              this.emit('message', this.lastFrame)
            }
          } else {
            const content = await deadline(page.locator('body').textContent({ timeout: 3000 }), 5000, '페이지 텍스트를 읽지 못했습니다.')
            if (generation !== this.generation || this.closing) return
            this.emit('message', { type: 'text', content: (content || '').slice(0, 50000) })
          }
          this.sendState()
          })
        } catch (error) {
          const transient = /execution context was destroyed|cannot find context|navigation|detached frame/i.test(error.message)
          if (!transient && generation === this.generation && !this.closing) { this.error = error.message; this.phase = 'error'; this.captureBlocked = true; this.sendState() }
        }
        if (this.viewed && !this.closing && !this.captureBlocked) await new Promise(resolve => { this.frameTimer = setTimeout(resolve, 500); this.frameWake = resolve })
      }
    } catch { /* Startup errors are visible in state; only a user retry starts another browser. */ }
    finally { this.pumping = false }
  }

  enqueue(command) {
    if (this.pending >= 64) return Promise.reject(new Error('입력을 처리 중입니다. 잠시 기다려 주세요.'))
    this.pending++
    const task = this.commands.catch(() => {}).then(() => deadline(this.execute(command), ['navigate', 'restart'].includes(command.type) ? 50000 : 12000, '입력 응답이 없습니다. 세션 초기화를 눌러 다시 연결해 주세요.'))
    this.commands = task
    return task.finally(() => { this.pending-- })
  }

  async execute(command) {
    if (this.closing) return
    if (command.type === 'restart') {
      await this.starting?.catch(() => {})
      await this.release()
      this.phase = 'idle'; this.error = ''; this.captureBlocked = false; this.lastFrame = null; this.lastHash = ''
      await this.ensureStarted()
      if (this.viewed && !this.pumping) void this.pump()
      return
    }
    await this.ensureStarted()
    const page = this.engine.page
    if (command.type === 'navigate') { await this.navigate(command.url); if (this.viewed && !this.pumping) void this.pump(); return }
    if (command.type === 'resize') {
      await this.pageOperation(async () => {
        await deadline(page.setViewportSize({ width: command.width, height: command.height }), 5000, '화면 크기를 변경하지 못했습니다.')
        this.generation++; this.width = command.width; this.height = command.height
        this.lastHash = ''; this.lastFrame = null; this.sendState()
      })
      return
    }
    if (['back', 'forward', 'reload'].includes(command.type)) {
      const method = { back: 'goBack', forward: 'goForward', reload: 'reload' }[command.type]
      await this.pageOperation(async () => {
        this.generation++; this.lastHash = ''; this.captureBlocked = false
        await deadline(page[method]({ waitUntil: 'domcontentloaded', timeout: 15000 }), 17000, '페이지 이동 응답이 없습니다.')
      })
      if (this.viewed && !this.pumping) void this.pump()
      return
    }
    if (!this.engine.canPointer) throw new Error('이 엔진은 이 화면에서 좌표 기반 입력을 지원하지 않습니다.')
    if (command.type === 'pointer') {
      await page.mouse.move(command.x, command.y)
      if (command.action !== 'move') await page.mouse[command.action]({ button: command.button, clickCount: command.clickCount ?? 1 })
    } else if (command.type === 'wheel') {
      await page.mouse.move(command.x, command.y)
      await page.mouse.wheel(command.deltaX, command.deltaY)
    } else if (command.type === 'text') {
      await page.keyboard.insertText(command.text)
    } else if (command.type === 'key') {
      if (['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Process', 'Unidentified'].includes(command.key)) return
      if ([...command.key].length === 1 && !/^[\x20-\x7e]$/.test(command.key) && !command.ctrlKey && !command.altKey && !command.metaKey) await page.keyboard.insertText(command.key)
      else {
        const modifiers = [command.ctrlKey && 'Control', command.altKey && 'Alt', command.metaKey && 'Meta', command.shiftKey && 'Shift'].filter(Boolean)
        const key = command.key === ' ' ? 'Space' : command.key
        await page.keyboard.press([...modifiers, key].join('+'))
      }
    }
  }

  async release() {
    this.generation++
    this.captureBlocked = true
    clearTimeout(this.frameTimer); this.frameWake?.()
    if (this.engine) await this.engine.close().catch(() => {})
    this.engine = undefined
    if (this.profileDir) await rm(this.profileDir, { recursive: true, force: true })
    this.profileDir = undefined
  }

  async close() {
    if (this.closing) return
    this.closing = true; this.viewed = false
    await this.starting?.catch(() => {})
    await this.release()
    this.removeAllListeners()
  }
}
