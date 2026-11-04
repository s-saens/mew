import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('inline project addition creates, clones, connects GitHub before a project, links, and retries without duplicate mutations', { timeout: 120_000 }, async t => {
  const source = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {DialogFrame} from '@mew/ui';
import {ProjectAddInline} from '${root}/src/components/project-add-inline.tsx';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
window.opened=[];window.assisted=[];window.changed=0;window.before=0;window.failOpens=0;
function Fixture(){const [configuration,setConfiguration]=React.useState({key:0,canUseAgent:true,canManageFolders:true,onboarding:false});const [outcome,setOutcome]=React.useState('');const [panelOpen,setPanelOpen]=React.useState(true);const [requested,setRequested]=React.useState(false);const {setLocale}=useI18n();
 window.locale=setLocale;window.requestAdd=()=>setRequested(true);
 window.reset=(options={})=>{window.opened=[];window.assisted=[];window.changed=0;window.before=0;window.failOpens=0;setConfiguration(previous=>({key:previous.key+1,canUseAgent:true,canManageFolders:true,onboarding:false,...options}));setOutcome('');setPanelOpen(true);setRequested(false)};
 const open=async path=>{window.opened.push(path);if(window.failOpens>0){window.failOpens--;return false}setOutcome('Opened')};
 const contents=<section aria-label="Project fixture" style={{width:window.panelWidth,maxWidth:'100vw',padding:6,boxSizing:'border-box'}}><p className="mb-2 text-sm text-ink">My projects</p><ProjectAddInline key={configuration.key} basePath="/existing" canUseAgent={configuration.canUseAgent} canManageFolders={configuration.canManageFolders} onboarding={configuration.onboarding} openRequested={requested} onOpenRequestHandled={()=>setRequested(false)} onOpen={open} beforeMutation={async()=>{window.before++}} onProjectsChanged={()=>{window.changed++}} onCreateWithAgent={project=>{window.assisted.push(project);setOutcome('Assisted')}}/><output>{outcome}</output></section>;
 return window.mobile?(panelOpen?<DialogFrame size="settings" labelledBy="fixture-title" onClose={()=>setPanelOpen(false)} className="mew-mobile-project-panel flex h-full max-w-none flex-col"><h2 id="fixture-title">Projects</h2>{contents}</DialogFrame>:<p>Panel closed</p>):contents}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source]
  const bundle = await build({ input: 'virtual:inline-add.tsx', write: false, platform: 'browser', output: { format: 'iife' }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:inline-add.tsx') return id; if (id === './LoginDesktopViewer') return 'virtual:login.tsx'; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) {
      if (id === 'virtual:inline-add.tsx') return source
      if (id === 'virtual:login.tsx') return 'export function LoginDesktopViewer(){return null}'
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const panelWidth of [200, 240, 390]) for (const theme of ['dark', 'light']) {
    const mobile = panelWidth === 390, viewport = { width: mobile ? 390 : 1100, height: 844 }
    const page = await browser.newPage({ viewport, hasTouch: mobile })
    page.setDefaultTimeout(7000)
    const errors: string[] = [], mutations: Record<string, unknown>[] = [], authProjects: string[] = []
    let failMutation = false, connected = false, failRepositories = false, repositoryReads = 0
    const repositories = [{ name: 'secret', fullName: 'example-org/secret', url: 'https://github.com/example-org/secret.git', private: true }]
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ panelWidth, mobile }) => { localStorage.setItem('mew:locale', 'ko'); localStorage.setItem('mew:ui-locale', 'ko'); Object.assign(globalThis, { panelWidth, mobile }) }, { panelWidth, mobile })
    await page.route('http://mew-inline-add.test/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname
      if (endpoint === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (endpoint === '/api/project-registry/repositories') {
        repositoryReads++
        if (failRepositories) { failRepositories = false; return route.fulfill({ status: 503, json: { error: 'Repository list unavailable. Retry.' } }) }
        return route.fulfill({ json: { connected, repositories: connected ? repositories : [] } })
      }
      if (endpoint === '/api/project-registry' && request.method() === 'POST') {
        const body = request.postDataJSON()
        mutations.push(body)
        if (failMutation) { failMutation = false; return route.fulfill({ status: 409, json: { error: 'Destination already exists. Choose another name.' } }) }
        const name = body.mode === 'clone' ? body.url.split('/').at(-1).replace(/\.git$/, '') : body.name ?? 'Orchard'
        const project = { name, path: body.path ? '/canonical/Orchard' : '/managed/' + name, managed: !body.path, mine: true, icon: null }
        return route.fulfill({ json: { project } })
      }
      if (endpoint === '/api/git-connections/github') {
        authProjects.push(url.searchParams.get('project') ?? '')
        return route.fulfill({ json: { available: true, login: connected ? 'fixture-user' : null, environmentToken: false, busy: false, job: null } })
      }
      if (endpoint === '/api/fs/entries' || endpoint === '/api/fs/dirs') {
        const current = url.searchParams.get('path') || '/existing'
        const dirs = current === '/existing' ? [{ name: 'Orchard', path: '/existing/Orchard' }] : []
        return route.fulfill({ json: { path: current, parent: current === '/existing' ? '/' : '/existing', dirs, entries: dirs.map(dir => ({ ...dir, type: 'dir', size: null })) } })
      }
      if (endpoint === '/api/fs/favorites') return route.fulfill({ json: { folders: [] } })
      if (endpoint === '/api/agent-cwd/suggestions') return route.fulfill({ json: { dirs: [] } })
      if (endpoint.startsWith('/api/')) return route.fulfill({ json: { ok: true } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${theme === 'dark' ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body,#root{height:100%;margin:0}body{background:var(--color-surface-deep);color:var(--color-ink)}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-inline-add.test/')
    const inline = page.locator('[data-project-add-inline]')
    const add = inline.getByRole('button', { name: '추가', exact: true })
    const createMode = inline.getByRole('button', { name: '새 프로젝트', exact: true })
    const cloneMode = inline.getByRole('button', { name: 'Git 복제', exact: true })
    const existingMode = inline.getByRole('button', { name: '기존 프로젝트', exact: true })
    const create = inline.getByRole('button', { name: '프로젝트 만들기', exact: true })
    const clone = inline.getByRole('button', { name: '저장소 복제', exact: true })
    const name = inline.getByRole('textbox', { name: '프로젝트 이름', exact: true })
    const remote = inline.getByRole('textbox', { name: 'Git 저장소 주소', exact: true })
    const git = inline.getByRole('button', { name: 'Git 레포로 만들기', exact: true })
    assert.equal(await inline.getByRole('navigation').count(), 0)
    assert.equal(authProjects.length, 0, 'ordinary closed addition does not fetch GitHub account state')
    await add.click()
    const choices = inline.getByRole('navigation').getByRole('button')
    assert.equal(await choices.count(), 3)
    const boxes = await choices.evaluateAll(elements => elements.map(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width } }))
    assert.ok(boxes.every(box => box.y === boxes[0].y) && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x, 'the three choices share one horizontal row')
    const addBox = await add.boundingBox()
    assert.ok(addBox && Math.abs(addBox.y - boxes[0].y) <= 1 && addBox.x + addBox.width <= boxes[0].x, 'choices sit beside Add on the same row')
    await createMode.click()
    assert.equal(await git.getAttribute('aria-pressed'), 'true')
    assert.equal(await create.isDisabled(), true)
    assert.equal(await inline.locator('select,datalist').count(), 0)
    await name.fill('../outside')
    assert.equal(await name.getAttribute('aria-invalid'), 'true')
    assert.equal(await create.isDisabled(), true)
    await name.fill('Reading room')
    const nameBox = await name.boundingBox(), gitBox = await git.boundingBox()
    assert.ok(nameBox && gitBox && gitBox.x >= nameBox.x && gitBox.x + gitBox.width <= nameBox.x + nameBox.width + 1, 'Git toggle stays inside the name field')
    assert.equal(await inline.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    const inlineBox = await inline.boundingBox()
    assert.ok(inlineBox && inlineBox.x >= 0 && inlineBox.x + inlineBox.width <= viewport.width + 1)
    if (viewport.width < 768) {
      for (const target of [add, createMode, cloneMode, existingMode, create, git]) {
        const box = await target.boundingBox()
        assert.ok(box && box.height >= 44, 'mobile inline project actions keep 44px touch targets')
      }
    }
    await page.screenshot({ path: `/tmp/mew-inline-add-new-${panelWidth}-${theme}.png` })
    await create.click()
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ name: 'Reading room', git: true }])
    assert.deepEqual(await page.evaluate('window.opened'), ['/managed/Reading room'])
    assert.equal(await page.evaluate('window.before'), 1)

    await page.evaluate('window.reset()')
    await add.click(); await createMode.click(); await name.fill('Plain'); await git.click()
    await create.evaluate(element => {
      const form = element.closest('form')
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ name: 'Plain', git: false }], 'rapid duplicate submissions perform only one mutation')

    await page.evaluate('window.reset()')
    await add.click(); await createMode.click(); await name.fill('Interview')
    await inline.getByRole('button', { name: '에이전트랑 만들기', exact: true }).click()
    await page.getByText('Assisted', { exact: true }).waitFor()
    assert.deepEqual(await page.evaluate('window.opened'), [])
    assert.equal((await page.evaluate('window.assisted') as { path: string }[])[0].path, '/managed/Interview')
    mutations.splice(0)

    await page.evaluate('window.reset({canUseAgent:false})')
    await add.click(); await createMode.click()
    assert.equal(await inline.getByRole('button', { name: '에이전트랑 만들기', exact: true }).count(), 0)
    await name.fill('Retry'); failMutation = true
    await create.click()
    await inline.getByRole('alert').filter({ hasText: 'Destination already exists' }).waitFor()
    assert.equal(await name.inputValue(), 'Retry')
    assert.equal(await name.isEnabled(), true)
    await name.fill('Recovered')
    await page.evaluate('window.failOpens=1')
    await create.click()
    await inline.getByRole('alert').filter({ hasText: '프로젝트를 열지 못했습니다' }).waitFor()
    assert.equal(await name.isDisabled(), true)
    await create.click()
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ name: 'Retry', git: true }, { name: 'Recovered', git: true }], 'retrying a failed open does not create again')
    assert.deepEqual(await page.evaluate('window.opened'), ['/managed/Recovered', '/managed/Recovered'])

    await page.evaluate('window.reset()')
    await add.click(); await cloneMode.click()
    await inline.getByRole('button', { name: 'GitHub 로그인', exact: true }).waitFor()
    assert.ok(authProjects.length > 0 && authProjects.every(project => project === ''), 'GitHub connection is independent of an active project')
    await remote.fill('https://github.com/example/public.git')
    failMutation = true
    await clone.click()
    await inline.getByRole('alert').filter({ hasText: 'Destination already exists' }).waitFor()
    assert.equal(await remote.inputValue(), 'https://github.com/example/public.git')
    await page.evaluate('window.failOpens=1')
    await clone.click()
    await inline.getByRole('alert').filter({ hasText: '프로젝트를 열지 못했습니다' }).waitFor()
    assert.equal(await remote.isDisabled(), true)
    await clone.click()
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ mode: 'clone', url: 'https://github.com/example/public.git' }, { mode: 'clone', url: 'https://github.com/example/public.git' }], 'public clone needs no account; failed opening retries the same clone')

    await page.evaluate('window.reset({onboarding:true})')
    await inline.getByRole('button', { name: 'GitHub 로그인', exact: true }).waitFor()
    assert.equal(await inline.getByRole('navigation').count(), 0, 'first-use connection is available before choosing an add mode')
    await inline.getByRole('button', { name: 'GitHub 로그인', exact: true }).click()
    const connectionDialog = page.getByRole('dialog', { name: 'GitHub 로그인', exact: true })
    await connectionDialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).waitFor()
    await connectionDialog.getByRole('button', { name: '닫기', exact: true }).click()
    await connectionDialog.waitFor({ state: 'hidden' })
    await page.evaluate('window.requestAdd()')
    await cloneMode.click()
    await inline.getByRole('status', { name: '불러오는 중…', exact: true }).waitFor({ state: 'hidden' })
    failRepositories = true
    await inline.getByRole('button', { name: '다시 시도', exact: true }).click()
    await inline.getByRole('alert').filter({ hasText: 'Repository list unavailable' }).waitFor()
    connected = true
    const reads = repositoryReads
    await page.evaluate('window.dispatchEvent(new Event("mew:git-connection-changed"))')
    const secret = inline.getByRole('button', { name: 'example-org/secret 비공개 저장소', exact: true })
    await secret.waitFor()
    assert.ok(repositoryReads > reads)
    await page.screenshot({ path: `/tmp/mew-inline-add-clone-${panelWidth}-${theme}.png` })
    assert.equal(await inline.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    await secret.click()
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ mode: 'clone', url: 'https://github.com/example-org/secret.git' }])
    connected = false

    await page.evaluate('window.reset({canManageFolders:false})')
    await add.click()
    await inline.getByRole('button', { name: '기존 프로젝트', exact: true }).click()
    const browserDialog = page.getByRole('dialog', { name: '기존 프로젝트 연결', exact: true })
    await browserDialog.waitFor()
    assert.equal(await browserDialog.getByRole('button', { name: 'Git 복제', exact: true }).count(), 0)
    await browserDialog.getByRole('button', { name: 'Orchard', exact: true }).click()
    await browserDialog.locator('input[value="/existing/Orchard"]').waitFor()
    await browserDialog.getByRole('button', { name: '이 폴더 연결', exact: true }).click()
    await page.getByText('Opened', { exact: true }).waitFor()
    assert.deepEqual(mutations.splice(0), [{ path: '/existing/Orchard' }])
    assert.deepEqual(await page.evaluate('window.opened'), ['/canonical/Orchard'])

    await page.evaluate('window.reset()')
    await add.click(); await createMode.click(); await name.fill('Draft')
    await name.press('Escape')
    assert.equal(await inline.getByRole('navigation').count(), 0)
    assert.equal(await add.evaluate(element => element.ownerDocument.activeElement === element), true)
    if (mobile) assert.equal(await page.getByRole('dialog', { name: 'Projects', exact: true }).count(), 1, 'Esc collapses setup without dismissing the mobile project panel')
    await add.click(); await createMode.click()
    assert.equal(await name.inputValue(), 'Draft')
    for (const [locale, labels] of [['en', ['Git clone', 'New project', 'Existing project']], ['zh-CN', ['Git 克隆', '新建项目', '已有项目']], ['ja', ['Git 複製', '新規', '既存のプロジェクト']]] as const) {
      await page.evaluate(locale => (globalThis as unknown as { locale: (locale: string) => void }).locale(locale), locale)
      for (const label of labels) await inline.getByRole('navigation').getByRole('button', { name: label, exact: true }).waitFor()
      assert.equal(await inline.evaluate(element => element.scrollWidth <= element.clientWidth), true)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
})
