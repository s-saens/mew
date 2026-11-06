import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('input drafts follow working roots and ignore delayed setters from a previous root', { timeout: 20_000 }, async t => {
  const source = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useAgentInputDraft} from '${root}/src/hooks/use-agent-input-draft.ts';
const owners=[{account:'owner',projectPath:'/main',workspacePath:'/worktree'},{account:'owner',projectPath:'/other',workspacePath:'/other'}];
function Fixture(){const [index,setIndex]=useState(0);const [draft,setDraft]=useAgentInputDraft('same-tab',owners[index]);window.changeOwner=setIndex;window.captureWriter=()=>{window.delayedWriter=setDraft};return <textarea aria-label="Draft" value={draft} onChange={event=>setDraft(event.target.value)}/>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:drafts.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'draft-fixture', resolveId(id) { if (id === 'virtual:drafts.tsx') return id }, load(id) { if (id === 'virtual:drafts.tsx') return source } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('http://drafts.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
    ? { contentType: 'text/javascript', body: code }
    : { contentType: 'text/html', body: '<!doctype html><div id="root"></div><script src="/app.js"></script>' }))
  await page.goto('http://drafts.test/')
  const input = page.getByRole('textbox', { name: 'Draft' })
  await input.fill('Draft in worktree')
  await page.evaluate('window.captureWriter();window.changeOwner(1)')
  await page.waitForFunction('document.querySelector("textarea").value === ""')
  await input.fill('Draft in other project')
  await page.evaluate('window.delayedWriter("Late response from worktree")')
  assert.equal(await input.inputValue(), 'Draft in other project')
  await page.evaluate('window.changeOwner(0)')
  await page.waitForFunction('document.querySelector("textarea").value === "Draft in worktree"')
  await page.reload()
  assert.equal(await input.inputValue(), 'Draft in worktree')
  await page.evaluate('window.changeOwner(1)')
  await page.waitForFunction('document.querySelector("textarea").value === "Draft in other project"')
  assert.deepEqual(errors, [])
})
