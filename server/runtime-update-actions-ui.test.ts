import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('runtime updates load independently and run only the matching available update', { timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {useRuntimeUpdates, RuntimeUpdateAction} from '${root}/src/components/runtime-update-actions.tsx';
import {setUiLocale} from '@mew/ui/i18n-core'; setUiLocale('ko');
function App(){const [active,setActive]=React.useState(false);const updates=useRuntimeUpdates(active);return <><button onClick={()=>setActive(true)}>open</button><div>picker ready</div>{active && ['codex','kimi','cursor'].map(id=><div key={id} data-id={id}><RuntimeUpdateAction runtimeId={id} updates={updates}/></div>)}</>};createRoot(document.getElementById('root')).render(<App/>);`
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:fixture.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:fixture.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let reads = 0
    const requests: string[][] = []
    const item = (id: string, available: boolean, canUpdate = available) => ({ id, label: id, category: 'agent', current: '1.0.0', latest: available ? '2.0.0' : '1.0.0', available, canUpdate, error: null })
    const status = { items: [item('cli:codex', true), item('agent:kimi', false), item('agent:cursor', true, false)], checkedAt: 1, job: { running: false, items: [] } }
    await page.route('http://mew.test/**', async route => {
      const url = route.request().url()
      if (url.includes('/api/updates/status')) { reads++; await gate; return route.fulfill({ json: status }) }
      if (url.includes('/api/updates/run')) { requests.push(route.request().postDataJSON().ids); return route.fulfill({ status: 409, json: { error: 'agent is running' } }) }
      return route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>${chunk.code}</script>` })
    })
    await page.goto('http://mew.test/')
    assert.equal(reads, 0)
    await page.getByText('open').click()
    await page.getByText('picker ready').waitFor()
    assert.equal(await page.locator('[data-id] button').count(), 0)
    release()
    await page.locator('[data-id="codex"] button').waitFor({ timeout: 5000 }).catch(async error => { throw new Error(`${error} reads=${reads} html=${await page.locator('body').innerHTML()}`) })
    assert.equal(await page.locator('[data-id="kimi"] button, [data-id="cursor"] button').count(), 0)
    await page.locator('[data-id="codex"] button').click()
    await page.getByRole('alert').waitFor()
    assert.deepEqual(requests, [['cli:codex']])
  } finally { await browser.close() }
})
