import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { parse } from 'yaml'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { mergeTaskFrontmatter } from '../packages/editor/src/utils/task-frontmatter-merge.ts'

async function taskSaveScript(): Promise<string> {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {useTabs} from ${JSON.stringify(path.join(root, 'src/hooks/useTabs.ts'))};
import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
import {syncTaskDocuments,withTaskDocumentSync} from ${JSON.stringify(path.join(root, 'src/utils/task-document-sync.ts'))};
import {getCachedFile} from ${JSON.stringify(path.join(root, 'src/utils/contentCache.ts'))};
window.syncTasks=(before,after,mode='read')=>withTaskDocumentSync('/fixture',()=>syncTaskDocuments('/fixture',before,after),mode);
window.taskCache=()=>getCachedFile('docs','tasks/Task.md');
function Fixture(){const tabs=useTabs('docs',()=>{},()=>{},'/fixture');window.tabs=tabs;return <button onClick={()=>tabs.openFile('tasks/Task.md')}>Open task</button>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:task-save.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'task-save-fixture', resolveId: id => id === 'virtual:task-save.tsx' ? id : id.endsWith('.css') ? 'virtual:style' : undefined, load: id => id === 'virtual:task-save.tsx' ? source : id === 'virtual:style' ? '' : undefined }],
  })
  return bundle.output.find(item => item.type === 'chunk')!.code
}

