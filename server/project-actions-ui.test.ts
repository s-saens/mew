import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

async function fixtureBundle() {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
import {ProjectActionNoticeHost} from '${root}/src/components/project-action-notice-host.tsx';
import {WorkspaceApiProvider} from '${root}/src/api/workspace-api-context.tsx';
import {createWorkspaceClient} from '${root}/src/api/client.ts';
import {configureAppRuntime} from '${root}/src/runtime/app-runtime.ts';
import {BrowserContext} from '${root}/src/workspace/workspace-browser-context.ts';
import {ProjectSetupContext} from '${root}/src/workspace/project-setup-context.ts';
import {ProjectCreationAgentDialog} from '${root}/src/components/ProjectCreationAgentDialog.tsx';
import {onMewcatNotice,focusMewcatNotice} from '${root}/src/utils/mewcat-notifications.ts';
localStorage.setItem('mew:locale','en');window.notices=[];window.previews=[];window.prepared=[];window.downloads=[];
HTMLAnchorElement.prototype.click=function(){window.downloads.push({href:this.href,name:this.download})};
configureAppRuntime({transport:{fetch:(...args)=>fetch(...args),socket:()=>{throw Error('Unexpected socket')},close(){}},resourceUrl:url=>url,prepareResourceUrl:async url=>{window.prepared.push(url);return url},releaseResourceUrl(){}});
onMewcatNotice(notice=>window.notices.push(notice));window.openNotice=()=>focusMewcatNotice(window.notices.at(-1));
const client=createWorkspaceClient({workspacePath:'/fixture/project',projectPath:'/fixture/project'});
function Fixture(){const [visible,setVisible]=useState(true),[setup,setSetup]=useState(null);window.setActionsVisible=setVisible;return <ProjectSetupContext.Provider value={setSetup}><button onClick={()=>setVisible(!visible)}>Toggle actions</button>{visible&&<CommandButtonMenu project=".workspace" directory="apps/mobile" workspacePath="/fixture/project"/>}<ProjectActionNoticeHost enabled/>{setup&&<ProjectCreationAgentDialog {...setup} onClose={()=>{setup.onClose?.();setSetup(null)}}/>}</ProjectSetupContext.Provider>}
createRoot(document.getElementById('root')).render(<I18nProvider><WorkspaceApiProvider client={client}><BrowserContext.Provider value={url=>window.previews.push(url)}><Fixture/></BrowserContext.Provider></WorkspaceApiProvider></I18nProvider>);`
  const bundle = await build({ input: 'virtual:project-actions.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture',
    resolveId(id) {
      if (id === 'virtual:project-actions.tsx' || id === 'virtual:setup.tsx') return id
      if (id.endsWith('/ProjectCreationAgentDialog') || id.endsWith('/ProjectCreationAgentDialog.tsx')) return 'virtual:setup.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
    },
    load(id) {
      if (id === 'virtual:project-actions.tsx') return source
      if (id === 'virtual:setup.tsx') return `import React from 'react';import {DialogFrame} from '@mew/ui';export function ProjectCreationAgentDialog(props){return <DialogFrame labelledBy="setup-title" onClose={props.onClose}><div id="setup-title">Agent setup</div><span>{props.projectPath}</span><span>{props.setupTitle}</span><button onClick={props.onClose}>Close setup</button></DialogFrame>}`
      if (id === 'virtual:style') return ''
    },
  }] })
  const files = ['src/components/ProjectActions.tsx', 'src/components/ProjectActionsEditor.tsx', 'src/components/ProjectActionsResults.tsx', 'src/components/ProjectActionNoticeResults.tsx', 'src/components/CommandButtonMenu.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/select-field.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8').catch(() => '')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  return { code: bundle.output.find(item => item.type === 'chunk')!.code, css: compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) }
}

test('build and deploy actions support scoped runs, completion notices, previews, artifacts and editing at desktop/mobile widths', { timeout: 90_000 }, async t => {
  const { code, css } = await fixtureBundle()
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width === 320 })
    page.setDefaultTimeout(6_000)
    const errors: string[] = [], requests: { pathname: string; body?: Record<string, unknown>; url: URL }[] = []
    page.on('pageerror', error => errors.push(error.message))
    let actions = [
      { id: 'debug', name: 'Debug build', kind: 'build', variant: 'debug', command: './gradlew assembleDebug', artifacts: ['app/build/outputs/apk/**/*.apk'] },
      { id: 'release', name: 'Release build', kind: 'build', variant: 'release', command: './gradlew assembleRelease' },
      { id: 'deploy', name: 'Preview deployment', kind: 'deploy', command: 'npm run deploy', previewUrl: 'http://localhost:4173' },
    ]
    let runs: Record<string, unknown>[] = [{ id: 'run-empty', actionId: 'release', name: 'Release build', kind: 'build', status: 'succeeded', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:01:00.000Z', output: 'Done', artifacts: [] }], failSave = false, failLoad = false, commandFailure = true
    const state = () => ({ projectRoot: '/fixture/project/apps/mobile', actions, runs, warnings: [], needsAgent: false })
    await page.route('http://mew-actions.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname.startsWith('/api/project-actions')) {
        const body = request.method() === 'GET' ? undefined : request.postDataJSON()
        requests.push({ pathname: url.pathname, body, url })
        if (url.pathname.endsWith('/run')) {
          assert.equal(body.id, 'debug')
          runs = [{ id: 'run-debug', actionId: 'debug', name: 'Debug build', kind: 'build', status: 'running', startedAt: new Date().toISOString(), output: 'Compiling…', artifacts: [] }]
          return route.fulfill({ json: { run: runs[0] } })
        }
        if (request.method() === 'PUT') {
          if (failSave) { failSave = false; return route.fulfill({ status: 500, json: { error: 'Cannot save actions' } }) }
          actions = body.actions
        }
        if (failLoad) { failLoad = false; return route.fulfill({ status: 500, json: { error: 'Actions are unavailable' } }) }
        return route.fulfill({ json: state() })
      }
      if (url.pathname === '/api/cmd-buttons') return commandFailure ? route.fulfill({ status: 503, json: { error: 'Commands unavailable' } }) : route.fulfill({ json: { buttons: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>${css}
      :root{--color-surface:${dark ? '#171a24' : '#fff'};--color-surface-solid:var(--color-surface);--color-surface-raised:${dark ? '#252939' : '#f4f5f8'};--color-surface-raised-solid:var(--color-surface-raised);--color-surface-hover:${dark ? '#30394b' : '#e3e8ef'};--color-surface-hover-solid:var(--color-surface-hover);--color-ink:${dark ? '#f4f4f6' : '#202128'};--color-ink-secondary:${dark ? '#bbc0cd' : '#5b6170'};--color-accent:#6585d9;--color-accent-strong:#466ac5;--color-ink-on-accent:#fff;--color-edge:#707789;--color-edge-strong:#707789;--color-edge-bright:#707789;--color-danger-strong:${dark ? '#ffacac' : '#a31616'}}body{margin:0;padding:8px;font:14px sans-serif;background:var(--color-surface);color:var(--color-ink)}*{box-sizing:border-box}</style><div id="root"></div><script>${code}</script></html>` })
    })
    await page.goto('http://mew-actions.test/')
    const trigger = page.getByRole('button', { name: 'apps/mobile command buttons', exact: true })
    const openAction = async (name: 'Build' | 'Deploy') => {
      await trigger.click()
      const menu = page.locator('[data-command-menu]')
      await menu.getByRole('button', { name, exact: true }).click()
      await menu.waitFor({ state: 'hidden' })
    }
    assert.equal(await page.getByRole('button', { name: 'Build', exact: true }).count(), 0, 'build is available only inside the command menu')
    assert.equal(await page.getByRole('button', { name: 'Deploy', exact: true }).count(), 0, 'deploy is available only inside the command menu')
    assert.equal(await page.getByRole('button', { name: 'Results & release', exact: true }).count(), 0, 'results are available only inside the command menu')
    const failedCommands = page.waitForResponse(response => response.url().includes('/api/cmd-buttons') && response.status() === 503)
    await trigger.click()
    await failedCommands
    await page.locator('[data-command-menu]').getByRole('button', { name: 'Build', exact: true }).click()
    commandFailure = false
    let dialog = page.getByRole('dialog', { name: 'Build', exact: true })
    await dialog.getByRole('button', { name: 'Debug build', exact: true }).waitFor()
    await dialog.getByText('No files or preview available for this run.', { exact: true }).waitFor()
    if (process.env.MEW_PROJECT_ACTION_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_PROJECT_ACTION_SCREENSHOTS, { recursive: true })
      await dialog.screenshot({ path: path.join(process.env.MEW_PROJECT_ACTION_SCREENSHOTS, `project-actions-empty-${width}-${dark ? 'dark' : 'light'}.png`) })
    }
    await dialog.getByRole('button', { name: 'Configure result for Release build', exact: true }).click()
    await page.getByRole('dialog', { name: 'Edit action', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await dialog.getByText('./gradlew assembleDebug', { exact: true }).count(), 0, 'routine actions hide command syntax')
    const bounds = await dialog.boundingBox(); assert.ok(bounds)
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    await dialog.getByRole('button', { name: 'Debug build', exact: true }).click()
    await dialog.getByText('Running', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page.waitForFunction(element => element === element.ownerDocument.activeElement, await trigger.elementHandle())
    await page.getByRole('button', { name: 'Toggle actions', exact: true }).click()
    runs = [{ ...runs[0], status: 'succeeded', finishedAt: new Date().toISOString(), exitCode: 0, output: 'BUILD SUCCESSFUL', previewUrl: 'http://localhost:4173', archive: { name: 'dist.zip', fileCount: 6, size: 2097152 }, artifacts: [{ path: 'app/build/outputs/apk/debug/app-debug.apk', name: 'app-debug.apk', size: 2097152 }, { path: 'debug/app.apk', name: 'app.apk' }, { path: 'release/app.apk', name: 'app.apk' }, { path: 'dist/a.js', name: 'a.js' }, { path: 'dist/b.js', name: 'b.js' }, { path: 'dist/c.js', name: 'c.js' }] }]
    await page.waitForFunction(() => (globalThis as unknown as { notices: unknown[] }).notices.length === 1)
    await page.evaluate(() => (globalThis as unknown as { openNotice: () => void }).openNotice())
    dialog = page.getByRole('dialog', { name: 'Recent results', exact: true })
    await dialog.getByText('Succeeded', { exact: true }).waitFor()
    await dialog.getByText('Files', { exact: true }).waitFor()
    await dialog.getByText('app-debug.apk', { exact: true }).waitFor()
    await dialog.getByText('APK · 2.0 MB', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Download app.apk (debug/app.apk)', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Download app.apk (release/app.apk)', exact: true }).waitFor()
    await dialog.getByText('debug/app.apk', { exact: true }).waitFor()
    await dialog.getByText('More files (3)', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Download c.js', exact: true }).waitFor()
    if (process.env.MEW_PROJECT_ACTION_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_PROJECT_ACTION_SCREENSHOTS, { recursive: true })
      await dialog.screenshot({ path: path.join(process.env.MEW_PROJECT_ACTION_SCREENSHOTS, `project-actions-${width}-${dark ? 'dark' : 'light'}.png`) })
    }
    await dialog.getByRole('button', { name: 'Open preview', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => (globalThis as unknown as { previews: string[] }).previews), ['http://localhost:4173'])
    await dialog.getByRole('button', { name: 'Download app-debug.apk', exact: true }).click()
    await page.waitForFunction(() => (globalThis as unknown as { downloads: unknown[] }).downloads.length === 1)
    const { downloads, prepared } = await page.evaluate(() => { const fixture = globalThis as unknown as { downloads: { href: string; name: string }[]; prepared: string[] }; return { downloads: fixture.downloads, prepared: fixture.prepared } })
    assert.equal(downloads[0].name, 'app-debug.apk')
    assert.equal(new URL(prepared[0], 'http://mew-actions.test').href, downloads[0].href)
    const download = new URL(downloads[0].href, 'http://mew-actions.test')
    assert.equal(download.pathname, '/api/project-actions/artifacts')
    assert.equal(download.searchParams.get('artifactPath'), 'app/build/outputs/apk/debug/app-debug.apk')
    assert.equal(download.searchParams.get('path'), 'apps/mobile')
    assert.equal(download.searchParams.get('runId'), 'run-debug')
    assert.equal(download.searchParams.get('workspacePath'), '/fixture/project')
    await dialog.getByRole('button', { name: /Download all files/ }).click()
    await page.waitForFunction(() => (globalThis as unknown as { downloads: unknown[] }).downloads.length === 2)
    const archive = new URL(await page.evaluate(() => (globalThis as unknown as { downloads: { href: string }[] }).downloads[1].href))
    assert.equal(archive.pathname, '/api/project-actions/archive')
    assert.equal(archive.searchParams.get('runId'), 'run-debug')
    assert.equal(archive.searchParams.get('path'), 'apps/mobile')
    assert.equal(archive.searchParams.get('workspacePath'), '/fixture/project')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Toggle actions', exact: true }).click()
    await openAction('Build')
    dialog = page.getByRole('dialog', { name: 'Build', exact: true })
    await dialog.getByRole('button', { name: 'Edit Debug build', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit action', exact: true })
    assert.equal(await editor.locator('select,datalist').count(), 0)
    await editor.getByLabel('Name', { exact: true }).fill('Local debug')
    if (process.env.MEW_PROJECT_ACTION_SCREENSHOTS) await editor.screenshot({ path: path.join(process.env.MEW_PROJECT_ACTION_SCREENSHOTS, `project-actions-editor-${width}-${dark ? 'dark' : 'light'}.png`) })
    await editor.getByRole('combobox', { name: 'Variant', exact: true }).focus()
    await page.keyboard.press('ArrowDown')
    failSave = true
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await editor.getByText('Cannot save actions', { exact: true }).waitFor()
    assert.equal(await editor.getByLabel('Name', { exact: true }).inputValue(), 'Local debug')
    await editor.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByRole('button', { name: 'Local debug', exact: true }).waitFor()
    assert.equal(actions[0].variant, 'release')
    await dialog.getByRole('button', { name: 'Add action', exact: true }).click()
    const added = page.getByRole('dialog', { name: 'Add action', exact: true })
    await added.getByLabel('Name', { exact: true }).fill('Package app')
    await added.getByLabel('Command', { exact: true }).fill('npm run package')
    await added.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByRole('button', { name: 'Package app', exact: true }).waitFor()
    assert.equal(actions.at(-1)?.command, 'npm run package')
    await dialog.getByRole('button', { name: 'Edit Package app', exact: true }).click()
    await page.getByRole('dialog', { name: 'Edit action', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Package app', exact: true }).waitFor({ state: 'hidden' })
    await Promise.all([page.waitForResponse(response => response.url().includes('/api/project-actions/discover')), dialog.getByRole('button', { name: 'Discover actions', exact: true }).click()])
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await openAction('Deploy')
    dialog = page.getByRole('dialog', { name: 'Deploy', exact: true })
    await dialog.getByRole('button', { name: 'Preview deployment', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Configure with agent', exact: true }).click()
    const setup = page.getByRole('dialog', { name: 'Agent setup' })
    await setup.getByText('/fixture/project/apps/mobile', { exact: true }).waitFor()
    await Promise.all([page.waitForResponse(response => response.url().includes('/api/project-actions?')), setup.getByRole('button', { name: 'Close setup', exact: true }).click()])
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    failLoad = true
    await openAction('Build')
    dialog = page.getByRole('dialog', { name: 'Build', exact: true })
    await dialog.getByText('Actions are unavailable', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await dialog.getByRole('button', { name: 'Local debug', exact: true }).waitFor()
    for (const request of requests) {
      if (request.body) {
        assert.equal(request.body.project, '.workspace'); assert.equal(request.body.path, 'apps/mobile'); assert.equal(request.body.workspacePath, '/fixture/project')
      } else {
        assert.equal(request.url.searchParams.get('project'), '.workspace'); assert.equal(request.url.searchParams.get('path'), 'apps/mobile'); assert.equal(request.url.searchParams.get('workspacePath'), '/fixture/project')
      }
    }
    assert.equal(await page.evaluate(() => (globalThis as unknown as { notices: unknown[] }).notices.length), 1, 'completed runs notify once')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
