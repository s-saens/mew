import { chromium } from 'playwright-core'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'

export async function launchChromiumEngine(id, runtime, profileDir) {
  const executablePath = runtime[id]
  if (typeof executablePath !== 'string' || !isAbsolute(executablePath)) throw new Error(`${id} 실행 파일의 절대 경로가 필요합니다.`)
  await access(executablePath, constants.X_OK)
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    chromiumSandbox: true,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: false,
    args: ['--disable-dev-shm-usage'],
    timeout: 20000,
  })
  let closing
  return {
    browser: context.browser(), context, page: context.pages()[0] ?? await context.newPage(),
    canScreenshot: true, canPointer: true, screenshotType: 'png',
    note: '',
    close() { closing ??= context.close(); return closing },
  }
}