test('task deletion closes saved tabs, preserves unsaved drafts and never recreates deleted files', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const script = await taskSaveScript()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable()!, args: ['--no-sandbox'], headless: true })
  const original = '---\ntitle: Task\ndone: false\n---\nBody'
  const task = { id: 'task', text: 'Task', done: false, path: 'docs/tasks/Task.md' }
  try {
    for (const dirty of [false, true]) await t.test(dirty ? 'read preserves an unsaved deleted document without flushing it' : 'read removes the saved tab and its cache', async () => {
      const page = await browser.newPage()
      const disk = new Map([['tasks/Task.md', original]])
      const writes: string[] = [], errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-task-deletion.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname === '/api/file') {
          if (request.method() === 'GET') {
            const content = disk.get(url.searchParams.get('path')!)
            return content === undefined ? route.fulfill({ status: 404, json: { error: 'Missing' } }) : route.fulfill({ json: { content, editable: true } })
          }
          const input = request.postDataJSON() as { path: string; content: string }
          writes.push(input.path); disk.set(input.path, input.content)
          return route.fulfill({ json: { ok: true } })
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
      })
      await page.goto('http://mew-task-deletion.test/')
      await page.getByRole('button', { name: 'Open task' }).click()
      await page.waitForFunction('window.tabs.activeTab?.content.includes("Body")')
      if (dirty) {
        await page.evaluate('window.tabs.updateTabContent("tasks/Task.md",window.tabs.activeTab.content+" unsaved draft")')
        await page.waitForFunction('window.tabs.activeTab.content.endsWith("unsaved draft")')
      }
      disk.delete('tasks/Task.md')
      await page.evaluate(`window.syncTasks([${JSON.stringify(task)}],[])`)
      await page.waitForFunction(dirty ? 'window.tabs.activeTab?.editable === false && window.tabs.activeTab.status === "error"' : 'window.tabs.tabs.length === 0')
      if (dirty) {
        assert.equal(await page.evaluate('window.tabs.activeTab.content'), `${original} unsaved draft`)
        assert.equal(await page.evaluate('window.tabs.activeTab.savedContent'), original)
        await page.evaluate('window.tabs.saveCurrentTab()')
      }
      await page.waitForTimeout(800)
      assert.deepEqual(writes, [], 'deletion cancels pending autosave and the read preparation does not save missing files')
      assert.equal(disk.has('tasks/Task.md'), false)
      assert.equal(await page.evaluate('window.taskCache()'), undefined)
      assert.deepEqual(errors, [])
      await page.close()
    })
    await t.test('deletion waits for an in-flight save and retains typing without replaying its queued autosave', async () => {
      const page = await browser.newPage()
      let disk: string | undefined = original, release!: () => void, markReceived!: () => void
      const delayed = new Promise<void>(resolve => { release = resolve })
      const received = new Promise<void>(resolve => { markReceived = resolve })
      const writes: string[] = []
      await page.route('http://mew-task-inflight-delete.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname === '/api/file') {
          if (request.method() === 'GET') return route.fulfill({ json: { content: disk, editable: true } })
          const input = request.postDataJSON() as { content: string }
          writes.push(input.content); disk = input.content
          markReceived(); await delayed
          return route.fulfill({ json: { ok: true } })
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
      })
      try {
        await page.goto('http://mew-task-inflight-delete.test/')
        await page.getByRole('button', { name: 'Open task' }).click()
        await page.waitForFunction('window.tabs.activeTab?.content.includes("Body")')
        await page.evaluate('window.tabs.updateTabContent("tasks/Task.md",window.tabs.activeTab.content+" saving")')
        await received
        await page.evaluate('window.tabs.updateTabContent("tasks/Task.md",window.tabs.activeTab.content+" pending")')
        await page.waitForTimeout(600)
        await page.evaluate(`window.deletion=window.syncTasks([${JSON.stringify(task)}],[]);void 0`)
        assert.equal(await page.evaluate('window.tabs.activeTab.editable'), true)
        disk = undefined
        release()
        await page.evaluate('window.deletion')
        await page.waitForFunction('window.tabs.activeTab?.editable === false && window.tabs.activeTab.content.endsWith("saving pending")')
        assert.equal(await page.evaluate('window.tabs.activeTab.savedContent'), `${original} saving`)
        await page.waitForTimeout(800)
        assert.equal(writes.length, 1)
        assert.equal(disk, undefined)
      } finally { release(); await page.close() }
    })
    await t.test('same-ID rename preserves the tab and a subsequent creation refreshes its file', async () => {
      const page = await browser.newPage()
      const disk = new Map([['tasks/Task.md', original]])
      await page.route('http://mew-task-rename.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/file') return route.fulfill({ json: { content: disk.get(url.searchParams.get('path')!), editable: true } })
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
      })
      await page.goto('http://mew-task-rename.test/')
      await page.getByRole('button', { name: 'Open task' }).click()
      await page.waitForFunction('window.tabs.activeTab?.content.includes("Body")')
      const id = await page.evaluate('window.tabs.activeTab.id')
      const renamed = { ...task, text: 'Renamed', path: 'docs/tasks/Renamed.md' }
      disk.set('tasks/Renamed.md', original.replace('Task', 'Renamed'))
      disk.delete('tasks/Task.md')
      await page.evaluate(`window.syncTasks([${JSON.stringify(task)}],[${JSON.stringify(renamed)}])`)
      await page.waitForFunction('window.tabs.activePath === "tasks/Renamed.md" && window.tabs.activeTab.content.includes("Renamed")')
      assert.equal(await page.evaluate('window.tabs.activeTab.id'), id)
      assert.equal(await page.evaluate('window.tabs.tabs.length'), 1)
      disk.set('tasks/Renamed.md', `${original.replace('Task', 'Renamed')} created`)
      await page.evaluate(`window.syncTasks([],[${JSON.stringify(renamed)}])`)
      await page.waitForFunction('window.tabs.activeTab.content.endsWith("created")')
      assert.equal(await page.evaluate('window.tabs.activeTab.id'), id)
      await page.close()
    })
  } finally { await browser.close() }
})

