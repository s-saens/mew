import { chromium, type Browser } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

/** Launch an isolated Chromium browser owned by the UI test. */
export async function connectTestBrowser({ env = process.env, timeout = 15_000 }: {
  env?: NodeJS.ProcessEnv
  timeout?: number
} = {}): Promise<Browser> {
  const executablePath = domBrowserExecutable({ env })
  if (!executablePath) {
    throw new Error('No Chromium executable is available for UI tests. Install Playwright Chromium or configure MEW_CHROMIUM_EXECUTABLE (MEW_BROWSER_EXECUTABLE remains supported for compatibility).')
  }
  try {
    return await chromium.launch({ executablePath, chromiumSandbox: true, headless: true, timeout })
  } catch (cause) {
    throw new Error('Cannot launch Chromium for UI tests. Check the Playwright Chromium installation and MEW_CHROMIUM_EXECUTABLE (or legacy MEW_BROWSER_EXECUTABLE).', { cause })
  }
}
