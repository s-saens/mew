import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('project library creates by name, retries safely, pins shared projects, and links existing folders on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 90_000 }, async t => {
  const source = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {OpenProjectDialog} from '${root}/src/components/OpenProjectDialog.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.opened=[];window.assisted=[];window.changed=0;window.failOpens=0;
function Fixture(){const [configuration,setConfiguration]=React.useState({key:0,canUseAgent:true,canManageFolders:true});const [visible,setVisible]=React.useState(true);
 window.reset=(options={})=>{window.opened=[];window.assisted=[];window.changed=0;window.failOpens=0;setConfiguration(previous=>({key:previous.key+1,canUseAgent:true,canManageFolders:true,...options}));setVisible(true)};
 const open=async path=>{window.opened.push(path);if(window.failOpens>0){window.failOpens--;throw Error('Opening failed; try again')}setVisible(false)};
 return <I18nProvider>{visible?<OpenProjectDialog key={configuration.key} basePath="/existing" canUseAgent={configuration.canUseAgent} canManageFolders={configuration.canManageFolders} onOpen={open} onClose={()=>setVisible(false)} onProjectsChanged={()=>{window.changed++}} onCreateWithAgent={project=>{window.assisted.push(project);setVisible(false)}}/>:<p>Closed</p>}</I18nProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source]
  const bundle = await build({ input: 'virtual:project-library.tsx', write: false, platform: 'browser', output: { format: 'iife' }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:project-library.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) {
      if (id === 'virtual:project-library.tsx') return source
      if (id === 'virtual:style') return ''
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], mutations: { endpoint: string; body: Record<string, unknown> }[] = [], browsed: string[] = []
    let registryReads = 0, failRegistry = false, failCreate = false, canonicalLink = false
    const browsingEndpoints: string[] = []
    const projects = [
      { path: '/managed/Garden', name: 'Garden', managed: true, mine: true, icon: null },
      { path: '/existing/Studio', name: 'Studio', managed: false, mine: false, icon: null },
      { path: '/managed/Twin', name: 'Twin', managed: true, mine: false, icon: null },
      { path: '/external/clients/Twin', name: 'Twin', managed: false, mine: false, icon: null },
    ]
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko') })
    await page.route('http://mew-project-library.test/**', route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname
      if (endpoint === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (endpoint === '/api/project-registry' && request.method() === 'GET') {
        registryReads++
        if (failRegistry) { failRegistry = false; return route.fulfill({ status: 503, json: { error: 'Project library unavailable' } }) }
        return route.fulfill({ json: { projects } })
      }
      if (endpoint === '/api/project-registry' && request.method() === 'POST') {
        const body = request.postDataJSON()
        mutations.push({ endpoint, body })
        if (failCreate) { failCreate = false; return route.fulfill({ status: 409, json: { error: 'A project with this name already exists' } }) }
        const project = body.path ? { path: canonicalLink ? '/real/Orchard' : body.path, name: 'Orchard', managed: false, mine: true, icon: null } : { path: `/managed/${body.name}`, name: body.name, managed: true, mine: true, icon: null }
        return route.fulfill({ json: { project } })
      }
      if (endpoint === '/api/project-registry/mine' && request.method() === 'PUT') { mutations.push({ endpoint, body: request.postDataJSON() }); return route.fulfill({ json: { ok: true } }) }
      if (endpoint === '/api/fs/entries' || endpoint === '/api/fs/dirs') {
        const current = url.searchParams.get('path') || '/existing'
        browsed.push(current)
        browsingEndpoints.push(endpoint)
        const dirs = current === '/existing' ? [{ name: 'Orchard', path: '/existing/Orchard' }] : []
        return route.fulfill({ json: { path: current, parent: current === '/existing' ? '/' : '/existing', dirs, entries: dirs.map(dir => ({ ...dir, type: 'dir', size: null })) } })
      }
      if (endpoint === '/api/fs/favorites') return route.fulfill({ json: { folders: [] } })
      if (endpoint === '/api/agent-cwd/suggestions') return route.fulfill({ json: { dirs: [] } })
      if (endpoint.startsWith('/api/')) return route.fulfill({ json: { ok: true } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-project-library.test/')
    const dialog = page.getByRole('dialog', { name: '프로젝트 추가', exact: true })
    const name = page.getByRole('textbox', { name: '프로젝트 이름', exact: true })
    const git = page.getByRole('checkbox', { name: 'Git 레포로 만들기', exact: true })
    const empty = page.getByRole('button', { name: '빈 프로젝트 만들기', exact: true })
    await dialog.waitFor()
    assert.equal(await git.isChecked(), true)
    assert.equal(await dialog.getByRole('textbox').count(), 1, 'the first creation screen asks for a name without a path')
    assert.equal(await dialog.locator('select,datalist').count(), 0)
    assert.equal(registryReads, 0, 'the shared catalog loads only when requested')
    assert.equal(browsed.length, 0, 'name-based creation never browses server folders')
    assert.equal(await empty.isDisabled(), true)
    await name.fill('../outside')
    assert.equal(await name.getAttribute('aria-invalid'), 'true')
    assert.equal(await empty.isDisabled(), true)
    await name.fill('Reading room')
    await page.screenshot({ path: `/tmp/mew-project-library-${width}-${theme}.png` })
    if ((width === 1100 && theme === 'dark') || (width === 390 && theme === 'light')) await page.screenshot({ path: `/tmp/mew-project-library-${width}.png` })
    const box = await dialog.boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.height <= 844)
    await empty.click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry', body: { name: 'Reading room', git: true } }])
    assert.deepEqual(await page.evaluate('window.opened'), ['/managed/Reading room'])
    assert.equal(await page.evaluate('window.changed'), 1)

    await page.evaluate('window.reset()')
    await name.fill('Plain')
    await git.uncheck()
    await empty.click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry', body: { name: 'Plain', git: false } }])

    await page.evaluate('window.reset()')
    await name.fill('Interview')
    await page.getByRole('button', { name: '에이전트랑 만들기', exact: true }).click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.equal((await page.evaluate('window.assisted') as { path: string }[])[0].path, '/managed/Interview')
    assert.deepEqual(await page.evaluate('window.opened'), [], 'assisted creation uses its own project callback')
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry', body: { name: 'Interview', git: true } }])

    await page.evaluate('window.reset({canUseAgent:false})')
    assert.equal(await page.getByRole('button', { name: '에이전트랑 만들기', exact: true }).count(), 0)
    await name.fill('Retry')
    failCreate = true
    await empty.click()
    await page.getByRole('alert').filter({ hasText: 'A project with this name already exists' }).waitFor()
    assert.equal(await name.isEnabled(), true)
    await name.fill('Recovered')
    await page.evaluate('window.failOpens=1')
    await empty.click()
    await page.getByRole('alert').filter({ hasText: 'Opening failed; try again' }).waitFor()
    assert.equal(await name.isDisabled(), true, 'a successfully created project is retained while opening is retried')
    await empty.click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [
      { endpoint: '/api/project-registry', body: { name: 'Retry', git: true } },
      { endpoint: '/api/project-registry', body: { name: 'Recovered', git: true } },
    ], 'retrying the open does not create a second project')
    assert.deepEqual(await page.evaluate('window.opened'), ['/managed/Recovered', '/managed/Recovered'])

    await page.evaluate('window.reset()')
    failRegistry = true
    await page.getByRole('button', { name: '모든 프로젝트', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Project library unavailable' }).waitFor()
    await page.getByRole('button', { name: '다시 시도', exact: true }).click()
    await page.getByRole('button', { name: 'Studio', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Garden · 내 프로젝트에 있음', exact: true }).isDisabled(), true)
    const search = page.getByRole('textbox', { name: '프로젝트 검색', exact: true })
    await search.fill('missing')
    await page.getByText('일치하는 프로젝트가 없습니다.', { exact: true }).waitFor()
    await search.fill('stu')
    assert.equal(await page.getByRole('button', { name: 'Garden', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Studio · 내 프로젝트에 추가', exact: true }).click()
    await page.getByRole('button', { name: 'Studio · 내 프로젝트에 있음', exact: true }).waitFor()
    assert.deepEqual(await page.evaluate('window.opened'), [], 'pinning does not open or switch projects')
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry/mine', body: { path: '/existing/Studio', added: true } }])
    await search.fill('')
    await page.getByText('/managed/Twin', { exact: true }).waitFor()
    await page.getByText('/external/clients/Twin', { exact: true }).waitFor()
    assert.equal(await page.getByText('/managed/Garden', { exact: true }).count(), 0, 'unique names keep their paths hidden')
    assert.equal(await page.getByText('/existing/Studio', { exact: true }).count(), 0)
    const managedTwin = page.getByRole('button', { name: 'Twin (/managed/Twin) · 내 프로젝트에 추가', exact: true })
    const externalTwin = page.getByRole('button', { name: 'Twin (/external/clients/Twin) · 내 프로젝트에 추가', exact: true })
    assert.equal(await managedTwin.count(), 1)
    assert.equal(await externalTwin.count(), 1, 'duplicate names have independently labelled pin actions')
    await managedTwin.click()
    await page.getByRole('button', { name: 'Twin (/managed/Twin) · 내 프로젝트에 있음', exact: true }).waitFor()
    assert.equal(await externalTwin.isEnabled(), true, 'pinning one same-name project leaves the other project unpinned')
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry/mine', body: { path: '/managed/Twin', added: true } }])
    assert.deepEqual(await page.evaluate('window.opened'), [])
    await page.screenshot({ path: `/tmp/mew-project-library-all-${width}-${theme}.png` })
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.deepEqual(await page.evaluate('window.opened'), ['/existing/Studio'])

    await page.evaluate('window.reset()')
    await page.getByRole('button', { name: '기존 프로젝트 연결', exact: true }).click()
    await page.getByRole('dialog', { name: '기존 프로젝트 연결', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Orchard', exact: true }).click()
    await page.locator('input[value="/existing/Orchard"]').waitFor()
    await page.getByRole('button', { name: '이 폴더 연결', exact: true }).click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry', body: { path: '/existing/Orchard' } }])
    assert.deepEqual(await page.evaluate('window.opened'), ['/existing/Orchard'])
    assert.ok(browsed.includes('/existing/Orchard'))
    const requestsBeforeMember = browsingEndpoints.length
    await page.evaluate('window.reset({canManageFolders:false,canUseAgent:false})')
    canonicalLink = true
    await page.getByRole('button', { name: '기존 프로젝트 연결', exact: true }).click()
    await page.getByRole('button', { name: 'Orchard', exact: true }).waitFor()
    assert.equal(await page.getByRole('combobox').count(), 0, 'member browsing does not call privileged suggestions')
    assert.equal(await page.getByRole('button', { name: '새 폴더', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Orchard', exact: true }).click()
    await page.locator('input[value="/existing/Orchard"]').waitFor()
    await page.getByRole('button', { name: '이 폴더 연결', exact: true }).click()
    await page.getByText('Closed', { exact: true }).waitFor()
    assert.ok(browsingEndpoints.slice(requestsBeforeMember).every(endpoint => endpoint === '/api/fs/dirs'), 'member linking uses folder-only browsing')
    assert.deepEqual(await page.evaluate('window.opened'), ['/real/Orchard'], 'link opening uses the canonical registry path instead of an alias')
    assert.deepEqual(mutations.splice(0), [{ endpoint: '/api/project-registry', body: { path: '/existing/Orchard' } }])
    assert.deepEqual(errors, [])
    await page.close()
  }
})
