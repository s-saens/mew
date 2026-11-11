import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

async function fixtureBundle() {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {ProjectActions} from '${root}/src/components/ProjectActions.tsx';
import {WorkspaceApiProvider} from '${root}/src/api/workspace-api-context.tsx';
import {createWorkspaceClient} from '${root}/src/api/client.ts';
import {BrowserContext} from '${root}/src/workspace/workspace-browser-context.ts';
import {ProjectSetupContext} from '${root}/src/workspace/project-setup-context.ts';
import {configureAppRuntime} from '${root}/src/runtime/app-runtime.ts';
localStorage.setItem('mew:locale','en');window.previews=[];window.setups=[];window.downloads=[];
HTMLAnchorElement.prototype.click=function(){window.downloads.push({href:this.href,name:this.download})};
configureAppRuntime({transport:{fetch:(...args)=>fetch(...args),socket:()=>{throw Error('Unexpected socket')},close(){}},resourceUrl:url=>url,prepareResourceUrl:async url=>url,releaseResourceUrl(){}});
const client=createWorkspaceClient({workspacePath:'/fixture/project',projectPath:'/fixture/project'});
createRoot(document.getElementById('root')).render(<I18nProvider><WorkspaceApiProvider client={client}><BrowserContext.Provider value={location.search.includes('browser=off')?null:url=>window.previews.push(url)}><ProjectSetupContext.Provider value={request=>window.setups.push(request)}><ProjectActions project=".workspace" directory="apps/mobile" workspacePath="/fixture/project"/></ProjectSetupContext.Provider></BrowserContext.Provider></WorkspaceApiProvider></I18nProvider>);`
  const bundle = await build({ input: 'virtual:release.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:release.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:release.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const files = (await fs.readdir(path.join(root, 'src/components'))).filter(file => /^ProjectRelease.*\.tsx$/.test(file)).map(file => `src/components/${file}`)
  files.push('src/components/ProjectActions.tsx', 'src/components/ProjectActionsResults.tsx', 'src/components/ProjectActionsEditor.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/select-field.tsx')
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  return { code: bundle.output.find(item => item.type === 'chunk')!.code, css: compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) }
}

test('release dashboard makes results and publication discoverable and reviews real destinations before execution', { timeout: 120_000 }, async t => {
  const { code, css } = await fixtureBundle()
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 820 }, hasTouch: width === 320 })
    page.setDefaultTimeout(8_000)
    const errors: string[] = [], requests: { pathname: string; body?: Record<string, unknown>; url: URL }[] = []
    page.on('pageerror', error => errors.push(error.message))
    const buildAction = { id: 'build', name: 'Build website', kind: 'build', variant: 'release', command: 'npm run build' }
    const actionRun = { id: 'result-1', actionId: 'build', name: 'Build website', kind: 'build', status: 'succeeded', startedAt: '2026-01-01T10:00:00.000Z', finishedAt: '2026-01-01T10:01:00.000Z', output: 'Done', previewUrl: 'https://preview.example.com', artifacts: [{ path: 'dist/site.apk', name: 'site.apk', size: 1024 }] }
    const connection = { id: 'cloud', provider: 'cloudflare-pages', label: 'Public website', connected: true, config: { provider: 'cloudflare-pages', label: 'Public website', accountId: 'account', projectName: 'my-site', branch: 'main' } }
    let connections: unknown[] = [connection]
    let pipelines: Record<string, unknown>[] = [
      { id: 'preview', name: 'Website preview', purpose: 'preview', steps: [{ id: 'make', name: 'Make website', type: 'action', actionId: 'build' }] },
      { id: 'publish', name: 'Public website', purpose: 'publish', steps: [{ id: 'check', name: 'Make website', type: 'action', actionId: 'build' }, { id: 'upload', name: 'Publish website', type: 'provider', connectionId: 'cloud' }] },
    ]
    let runs: Record<string, unknown>[] = [{ id: 'preview-run', pipelineId: 'preview', purpose: 'preview', name: 'Website preview', status: 'succeeded', startedAt: '2026-01-01T10:00:00.000Z', finishedAt: '2026-01-01T10:01:00.000Z', steps: [{ ...((pipelines[0].steps as Record<string, unknown>[])[0]), status: 'succeeded', actionRun }] }]
    let failConnection = false
    const state = () => ({ projectRoot: '/fixture/project/apps/mobile', pipelines, runs, warnings: [], needsAgent: false, readiness: Object.fromEntries(pipelines.map(item => [item.id, { ready: true, issues: [], revision: 'reviewed-target-v1' }])) })
    await page.route('http://mew-release.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) {
        const body = request.method() === 'GET' ? undefined : request.postData() ? request.postDataJSON() : undefined
        requests.push({ pathname: url.pathname, body, url })
        if (url.pathname === '/api/project-actions') return route.fulfill({ json: { projectRoot: '/fixture/project/apps/mobile', actions: [buildAction], runs: [actionRun], warnings: [], needsAgent: false } })
        if (url.pathname === '/api/project-pipelines/run') {
          assert.equal(body.id, 'publish')
          assert.equal(body.expectedRevision, 'reviewed-target-v1')
          runs = [{ id: 'publish-run', pipelineId: 'publish', purpose: 'publish', name: 'Public website', status: 'running', startedAt: new Date().toISOString(), steps: (pipelines[1].steps as Record<string, unknown>[]).map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending' })) }, ...runs]
          return route.fulfill({ json: { run: runs[0] } })
        }
        if (url.pathname === '/api/project-pipelines' && request.method() === 'PUT') pipelines = body.pipelines
        if (url.pathname.startsWith('/api/project-pipelines')) return route.fulfill({ json: state() })
        if (url.pathname === '/api/release-providers/connection' && request.method() === 'PUT') {
          if (failConnection) { failConnection = false; return route.fulfill({ status: 500, json: { error: 'Could not save this destination' } }) }
          connections = [{ id: body.id ?? 'new-connection', provider: body.config.provider, label: body.config.label, config: body.config, connected: true }]
        }
        if (url.pathname.startsWith('/api/release-providers')) return route.fulfill({ json: { connections, runs: [] } })
        return route.fulfill({ json: {} })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>${css}
      :root{--color-surface:${dark ? '#171a24' : '#fff'};--color-surface-solid:var(--color-surface);--color-surface-raised:${dark ? '#252939' : '#f4f5f8'};--color-surface-raised-solid:var(--color-surface-raised);--color-surface-hover:${dark ? '#30394b' : '#e3e8ef'};--color-surface-hover-solid:var(--color-surface-hover);--color-ink:${dark ? '#f4f4f6' : '#202128'};--color-ink-secondary:${dark ? '#bbc0cd' : '#5b6170'};--color-accent:#6585d9;--color-accent-strong:#466ac5;--color-ink-on-accent:#fff;--color-edge:#707789;--color-edge-strong:#707789;--color-edge-bright:#707789;--color-success-ink:${dark ? '#9bd6a8' : '#236732'};--color-danger-strong:${dark ? '#ffacac' : '#a31616'}}body{margin:0;padding:8px;font:14px sans-serif;background:var(--color-surface);color:var(--color-ink)}*{box-sizing:border-box}</style><div id="root"></div><script>${code}</script></html>` })
    })
    await page.goto('http://mew-release.test/')
    await page.getByRole('button', { name: 'Results & release', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Results & release', exact: true })
    await dialog.getByRole('button', { name: 'View result', exact: true }).waitFor()
    assert.equal(await dialog.getByText('npm run build', { exact: true }).count(), 0)
    assert.equal(await dialog.getByLabel('Access token', { exact: true }).count(), 0)
    await dialog.getByRole('button', { name: 'View result', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { previews: string[] }).previews), ['https://preview.example.com'])
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Ready to publish?', exact: true })
    await review.getByText('my-site', { exact: false }).waitFor()
    await review.getByText('main', { exact: false }).waitFor()
    await review.getByText('The service uses the version already in its connected repository. Changes on this computer are not uploaded automatically.', { exact: true }).waitFor()
    assert.equal(requests.filter(item => item.pathname.endsWith('/run')).length, 0, 'opening the review never starts a publication')
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(requests.filter(item => item.pathname.endsWith('/run')).length, 0)
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('dialog', { name: 'Ready to publish?', exact: true }).getByRole('button', { name: 'Publish now', exact: true }).click()
    await dialog.getByRole('status', { name: 'Progress', exact: true }).waitFor()
    await dialog.getByText('Waiting', { exact: true }).waitFor()
    assert.equal(requests.filter(item => item.pathname.endsWith('/run')).length, 1)
    runs[0] = { ...runs[0], status: 'succeeded', finishedAt: new Date().toISOString(), steps: (runs[0].steps as Record<string, unknown>[]).map((step, index) => ({ ...step, status: 'succeeded', ...(index === 0 ? { actionRun } : { providerRun: { id: 'provider-run', connectionId: 'cloud', provider: 'cloudflare-pages', state: 'succeeded', createdAt: Date.now(), updatedAt: Date.now(), resultUrl: 'https://my-site.pages.dev', url: 'https://dash.cloudflare.com/account/pages/view/my-site', steps: [] } }) })) }
    await dialog.getByRole('button', { name: 'Open site', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Open site', exact: true }).click()
    assert.equal((await page.evaluate(() => (globalThis as unknown as { previews: string[] }).previews)).at(-1), 'https://my-site.pages.dev')
    await dialog.getByText('Advanced settings', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Edit connection Public website', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit connection', exact: true })
    assert.equal(await editor.locator('select,datalist').count(), 0)
    assert.equal(await editor.getByLabel('Access token', { exact: true }).inputValue(), '')
    assert.equal(await editor.getByLabel('Access token', { exact: true }).getAttribute('type'), 'password')
    await editor.getByLabel('Name', { exact: true }).fill('My public website')
    failConnection = true
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await editor.getByText('Could not save this destination', { exact: true }).waitFor()
    assert.equal(await editor.getByLabel('Name', { exact: true }).inputValue(), 'My public website')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByText('My public website', { exact: true }).first().waitFor()
    const saved = requests.filter(item => item.pathname === '/api/release-providers/connection').at(-1)!
    assert.equal(saved.body?.token, undefined, 'an unchanged saved credential is never reflected into or replaced from the browser')
    await dialog.getByRole('button', { name: 'Connect a service', exact: true }).click()
    const addConnection = page.getByRole('dialog', { name: 'Connect a service', exact: true })
    await addConnection.getByLabel('Account ID', { exact: true }).fill('other-account')
    await addConnection.getByLabel('Project name', { exact: true }).fill('other-project')
    await addConnection.getByLabel('Access token', { exact: true }).fill('fixture-only-secret')
    failConnection = true
    await addConnection.getByRole('button', { name: 'Save', exact: true }).click()
    await addConnection.getByText('Could not save this destination', { exact: true }).waitFor()
    assert.equal(await addConnection.getByLabel('Access token', { exact: true }).inputValue(), 'fixture-only-secret', 'a rejected save preserves the current form draft')
    await addConnection.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await dialog.evaluate(el => { const storage = el.ownerDocument.defaultView!.localStorage; return Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index)!)).some(value => String(value).includes('fixture-only-secret')) }), false)
    await dialog.getByRole('button', { name: 'Edit flow Public website', exact: true }).click()
    const flowEditor = page.getByRole('dialog', { name: 'Edit flow', exact: true })
    assert.equal(await flowEditor.locator('select,datalist').count(), 0)
    await flowEditor.getByRole('button', { name: 'Move down Step 1', exact: true }).click()
    await flowEditor.getByRole('button', { name: 'Save', exact: true }).click()
    await flowEditor.waitFor({ state: 'hidden' })
    assert.equal((pipelines[1].steps as Record<string, unknown>[])[0].type, 'provider', 'advanced flow editing preserves the explicit user-selected execution order')
    await dialog.getByText('Advanced settings', { exact: true }).click()
    const bounds = await dialog.boundingBox(); assert.ok(bounds)
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    if (process.env.MEW_RELEASE_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_RELEASE_SCREENSHOTS, { recursive: true })
      await dialog.evaluate(el => { el.scrollTop = 0 })
      await dialog.screenshot({ path: path.join(process.env.MEW_RELEASE_SCREENSHOTS, `release-${width}-${dark ? 'dark' : 'light'}.png`) })
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    for (const request of requests) {
      if (request.body) { assert.equal(request.body.project, '.workspace'); assert.equal(request.body.path, 'apps/mobile'); assert.equal(request.body.workspacePath, '/fixture/project') }
      else { assert.equal(request.url.searchParams.get('project'), '.workspace'); assert.equal(request.url.searchParams.get('path'), 'apps/mobile'); assert.equal(request.url.searchParams.get('workspacePath'), '/fixture/project') }
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})

