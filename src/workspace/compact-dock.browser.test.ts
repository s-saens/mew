import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { connectTestBrowser } from '../../server/test-browser.ts'

test('compact dock buttons fill adjacent slots and scroll when narrow', async t => {
  const css = await Promise.all(['../index.css', './workspace-compact.css'].map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await page.setContent(`<style>${css.join('\n')}</style><div data-workspace-presentation="compact" style="width:600px"><nav class="mobile-dock" data-position="bottom">${Array.from({ length: 8 }, (_, i) => `<button ${i === 2 ? 'aria-current="true"' : ''}>${i}</button>`).join('')}</nav></div>`)
  const dock = page.locator('.mobile-dock')
  const slots = () => dock.locator('button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: rect.width }
  }))
  const wide = await slots()
  assert.ok(wide[2].width > 32, 'selected slot grows with the available width')
  for (let i = 1; i < wide.length; i++) assert.ok(Math.abs(wide[i].left - wide[i - 1].right) < 0.1, 'slots touch')
  await page.locator('[data-workspace-presentation]').evaluate(element => { (element as HTMLElement).style.width = '160px' })
  const narrow = await slots()
  assert.ok(narrow.every(slot => slot.width >= 32), 'slots retain their minimum width')
  assert.ok(await dock.evaluate(element => element.scrollWidth > element.clientWidth), 'narrow dock scrolls')
})
