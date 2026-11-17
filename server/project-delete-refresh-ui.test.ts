import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('confirmed project deletion immediately refreshes the open selector and preserves it on failure', { timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
createRoot(document.getElementById('root')).render(<I18nProvider><ProjectSwitcher paths={['/keep']} activePath="/keep" fallbackLabel="keep" canOpen canChangeIcon canDelete icons={{}} onActivate={()=>{}} onIconChange={()=>{}} onOpen={()=>{}} onReorder={()=>{}} onRemove={()=>{}} onDelete={async (path,onDeleted)=>{const response=await fetch('/fixture/delete',{method:'POST',body:path});if(!response.ok)throw new Error('Delete failed');onDeleted();await fetch('/fixture/reconcile')}}/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:fixture.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:fixture.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  let resume!: () => void
  const gate = new Promise<void>(resolve => { resume = resolve })
  let finishReconcile!: () => void
  const reconcileGate = new Promise<void>(resolve => { finishReconcile = resolve })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, locale: 'ko-KR' })
    const projects = ['/keep', '/gone', '/gone/child', '/gone-again'].map(value => ({ path: value, name: value.split('/').pop(), icon: null, mine: value === '/keep', managed: false }))
    let failDelete = true, removed = false
    await page.route('http://mew-delete.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: chunk.code })
      if (pathname === '/api/project-registry') {
        if (removed) await gate
        return route.fulfill({ json: { projects: removed ? projects.filter(item => item.path !== '/gone' && item.path !== '/gone/child') : projects } }).catch(() => {})
      }
      if (pathname === '/fixture/reconcile') { await reconcileGate; return route.fulfill({ json: { ok: true } }).catch(() => {}) }
      if (pathname === '/fixture/delete') {
        if (failDelete) return route.fulfill({ status: 500, body: 'failed' })
        removed = true
        return route.fulfill({ json: { ok: true } })
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://mew-delete.test/')
    await page.locator('[data-project-switcher]').click()
    const row = (name: string) => page.locator(`[data-catalog-project="${name}"]`)
    await row('/gone').waitFor()
    await row('/gone').getByRole('button', { name: 'gone · +' }).click()
    await row('/gone/child').waitFor()
    await row('/gone').locator('.mew-project-catalog-open').click({ button: 'right' })
    await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
    await page.getByRole('menuitem', { name: '완전히 삭제하기', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '프로젝트를 완전히 삭제할까요?' })
    await dialog.getByRole('button', { name: '완전히 삭제하기' }).click()
    await dialog.getByRole('alert').waitFor()
    assert.equal(await row('/gone').count(), 1, 'failure must not remove a project')
    assert.equal(await row('/gone/child').count(), 1)
    failDelete = false
    await dialog.getByRole('button', { name: '완전히 삭제하기' }).click()
    await row('/gone').waitFor({ state: 'detached', timeout: 3000 })
    assert.equal(await dialog.isVisible(), true, 'the row disappears before workspace reconciliation finishes')
    assert.equal(await row('/gone/child').count(), 0, 'descendants disappear before the refresh completes')
    assert.equal(await row('/gone-again').count(), 1, 'a similarly named sibling remains')
    assert.equal(await row('/keep').count(), 1, 'other projects remain')
    finishReconcile()
    await dialog.waitFor({ state: 'detached' })
    resume()
    await page.close()
  } finally { resume(); finishReconcile(); await browser.close() }
})
