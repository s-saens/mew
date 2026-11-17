import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import type { Page } from 'playwright-core'
import type { CommandButtonResult } from '../shared/command-button-result.ts'
import { connectTestBrowser } from './test-browser.ts'

type Fixture = {
  result: CommandButtonResult | null
  nextRun: CommandButtonResult | null
  runs: number
  changes: number
  failRun: boolean
  holdNext: boolean
  holding: boolean
  release?: () => void
}

async function updateFixture(page: Page, patch: Partial<Fixture>) {
  await page.locator('#root').evaluate((el, value) => {
    Object.assign((el.ownerDocument.defaultView as unknown as { fx: Fixture }).fx, value)
  }, patch)
}

async function fixture(page: Page): Promise<Fixture> {
  return page.locator('#root').evaluate(el => (el.ownerDocument.defaultView as unknown as { fx: Fixture }).fx)
}

test('one-shot command popup restores output and follows new and fast executions', { timeout: 45_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {CommandButtonResultPopup} from '${root}/src/components/CommandButtonResultPopup.tsx';
localStorage.setItem('mew:locale','ko');
const completed = {command:'old command',state:'completed',exitCode:0,text:'saved success output',archived:true};
const live = {command:'current command',state:'running',exitCode:null};
window.fx = {result:location.search.includes('idle')?null:location.search.includes('live')?live:completed,nextRun:live,runs:0,changes:0,failRun:false,holdNext:false,holding:false};
function App(){
  const [open,setOpen]=React.useState(true);
  const button={name:'Fixture',command:'current command',session:'mewcmd-fixture',oneShot:true,running:location.search.includes('live'),ports:[]};
  async function fetchResult(){
    const result=window.fx.result ? {...window.fx.result} : null;
    if(window.fx.holdNext){ window.fx.holdNext=false; window.fx.holding=true; await new Promise(resolve=>{window.fx.release=resolve}); window.fx.holding=false; }
    return {result};
  }
  async function onRun(){window.fx.runs++;if(window.fx.failRun)throw new Error('run failed');window.fx.result=window.fx.nextRun;}
  return <I18nProvider><button onClick={()=>setOpen(true)}>Reopen</button>{open && <CommandButtonResultPopup button={button} onClose={()=>setOpen(false)} onChanged={()=>window.fx.changes++} onRun={onRun} fetchResult={fetchResult} archiveUrl="/archive"/>}</I18nProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);`
  const bundle = await build({ input: 'virtual:command-result.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'command-result-fixture',
    resolveId(id) { if (id.startsWith('virtual:')) return id; if (id === '@mew/tmux-term') return 'virtual:terminal.tsx'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:command-result.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:terminal.tsx') return `import React from 'react';export function TmuxTerminal(){return <div data-terminal><textarea aria-label="live terminal" defaultValue="live output" /></div>}`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/SessionTerminalPopup.tsx', 'src/components/CommandButtonResultPopup.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  async function openPage(query = '', width = 1100) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, locale: 'ko-KR' })
    page.setDefaultTimeout(7000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://command-result.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script>${chunk.code}</script></body></html>` }))
    await page.goto(`http://command-result.test/${query}`)
    return { page, errors }
  }

  for (const width of [1100, 390]) {
    const { page, errors } = await openPage('', width)
    const dialog = page.getByRole('dialog', { name: 'Fixture' })
    const output = dialog.locator('pre[tabindex="0"][aria-label="저장된 터미널 출력"]')
    await dialog.getByText('saved success output').waitFor()
    assert.equal(await dialog.locator('[data-terminal]').count(), 0)
    assert.equal(await dialog.locator('a').count(), 1, await dialog.textContent() ?? '')
    assert.equal(await dialog.locator('a').textContent(), '전체 출력 다운로드')
    assert.equal(await dialog.locator('a').getAttribute('href'), '/archive')
    assert.match(await dialog.textContent() ?? '', /완료 · 종료 코드 0/)
    assert.ok(await dialog.getByText('old command').isVisible(), 'saved result identifies the command that produced it')
    await updateFixture(page, { failRun: true })
    await dialog.getByRole('button', { name: '실행', exact: true }).click()
    assert.equal(await dialog.getByRole('alert').textContent(), 'run failed')
    assert.ok(await dialog.getByText('saved success output').isVisible(), 'a failed start keeps the saved output')
    await updateFixture(page, { failRun: false, nextRun: { command: 'current command', state: 'failed', exitCode: 7, text: 'fast failure output' } })
    await dialog.getByRole('button', { name: '실행', exact: true }).click()
    await dialog.getByText('fast failure output').waitFor()
    assert.match(await dialog.textContent() ?? '', /실패 · 종료 코드 7/)
    assert.equal(await dialog.getByText('saved success output').count(), 0)
    assert.equal(await dialog.getByRole('link', { name: '전체 출력 다운로드' }).count(), 0)
    assert.equal((await fixture(page)).runs, 2)
    assert.ok(await output.isVisible(), 'saved output is accessible and selectable')
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    await page.getByRole('button', { name: 'Reopen' }).click()
    await page.getByRole('dialog', { name: 'Fixture' }).getByText('fast failure output').waitFor()
    assert.deepEqual(errors, [])
    await page.close()
  }

  const live = await openPage('?live')
  const liveDialog = live.page.getByRole('dialog', { name: 'Fixture' })
  await liveDialog.getByRole('textbox', { name: 'live terminal' }).waitFor()
  await updateFixture(live.page, { result: { command: 'current command', state: 'completed', exitCode: 0, text: 'finished while open' } })
  await liveDialog.getByText('finished while open').waitFor()
  assert.equal(await liveDialog.locator('[data-terminal]').count(), 0)
  assert.ok((await fixture(live.page)).changes >= 1)
  assert.deepEqual(live.errors, [])
  await live.page.close()

  const idle = await openPage('?idle')
  const idleDialog = idle.page.getByRole('dialog', { name: 'Fixture' })
  await idleDialog.getByRole('button', { name: '실행', exact: true }).waitFor()
  await updateFixture(idle.page, { nextRun: { command: 'current command', state: 'completed', exitCode: 0, text: 'fast first run' } })
  await idleDialog.getByRole('button', { name: '실행', exact: true }).click()
  await idleDialog.getByText('fast first run').waitFor()
  assert.equal((await fixture(idle.page)).runs, 1)
  assert.deepEqual(idle.errors, [])
  await idle.page.close()

  const race = await openPage()
  const raceDialog = race.page.getByRole('dialog', { name: 'Fixture' })
  await raceDialog.getByText('saved success output').waitFor()
  await updateFixture(race.page, { holdNext: true, nextRun: { command: 'current command', state: 'completed', exitCode: 0, text: 'newer output' } })
  const rootHandle = await race.page.locator('#root').elementHandle()
  await race.page.waitForFunction(el => (el!.ownerDocument.defaultView as unknown as { fx: Fixture }).fx.holding, rootHandle)
  await raceDialog.getByRole('button', { name: '실행', exact: true }).click()
  await raceDialog.getByText('newer output').waitFor()
  await race.page.locator('#root').evaluate(el => (el.ownerDocument.defaultView as unknown as { fx: Fixture }).fx.release?.())
  await race.page.waitForTimeout(200)
  assert.ok(await raceDialog.getByText('newer output').isVisible(), 'an older pending read cannot overwrite the new run')
  assert.deepEqual(race.errors, [])
  await race.page.close()
})
