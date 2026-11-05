import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

async function runtimePath(runtime, name, mode) {
  const value = runtime?.[name]
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`WPE requires runtime.${name} to be an absolute local path.`)
  }
  try {
    await access(value, mode)
  } catch (cause) {
    throw new Error(`WPE cannot access runtime.${name}: ${value}. Check the isolated runtime setup.`, { cause })
  }
  return value
}

/** Launch the Playwright-patched WPE build with its runtime-owned environment wrapper. */
export async function launchWpeEngine(runtime, profileDir) {
  const executablePath = await runtimePath(runtime, 'wpeExecutable', constants.X_OK)
  const modulePath = await runtimePath(runtime, 'wpePlaywright', constants.R_OK)
  if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) {
    throw new Error('WPE requires an absolute profile directory for this lab session.')
  }
  const imported = await import(pathToFileURL(modulePath).href)
  const webkit = imported.webkit ?? imported.default?.webkit
  if (!webkit?.launchPersistentContext) {
    throw new Error(`WPE Playwright module does not export webkit: ${modulePath}. Use a Playwright version matching the WPE bundle.`)
  }
  await mkdir(profileDir, { recursive: true })
  let context
  try {
    context = await webkit.launchPersistentContext(profileDir, {
      executablePath,
      headless: true,
      viewport: { width: 1280, height: 800 },
      timeout: 20_000,
    })
    const browser = context.browser()
    const page = context.pages()[0] ?? await context.newPage()
    let closing
    return {
      browser,
      context,
      page,
      canScreenshot: true,
      canPointer: true,
      screenshotType: 'png',
      note: 'WPE WebKit의 실제 화면입니다. 이 비교 세션의 로그인 상태는 다른 엔진과 공유하지 않습니다.',
      close() {
        closing ??= context.close()
        return closing
      },
    }
  } catch (cause) {
    await context?.close().catch(() => {})
    throw new Error(`WPE startup failed: ${cause instanceof Error ? cause.message : String(cause)}. Check the matching Playwright/WPE versions, shared libraries, and GIO TLS module in the runtime wrapper.`, { cause })
  }
}
