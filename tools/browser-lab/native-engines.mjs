import { spawn } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createServer } from 'node:net'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const STARTUP_TIMEOUT = 20_000
const LOG_LIMIT = 8_192

function launchArguments(id, port, profileDir) {
  const address = ['serve', '--host', '127.0.0.1', '--port', String(port)]
  switch (id) {
    case 'moli':
      return [...address, '--layout', '--resource', '--profile-dir', profileDir, '--log-level', 'error']
    case 'obscura':
      return [...address, '--allow-private-network', '--storage-dir', profileDir, '--quiet']
    case 'lightpanda':
      return [...address, '--load-resources', 'iframe', '--load-resources', 'image',
        '--load-resources', 'stylesheet', '--load-resources', 'worker', '--log-level', 'error']
    default:
      throw new Error(`Unsupported native browser: ${id}`)
  }
}

async function reservePort() {
  const socket = createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const port = socket.address().port
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}

async function bounded(operation, milliseconds, message) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function ownedProcess(child) {
  let ended = false
  let failure
  let startupOutput = Buffer.alloc(0)
  let capturing = true
  let finish
  const done = new Promise(resolve => { finish = resolve })
  const capture = chunk => {
    if (capturing) startupOutput = Buffer.concat([startupOutput, Buffer.from(chunk)]).subarray(-LOG_LIMIT)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.once('error', error => {
    failure = error
    ended = true
    finish()
  })
  child.once('exit', (code, signal) => {
    failure ??= new Error(`Native browser exited (${signal || code})`)
    ended = true
    finish()
  })
  const signal = name => {
    if (!child.pid || (ended && process.platform === 'win32')) return
    try {
      if (process.platform === 'win32') child.kill(name)
      else process.kill(-child.pid, name)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  return {
    check() {
      if (ended) {
        const optionFailure = /unexpected argument|unrecognized|unknown option/i.test(startupOutput.toString())
        throw new Error(optionFailure ? 'Native browser does not support the launch options' : failure?.message || 'Native browser exited')
      }
    },
    discardStartupOutput() {
      capturing = false
      startupOutput = Buffer.alloc(0)
    },
    async stop() {
      capturing = false
      startupOutput = Buffer.alloc(0)
      signal('SIGTERM')
      if (!ended) {
        try { await bounded(done, 750, 'Native browser shutdown timeout') } catch {
          signal('SIGKILL')
          await bounded(done, 1_000, 'Native browser did not exit after SIGKILL')
        }
      }
    },
  }
}

async function waitForEndpoint(endpoint, owner, deadline) {
  while (Date.now() < deadline) {
    owner.check()
    try {
      const response = await fetch(`${endpoint}/json/version`, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(500, deadline - Date.now()))),
      })
      if (response.ok) {
        const version = await response.json()
        if (typeof version.webSocketDebuggerUrl === 'string') return
      }
    } catch { /* The owned browser may still be initializing its CDP listener. */ }
    await delay(Math.max(1, Math.min(100, deadline - Date.now())))
  }
  throw new Error('Native browser CDP startup timed out after 20 seconds')
}

export async function launchNativeEngine(id, runtime, profileDir) {
  if (!['moli', 'obscura', 'lightpanda'].includes(id)) throw new Error(`Unsupported native browser: ${id}`)
  const binary = runtime?.[id]
  if (typeof binary !== 'string' || !isAbsolute(binary)) throw new Error(`${id} requires an absolute executable path`)
  if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) throw new Error('Native browser profile directory must be absolute')
  if (runtime.playwrightPath && !isAbsolute(runtime.playwrightPath)) throw new Error('Playwright module path must be absolute')
  await access(binary, constants.X_OK)
  await mkdir(profileDir, { recursive: true, mode: 0o700 })
  const { chromium } = runtime.playwrightPath
    ? await import(pathToFileURL(runtime.playwrightPath).href)
    : await import('playwright-core')
  const port = await reservePort()
  const endpoint = `http://127.0.0.1:${port}`
  const deadline = Date.now() + STARTUP_TIMEOUT
  const child = spawn(binary, launchArguments(id, port, profileDir), {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })
  const owner = ownedProcess(child)
  let browser
  let closing
  const close = () => {
    closing ??= (async () => {
      try {
        if (browser) await bounded(browser.close(), 1_000, 'Native browser CDP disconnect timeout')
      } catch { /* Terminating the owned process also releases its CDP connection. */ }
      finally { await owner.stop() }
    })()
    return closing
  }
  try {
    await waitForEndpoint(endpoint, owner, deadline)
    browser = await chromium.connectOverCDP(endpoint, { timeout: Math.max(1, deadline - Date.now()) })
    owner.check()
    const context = browser.contexts()[0] || await bounded(browser.newContext(), Math.max(1, deadline - Date.now()), 'Native browser context startup timed out')
    const existingPage = id === 'lightpanda' ? undefined : context.pages()[0]
    const page = existingPage || await bounded(context.newPage(), Math.max(1, deadline - Date.now()), 'Native browser page startup timed out')
    owner.discardStartupOutput()
    const visual = id !== 'lightpanda'
    return {
      browser, context, page, close,
      canScreenshot: visual,
      canPointer: visual,
      screenshotType: visual ? 'png' : null,
      note: id === 'lightpanda'
        ? '이 비교에서는 DOM 텍스트만 제공합니다. 화면 캡처와 좌표 입력을 지원하지 않습니다.'
        : id === 'moli'
          ? '실제 화면을 필요할 때 렌더링합니다. 변경 직후 요소 위치와 표시 상태는 Chromium과 다를 수 있습니다.'
          : '독립 렌더러를 사용합니다. 일부 CSS, 편집기, 미디어 동작은 Chromium과 다를 수 있습니다.',
    }
  } catch (error) {
    await close().catch(() => {})
    throw error
  }
}
