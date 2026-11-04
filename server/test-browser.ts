import { chromium, type Browser, type BrowserContext } from 'playwright-core'

/** UI tests attach to the operator's Obscura service; they never launch Chromium. */
export function testBrowserEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  const endpoint = env.MEW_TEST_BROWSER_CDP_URL ?? 'ws://127.0.0.1:9222'
  let url: URL
  try { url = new URL(endpoint) } catch { throw new Error('MEW_TEST_BROWSER_CDP_URL must be an absolute Obscura CDP URL.') }
  if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('MEW_TEST_BROWSER_CDP_URL must be an Obscura CDP URL without URL credentials or fragments.')
  }
  return endpoint
}

function testContexts(browser: Browser): Browser {
  const owned = new Set<BrowserContext>()
  let closing: Promise<void> | undefined
  const own = (context: BrowserContext) => {
    owned.add(context)
    context.once('close', () => owned.delete(context))
    return context
  }
  return new Proxy(browser, {
    get(target, key) {
      if (key === 'contexts') return () => [...owned]
      if (key === 'newContext') return async (options?: Parameters<Browser['newContext']>[0]) => own(await target.newContext(options))
      if (key === 'newPage') return async (options?: Parameters<Browser['newPage']>[0]) => {
        const page = await target.newPage(options)
        own(page.context())
        return page
      }
      if (key === 'close') return (options?: Parameters<Browser['close']>[0]) => {
        closing ??= (async () => {
          await Promise.allSettled([...owned].map(context => context.close()))
          await target.close(options)
        })()
        return closing
      }
      const value: unknown = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export async function connectTestBrowser({ env = process.env, timeout = 15_000 }: {
  env?: NodeJS.ProcessEnv
  timeout?: number
} = {}): Promise<Browser> {
  const endpoint = testBrowserEndpoint(env)
  try {
    return testContexts(await chromium.connectOverCDP(endpoint, { timeout }))
  } catch {
    throw new Error('Cannot connect to the Obscura UI-test browser. Start Obscura on loopback or configure MEW_TEST_BROWSER_CDP_URL. No Chromium fallback was used.')
  }
}