test('release recovery keeps uncertain runs honest and exposes confirmed remote results without requiring Browser access', { timeout: 60_000 }, async t => {
  const { code, css } = await fixtureBundle()
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const mode of ['unavailable', 'recovered', 'completed-without-site', 'empty']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 820 }, hasTouch: true })
    page.setDefaultTimeout(6_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const remote = { id: 'remote', name: 'Publish website', type: 'provider', connectionId: 'cloud', status: mode === 'completed-without-site' ? 'succeeded' : 'unknown', providerRun: { id: 'remote-run', connectionId: 'cloud', provider: 'cloudflare-pages', state: 'succeeded', createdAt: 1, updatedAt: 2, steps: [], ...(mode === 'completed-without-site' ? {} : { resultUrl: 'https://confirmed.pages.dev' }) } }
    const runs = mode === 'empty' ? [] : [
      { id: 'remote-run', pipelineId: 'public', name: 'Public website', purpose: 'publish', status: mode === 'completed-without-site' ? 'succeeded' : 'unknown', startedAt: '2026-01-02T00:00:00Z', finishedAt: '2026-01-02T00:01:00Z', source: { dirty: false }, steps: [remote] },
      ...(mode === 'completed-without-site' ? [] : [{ id: 'preview-run', pipelineId: 'preview', name: 'Website preview', purpose: 'preview', status: 'succeeded', startedAt: '2026-01-01T00:00:00Z', resultUrl: 'https://preview.example.com', source: { dirty: false }, steps: [] }]),
    ]
    const state = { projectRoot: '/fixture/project/apps/mobile', pipelines: [], runs, warnings: [], needsAgent: true, readiness: {} }
    await page.route('http://mew-release.test/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/project-pipelines') return route.fulfill({ json: state })
      if (url.pathname === '/api/release-providers') return route.fulfill({ json: { connections: [], runs: [] } })
      if (url.pathname === '/api/project-actions') return route.fulfill({ json: { projectRoot: state.projectRoot, actions: [], runs: [], warnings: [], needsAgent: true } })
      if (url.pathname.startsWith('/api/')) throw new Error(`Unexpected request: ${route.request().method()} ${url.pathname}`)
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>${css}:root{--color-surface:#fff;--color-surface-raised:#f4f5f8;--color-surface-hover:#e3e8ef;--color-ink:#202128;--color-ink-secondary:#5b6170;--color-accent:#6585d9;--color-accent-strong:#466ac5;--color-ink-on-accent:#fff;--color-edge:#707789;--color-edge-strong:#707789;--color-edge-bright:#707789}body{margin:0;font:14px sans-serif}*{box-sizing:border-box}</style><div id="root"></div><script>${code}</script></html>` })
    })
    await page.goto(`http://mew-release.test/?browser=${mode === 'unavailable' ? 'off' : 'on'}`)
    await page.getByRole('button', { name: 'Results & release', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Results & release', exact: true })
    await dialog.getByRole('heading', { name: 'See what you’ve made', exact: true }).waitFor()
    if (mode === 'unavailable') {
      assert.equal(await dialog.getByRole('button', { name: 'View result', exact: true }).isDisabled(), true)
      assert.equal(await dialog.getByRole('button', { name: 'View result', exact: true }).getAttribute('data-tip'), 'Browser is unavailable.')
      assert.equal(await dialog.getByRole('button', { name: 'Open site', exact: true }).isDisabled(), true)
    } else if (mode === 'recovered') {
      await dialog.getByText('Status unavailable', { exact: true }).first().waitFor()
      await dialog.getByRole('button', { name: 'Open site', exact: true }).click()
      assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { previews: string[] }).previews), ['https://confirmed.pages.dev'])
      assert.equal(await dialog.getByText('Publication steps complete', { exact: true }).count(), 0, 'a recovered remote result does not claim that unexecuted downstream steps finished')
    } else if (mode === 'completed-without-site') {
      await dialog.getByText('Steps complete', { exact: true }).waitFor()
      await dialog.getByText('The steps finished, but no file or site is connected yet.', { exact: true }).waitFor()
      assert.equal(await dialog.getByText('Publication steps complete', { exact: true }).count(), 0)
      assert.equal(await dialog.getByRole('button', { name: 'Open site', exact: true }).count(), 0)
    } else {
      await dialog.getByRole('button', { name: 'Set up this project', exact: true }).click()
      assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { setups: { projectPath: string }[] }).setups.map(item => item.projectPath)), ['/fixture/project/apps/mobile'])
      await dialog.getByRole('button', { name: 'Connect a service', exact: true }).click()
      const connection = page.getByRole('dialog', { name: 'Connect a service', exact: true })
      await connection.getByRole('combobox', { name: 'Service', exact: true }).waitFor()
      assert.equal(await connection.locator('select,datalist').count(), 0)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})