test('open tabs rebase server-preserved tags while retaining typing during autosave', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const script = await taskSaveScript()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable()!, args: ['--no-sandbox'], headless: true })
  const original = '---\ntitle: Task\ndone: false\n---\nBody'
  let disk = original, release!: () => void, markReceived!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  const received = new Promise<void>(resolve => { markReceived = resolve })
  const writes: { content: string; expectedContent: string }[] = []
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-task-save.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/file') {
        if (route.request().method() === 'GET') return route.fulfill({ json: { content: disk, editable: true } })
        const request = route.request().postDataJSON() as { content: string; expectedContent: string }
        writes.push(request)
        const saved = mergeTaskFrontmatter(request.expectedContent, request.content, disk)
        disk = saved
        if (writes.length === 1) { markReceived(); await delayed }
        return route.fulfill({ json: { ok: true, commit: null, ...(saved !== request.content ? { content: saved } : {}) } })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
    })
    await page.goto('http://mew-task-save.test/')
    await page.getByRole('button', { name: 'Open task' }).click()
    await page.waitForFunction('window.tabs.activeTab?.content.includes("Body")')
    disk = original.replace('done: false', 'done: false\ntags: [기능]\nassignees: [alice@example.test]')
    await page.evaluate('window.tabs.updateTabContent("tasks/Task.md",window.tabs.activeTab.content+" first")')
    await received
    await page.evaluate('window.tabs.updateTabContent("tasks/Task.md",window.tabs.activeTab.content+" pending")')
    release()
    await page.waitForFunction('window.tabs.activeTab.content.includes("기능") && window.tabs.activeTab.content.endsWith("first pending")')
    await page.waitForFunction('window.tabs.activeTab.status === "saved"')
    assert.ok(writes.length >= 2)
    assert.equal(writes[0].expectedContent, original)
    assert.deepEqual(parse(disk.split('---')[1]).tags, ['기능'])
    assert.deepEqual(parse(disk.split('---')[1]).assignees, ['alice@example.test'])
    assert.ok(disk.endsWith('first pending'))
    assert.deepEqual(errors, [])
  } finally { release(); await browser.close() }
})

for (const waitPastDebounce of [false, true]) {
  test(`consecutive title edits use the acknowledged autosave baseline (${waitPastDebounce ? 'response after debounce' : 'response before debounce'})`, { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
    const script = await taskSaveScript()
    const browser = await chromium.launch({ executablePath: domBrowserExecutable()!, args: ['--no-sandbox'], headless: true })
    const original = '---\ntitle: Task\ndescription: "태스크: Task"\ndone: false\n---\nBody'
    const first = original.replaceAll('Task', 'First') + ' first'
    const pending = first.replaceAll('First', 'Pending') + ' pending'
    let disk = original, release!: () => void, markReceived!: () => void
    const delayed = new Promise<void>(resolve => { release = resolve })
    const received = new Promise<void>(resolve => { markReceived = resolve })
    const writes: { content: string; expectedContent: string }[] = []
    const conflicts: string[] = []
    try {
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-task-save.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/file') {
          if (route.request().method() === 'GET') return route.fulfill({ json: { content: disk, editable: true } })
          const request = route.request().postDataJSON() as { content: string; expectedContent: string }
          writes.push(request)
          try {
            disk = mergeTaskFrontmatter(request.expectedContent, request.content, disk)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            conflicts.push(message)
            return route.fulfill({ status: 409, json: { error: message } })
          }
          if (writes.length === 1) { markReceived(); await delayed }
          return route.fulfill({ json: { ok: true, commit: null } })
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
      })
      await page.goto('http://mew-task-save.test/')
      await page.getByRole('button', { name: 'Open task' }).click()
      await page.waitForFunction('window.tabs.activeTab?.content.includes("Body")')
      await page.evaluate(`window.tabs.updateTabContent('tasks/Task.md', ${JSON.stringify(first)})`)
      await received
      await page.evaluate(`window.tabs.updateTabContent('tasks/Task.md', ${JSON.stringify(pending)})`)
      if (waitPastDebounce) {
        await page.waitForTimeout(750)
        assert.equal(writes.length, 1, 'a pending edit waits for the previous save to be acknowledged')
      }
      release()
      await page.waitForFunction(`window.tabs.activeTab.content === ${JSON.stringify(pending)} && window.tabs.activeTab.savedContent === ${JSON.stringify(pending)} && window.tabs.activeTab.status === 'saved'`, undefined, { timeout: 5_000 })
      assert.equal(writes.length, 2)
      assert.equal(writes[0].content, first)
      assert.equal(writes[0].expectedContent, original)
      assert.equal(writes[1].content, pending)
      assert.equal(writes[1].expectedContent, first)
      assert.equal(disk, pending)
      assert.deepEqual(conflicts, [])
      assert.deepEqual(errors, [])
    } finally { release(); await browser.close() }
  })
}
