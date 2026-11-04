import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('Hotview voice records, retries uploads, preserves location and cancels stale sessions', { timeout: 90_000 }, async t => {
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {Editor} from '${root}/packages/editor/src/Editor.tsx';
import {setUiLocale} from '${root}/packages/ui/src/i18n-core.ts';
setUiLocale('en');
window.stops=0;window.uploads=[];window.failUpload=true;window.permissionPending=false;
const stream=()=>({getTracks:()=>[{stop(){window.stops++}}]});
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>window.permissionPending?new Promise(resolve=>{window.grant=()=>resolve(stream())}):Promise.resolve(stream())}});
window.MediaRecorder=class{
 static isTypeSupported(type){return type==='audio/webm;codecs=opus'}
 state='inactive';mimeType='audio/webm;codecs=opus';
 start(){this.state='recording'}
 stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.()})}
};
const api={uploadAsset:async file=>{window.uploads.push({name:file.name,type:file.type,size:file.size});if(window.failUpload)throw Error('offline');if(window.deferUpload)return new Promise(resolve=>{window.finishUpload=()=>resolve({url:'/api/asset/voice.webm',name:file.name,mimetype:file.type})});return {url:'/api/asset/voice.webm',name:file.name,mimetype:file.type}},db:{}};
function Fixture(){const [value,setValue]=React.useState('Before\\n\\nAfter'),[doc,setDoc]=React.useState('one.md'),[readOnly,setReadOnly]=React.useState(false);window.saved=value;window.switchDoc=()=>{setDoc('two.md');setValue('Other document')};window.lock=()=>setReadOnly(true);return <Editor api={api} path={doc} value={value} onChange={setValue} readOnly={readOnly}/>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    input: 'virtual:voice.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'voice-fixture', resolveId(id) { if (id === 'virtual:voice.tsx') return id }, async load(id) {
      if (id === 'virtual:voice.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g) ?? [])]) + styles.join('\n')
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    page.setDefaultTimeout(5000)
    await page.route('https://mew-voice.test/**', route => new URL(route.request().url()).pathname === '/app.js'
      ? route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      : route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><style>${css}html,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` }))
    try {
      await page.goto('https://mew-voice.test/')
      const body = page.locator('.tiptap')
      await body.waitFor()
      const open = async () => {
        await body.locator('p').last().click()
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
        await page.keyboard.type('/voice')
        await page.getByRole('button', { name: 'Voice recording Record and insert audio' }).click()
      }
      await open()
      const group = page.getByRole('group', { name: 'Voice recording', exact: true })
      await group.waitFor()
      const bounds = await group.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width)
      await group.getByRole('button', { name: 'Start recording', exact: true }).click()
      await group.getByRole('button', { name: 'Stop recording', exact: true }).click()
      await group.getByRole('alert').waitFor()
      assert.equal(await group.locator('audio').count(), 1, 'a failed upload keeps local playback')
      assert.equal(await page.evaluate('window.stops'), 1)
      await body.locator('p').first().click()
      await page.keyboard.press('Home')
      await page.keyboard.type('Inserted ')
      await page.evaluate('window.failUpload=false')
      await group.getByRole('button', { name: 'Retry', exact: true }).click()
      await group.waitFor({ state: 'detached' })
      assert.equal(await body.locator('audio').getAttribute('src'), '/api/asset/voice.webm')
      assert.match(await page.evaluate<string>('window.saved'), /Inserted Before[\s\S]*After[\s\S]*<audio src="\/api\/asset\/voice.webm" controls><\/audio>/)
      assert.equal(await page.evaluate('window.uploads.length'), 2)
      await open()
      await page.evaluate('window.permissionPending=true')
      await group.getByRole('button', { name: 'Start recording', exact: true }).click()
      await group.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.evaluate('window.grant();window.permissionPending=false')
      await page.waitForFunction('window.stops===2')
      await open()
      await group.getByRole('button', { name: 'Start recording', exact: true }).click()
      await page.evaluate('window.deferUpload=true')
      await group.getByRole('button', { name: 'Stop recording', exact: true }).click()
      await page.waitForFunction('!!window.finishUpload')
      await page.evaluate('window.switchDoc()')
      await group.waitFor({ state: 'detached' })
      await page.evaluate('window.finishUpload()')
      assert.equal(await body.locator('audio').count(), 0, 'late upload cannot alter the new document')
      await open()
      await group.getByRole('button', { name: 'Start recording', exact: true }).click()
      await page.evaluate('window.lock()')
      await group.waitFor({ state: 'detached' })
      await page.waitForFunction('window.stops===4')
    } finally { await page.close() }
  }
})
