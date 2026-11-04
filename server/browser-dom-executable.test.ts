import assert from 'node:assert/strict'
import fs, { type Stats } from 'node:fs'
import test, { type TestContext } from 'node:test'
import { domBrowserEngine, domBrowserExecutable, externalBrowserExecutable } from './browser-dom-executable.ts'

function discovery(t: TestContext, binaries: string[] = []) {
  const installed = new Set(binaries)
  t.mock.method(fs, 'statSync', (file: string) => {
    if (!installed.has(file)) throw new Error('fixture executable is unavailable')
    return { isFile: () => true } as Stats
  })
  t.mock.method(fs, 'accessSync', (file: string) => {
    if (!installed.has(file)) throw new Error('fixture executable is unavailable')
  })
  return { installed, options: { env: {}, platform: 'linux' as const, home: '/fixture/home', bundledExecutable: '/fixture/playwright/chrome' } }
}

test('localhost and UI automation prefer Playwright Chromium and never discover ordinary Chrome', t => {
  const { installed, options } = discovery(t, ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'])
  assert.equal(domBrowserExecutable(options), undefined)
  installed.add('/usr/bin/chromium-browser')
  assert.equal(domBrowserExecutable(options), '/usr/bin/chromium-browser')
  installed.add('/usr/bin/chromium')
  assert.equal(domBrowserExecutable(options), '/usr/bin/chromium')
  installed.add(options.bundledExecutable)
  assert.equal(domBrowserExecutable(options), options.bundledExecutable)
})

test('macOS automation discovers user and system Chromium without selecting Google Chrome', t => {
  const userChromium = '/fixture/home/Applications/Chromium.app/Contents/MacOS/Chromium'
  const systemChromium = '/Applications/Chromium.app/Contents/MacOS/Chromium'
  const { installed, options } = discovery(t, ['/fixture/home/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
  const mac = { ...options, platform: 'darwin' as const }
  assert.equal(domBrowserExecutable(mac), undefined)
  installed.add(systemChromium)
  assert.equal(domBrowserExecutable(mac), systemChromium)
  installed.add(userChromium)
  assert.equal(domBrowserExecutable(mac), userChromium)
  installed.add(options.bundledExecutable)
  assert.equal(domBrowserExecutable(mac), options.bundledExecutable)
})

test('external websites discover ordinary installed Linux Chrome without a bundled Chromium fallback', t => {
  const { installed, options } = discovery(t, ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/fixture/playwright/chrome'])
  assert.equal(externalBrowserExecutable(options), undefined)
  for (const executable of ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']) {
    installed.add(executable)
    assert.equal(externalBrowserExecutable(options), executable)
  }
})

test('macOS external browsing finds user Chrome before system Chrome and excludes Chromium', t => {
  const userChrome = '/fixture/home/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const { installed, options } = discovery(t, ['/fixture/home/Applications/Chromium.app/Contents/MacOS/Chromium', '/fixture/playwright/chrome'])
  const mac = { ...options, platform: 'darwin' as const }
  assert.equal(externalBrowserExecutable(mac), undefined)
  installed.add(systemChrome)
  assert.equal(externalBrowserExecutable(mac), systemChrome)
  installed.add(userChrome)
  assert.equal(externalBrowserExecutable(mac), userChrome)
})

test('dedicated executable overrides win over legacy settings and stay independent', t => {
  const { options } = discovery(t, ['/fixture/chromium', '/fixture/chrome', '/fixture/legacy'])
  const env = { MEW_CHROMIUM_EXECUTABLE: '/fixture/chromium', MEW_CHROME_EXECUTABLE: '/fixture/chrome', MEW_BROWSER_EXECUTABLE: '/fixture/legacy' }
  assert.equal(domBrowserExecutable({ ...options, env }), env.MEW_CHROMIUM_EXECUTABLE)
  assert.equal(externalBrowserExecutable({ ...options, env }), env.MEW_CHROME_EXECUTABLE)
  assert.equal(domBrowserExecutable({ ...options, env: { MEW_BROWSER_EXECUTABLE: env.MEW_BROWSER_EXECUTABLE } }), env.MEW_BROWSER_EXECUTABLE)
  assert.equal(externalBrowserExecutable({ ...options, env: { MEW_BROWSER_EXECUTABLE: env.MEW_BROWSER_EXECUTABLE } }), env.MEW_BROWSER_EXECUTABLE)
  assert.equal(domBrowserExecutable({ ...options, env: { MEW_CHROME_EXECUTABLE: env.MEW_CHROME_EXECUTABLE } }), undefined)
  assert.equal(externalBrowserExecutable({ ...options, env: { MEW_CHROMIUM_EXECUTABLE: env.MEW_CHROMIUM_EXECUTABLE } }), undefined)
})

test('invalid overrides fail with the selected setting name rather than silently falling back', t => {
  const { options } = discovery(t, ['/fixture/legacy'])
  for (const [resolve, key] of [[domBrowserExecutable, 'MEW_CHROMIUM_EXECUTABLE'], [externalBrowserExecutable, 'MEW_CHROME_EXECUTABLE']] as const) {
    for (const explicit of ['./browser', '/fixture/missing']) {
      assert.throws(() => resolve({ ...options, env: { [key]: explicit, MEW_BROWSER_EXECUTABLE: '/fixture/legacy' } }), new RegExp(key))
    }
    assert.throws(() => resolve({ ...options, env: { MEW_BROWSER_EXECUTABLE: './browser' } }), /MEW_BROWSER_EXECUTABLE/)
  }
})

test('executable discovery rejects directories and files without execute permission', t => {
  const { options } = discovery(t)
  t.mock.method(fs, 'statSync', () => ({ isFile: () => false }) as Stats)
  assert.equal(domBrowserExecutable(options), undefined)
  assert.equal(externalBrowserExecutable(options), undefined)
  t.mock.method(fs, 'statSync', () => ({ isFile: () => true }) as Stats)
  t.mock.method(fs, 'accessSync', () => { throw new Error('not executable') })
  assert.equal(domBrowserExecutable(options), undefined)
  assert.equal(externalBrowserExecutable(options), undefined)
})

test('loopback URL hosts choose Chromium after structural URL normalization', () => {
  for (const host of ['localhost', 'LOCALHOST.', 'app.localhost', 'deep.app.localhost.', '127.0.0.1', '127.255.255.255', '127.1', '2130706433', '0x7f000001', '[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]', '[::ffff:127.255.255.255]', '[::ffff:7f00:1]']) {
    assert.equal(domBrowserEngine(`http://${host}:8080/path`), 'chromium', host)
  }
})

test('external hosts and private LAN addresses choose Chrome without DNS resolution', () => {
  for (const host of ['example.com', 'localhost.example.com', 'example.localhost.evil', '127.example.com', '127.0.0.1.example.com', '192.168.1.10', '10.0.0.1', '172.16.0.1', '0.0.0.0', '126.255.255.255', '128.0.0.1', '[::]', '[::ffff:192.168.1.10]', '[::ffff:128.0.0.1]', '[fd00::1]']) {
    assert.equal(domBrowserEngine(`https://${host}/localhost/127.0.0.1`), 'chrome', host)
  }
  assert.equal(domBrowserEngine('http://localhost@example.com/'), 'chrome')
  assert.throws(() => domBrowserEngine('not an absolute URL'))
})
