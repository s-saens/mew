import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { launchWpeEngine } from './wpe-engine.mjs'

test('WPE reports a missing isolated executable before starting a browser', async () => {
  await assert.rejects(
    launchWpeEngine({ wpeExecutable: '/nonexistent/mew-browser-lab/wpe' }, '/tmp/mew-browser-lab-unused'),
    /cannot access runtime\.wpeExecutable/,
  )
})

const executable = process.env.MEW_LAB_WPE_TEST_EXECUTABLE
const playwright = process.env.MEW_LAB_WPE_TEST_PLAYWRIGHT

test('WPE renders, accepts input, captures pixels, and navigates over HTTPS', {
  skip: !executable || !playwright,
  timeout: 60_000,
}, async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'mew-lab-wpe-test-'))
  let engine
  try {
    engine = await launchWpeEngine({ wpeExecutable: executable, wpePlaywright: playwright }, profileDir)
    await engine.page.setContent('<label>Name<input aria-label="Name"></label><button onclick="this.textContent=document.querySelector(\'input\').value">Save</button>')
    await engine.page.getByLabel('Name').fill('WPE input works')
    await engine.page.getByRole('button', { name: 'Save' }).click()
    assert.equal(await engine.page.getByRole('button').textContent(), 'WPE input works')
    const rect = await engine.page.getByRole('button').boundingBox()
    assert.ok(rect && rect.width > 0 && rect.height > 0)
    const image = await engine.page.screenshot({ type: engine.screenshotType })
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const response = await engine.page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 25_000 })
    assert.equal(response.status(), 200)
    assert.equal(await engine.page.title(), 'Example Domain')
    await engine.close()
    await engine.close()
    assert.equal(engine.browser.isConnected(), false)
  } finally {
    await engine?.close()
    await rm(profileDir, { recursive: true, force: true })
  }
})
