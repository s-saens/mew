import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('tab bar focus border stays above its contents without blocking interaction', async () => {
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([])
  const browser = await connectTestBrowser()
  try {
    for (const width of [1100, 390]) for (const dark of [true, false]) {
      const page = await browser.newPage({ viewport: { width, height: 300 } })
      await page.setContent(`<html class="${dark ? 'dark' : ''}"><style>${css}</style><button id="outside">Outside</button><div data-agent-tab-bar tabindex="-1" style="display:flex;width:300px;height:36px"><button id="handle" style="width:25px;background:red">Handle</button><button id="tab" style="position:relative;background:blue">Tab</button></div></html>`)
      const bar = page.locator('[data-agent-tab-bar]')
      await bar.focus()
      assert.deepEqual(await bar.evaluate(el => {
        const ring = el.ownerDocument.defaultView!.getComputedStyle(el, '::after')
        return { content: ring.content, position: ring.position, inset: ring.inset, zIndex: ring.zIndex, border: ring.borderTopWidth, pointerEvents: ring.pointerEvents }
      }), { content: '""', position: 'absolute', inset: '0px', zIndex: '10', border: '2px', pointerEvents: 'none' })
      await page.locator('#handle').click({ position: { x: 1, y: 1 } })
      assert.equal(await page.locator('#handle').evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.equal(await bar.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el, '::after').content), 'none')
      await bar.focus()
      await page.locator('#tab').click({ position: { x: 1, y: 1 } })
      assert.equal(await page.locator('#tab').evaluate(el => el === el.ownerDocument.activeElement), true)
      await page.close()
    }
  } finally { await browser.close() }
})
