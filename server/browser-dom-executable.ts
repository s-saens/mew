import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

function isExecutable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch { return false }
}

type BrowserExecutableOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  home?: string
  bundledExecutable?: string
}

function explicitExecutable(env: NodeJS.ProcessEnv, keys: string[], browser: string): string | undefined {
  for (const key of keys) {
    const explicit = env[key]
    if (!explicit) continue
    if (!path.isAbsolute(explicit) || !isExecutable(explicit)) {
      throw new Error(`서버 ${browser} 실행 설정 ${key}에는 실행 가능한 파일의 절대 경로가 필요합니다. macOS에서는 .app 폴더 안의 Contents/MacOS 실행 파일을 지정해 주세요.`)
    }
    return explicit
  }
}

/** Resolve Chromium for localhost apps and automated UI tests. */
export function domBrowserExecutable({
  env = process.env, platform = process.platform, home = os.homedir(), bundledExecutable = chromium.executablePath(),
}: BrowserExecutableOptions = {}): string | undefined {
  const explicit = explicitExecutable(env, ['MEW_CHROMIUM_EXECUTABLE', 'MEW_BROWSER_EXECUTABLE'], 'Chromium')
  if (explicit) return explicit
  const system = platform === 'darwin'
    ? [path.join(home, 'Applications/Chromium.app/Contents/MacOS/Chromium'), '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/chromium', '/usr/bin/chromium-browser']
  // Playwright chooses the bundled executable for the host OS and architecture.
  // Keep that tested binary first; launching app bundle internals needs no shell/open -a.
  return [bundledExecutable, ...system].find(isExecutable)
}

/** Resolve ordinary installed Google Chrome for login and external websites. */
export function externalBrowserExecutable({
  env = process.env, platform = process.platform, home = os.homedir(),
}: BrowserExecutableOptions = {}): string | undefined {
  const explicit = explicitExecutable(env, ['MEW_CHROME_EXECUTABLE', 'MEW_BROWSER_EXECUTABLE'], 'Chrome')
  if (explicit) return explicit
  const system = platform === 'darwin'
    ? [path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']
  return system.find(isExecutable)
}

/** Select the engine by URL host without resolving DNS. */
export function domBrowserEngine(raw: string): 'chromium' | 'chrome' {
  const hostname = new URL(raw).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '::1' || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(hostname)
    ? 'chromium'
    : 'chrome'
}
