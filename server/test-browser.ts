import { chromium, type Browser } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

/** Launch an isolated Chromium browser owned by the UI test. */
export async function connectTestBrowser({ env = process.env, timeout = 15_000 }: {
  env?: NodeJS.ProcessEnv
  timeout?: number
} = {}): Promise<Browser> {
  const executablePath = domBrowserExecutable({ env })
  if (!executablePath) {
    throw new Error('No Chromium or Chrome executable is available for UI tests. Install Chrome/Chromium or configure MEW_BROWSER_EXECUTABLE.')
  }
  try {
    return await chromium.launch({ executablePath, chromiumSandbox: true, headless: true, timeout })
  } catch (cause) {
    throw new Error('Cannot launch Chromium for UI tests. Check the browser installation and MEW_BROWSER_EXECUTABLE.', { cause })
  }
}
