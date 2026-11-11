import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { connectTestBrowser } from '../../server/test-browser.ts'

const origin = 'http://speech-fixture.test'
async function fixtureBundle() {
  const component = new URL('./SpeechInputButton.tsx', import.meta.url).pathname
  const settings = new URL('./SpeechSettings.tsx', import.meta.url).pathname
  const dialog = new URL('../../packages/ui/src/dialog-frame.tsx', import.meta.url).pathname
  const source = `import React from 'react';import{createRoot}from'react-dom/client';import{SpeechInputButton}from${JSON.stringify(component)};import{SpeechSettings}from${JSON.stringify(settings)};
    window.inserted=[];window.revision='';window.captures=0;window.saves=[];window.installs=0;window.hasKey=true;
    createRoot(document.getElementById('root')).render(<><button>Outside</button><SpeechInputButton onTranscript={text=>window.inserted.push(text)}/><SpeechSettings portalContainer={null}/></>);`
  const bundle = await build({ input: 'virtual:fixture.tsx', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, plugins: [{
    name: 'speech-browser-fixture',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id === '@mew/ui') return 'virtual:ui'
      if (id === '@mew/ui/i18n-core') return 'virtual:locale'
      if (id === '../i18n') return 'virtual:i18n'
      if (id.endsWith('/voiceCapture')) return 'virtual:capture'
      if (id === './api') return 'virtual:api'
      if (id === './audio') return 'virtual:audio'
    },
    load(id) {
      if (id === 'virtual:fixture.tsx') return source
      if (id === 'virtual:ui') return `import React from 'react';export {DialogFrame} from ${JSON.stringify(dialog)};export const HoverTipLayer=({children})=>children;export const SelectField=({value})=>React.createElement('span',null,value);`
      if (id === 'virtual:locale') return 'export const uiText=(key)=>key;'
      if (id === 'virtual:i18n') return 'export const useI18n=()=>({locale:"ko"});'
      if (id === 'virtual:capture') return 'export const beginVoiceCapture=async()=>{window.captures++;return {cancel(){},stop:async()=>new Blob(["audio"])}};'
      if (id === 'virtual:audio') return 'export const MAX_RECORDING_MS=60000;export const convertToWav=async(blob)=>blob;'
      if (id === 'virtual:api') return `export const fetchSpeech=async()=>({config:{provider:'openai',baseUrl:'https://voice.example/v1',model:window.savedModel??'whisper-1',language:'ko',hasApiKey:window.hasKey,allowModelDownload:false},revision:'revision-1',canInstall:true,canManage:true,install:{state:'idle',output:'',installed:false}});export const transcribeSpeech=async(_audio,revision)=>{window.revision=revision;return{text:'인식 결과'}};export const saveSpeech=async config=>{window.saves.push(config);window.savedModel=config.model;if(config.apiKey==='')window.hasKey=false;return{config}};export const testSpeech=async()=>({ok:true,message:'ok'});export const installSpeech=async()=>{window.installs++;return{install:{state:'succeeded',output:'',installed:true}}};`
    },
  }] })
  const scripts = new Map(bundle.output.filter(item => item.type === 'chunk').map(item => ['/' + item.fileName, item.code]))
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  // Fixture CSS supplies only the layout utilities needed to exercise the real dialog frame.
  const html = `<html><head><style>*{box-sizing:border-box}body{margin:0;font:14px sans-serif}.mew-dialog-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:12px}.mew-dialog{width:100%;max-width:512px;max-height:90dvh;overflow-y:auto;padding:16px;background:white}.flex{display:flex}.justify-end{justify-content:flex-end}.justify-between{justify-content:space-between}.gap-2{gap:8px}.mt-3{margin-top:12px}.mb-3{margin-bottom:12px}.w-full{width:100%}button{min-height:32px}textarea{width:100%}</style></head><body><div id="root"></div><script type="module" src="/${entry.fileName}"></script></body></html>`
  return { scripts, html }
}

test('speech dialog fits mobile and desktop, contains focus, restores focus, and inserts only on confirmation', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [390, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(`${origin}/**`, route => {
      const script = fixture.scripts.get(new URL(route.request().url()).pathname)
      return route.fulfill(script ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: fixture.html })
    })
    await page.goto(origin)
    const open = page.getByRole('button', { name: '음성 인식' })
    await open.click()
    const dialog = page.getByRole('dialog', { name: '음성 인식' })
    await dialog.getByText('https://voice.example/v1', { exact: false }).waitFor()
    assert.equal(await page.evaluate('window.captures'), 0)
    const bounds = await dialog.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 700)
    await page.getByRole('button', { name: 'Outside' }).focus()
    assert.equal(await dialog.evaluate(element => element.contains(element.ownerDocument.activeElement)), true)
    await page.keyboard.press('Escape')
    assert.equal(await dialog.count(), 0)
    assert.equal(await open.evaluate(element => element.ownerDocument.activeElement === element), true)
    await open.click()
    await dialog.getByText('https://voice.example/v1', { exact: false }).waitFor()
    await dialog.getByRole('button', { name: '녹음 시작' }).click()
    await dialog.getByRole('button', { name: '녹음 종료 및 변환' }).click()
    assert.equal(await dialog.getByRole('textbox').inputValue(), '인식 결과')
    assert.deepEqual(await page.evaluate('window.inserted'), [])
    assert.equal(await page.evaluate('window.revision'), 'revision-1')
    await dialog.getByRole('button', { name: '삽입' }).click()
    assert.deepEqual(await page.evaluate('window.inserted'), ['인식 결과'])
    await open.click()
    await dialog.getByText('https://voice.example/v1', { exact: false }).waitFor()
    await page.goBack()
    await dialog.waitFor({ state: 'detached' })
    await open.click()
    await dialog.getByText('https://voice.example/v1', { exact: false }).waitFor()
    await dialog.getByRole('button', { name: '취소' }).last().click()
    assert.deepEqual(await page.evaluate('window.inserted'), ['인식 결과'])
    assert.deepEqual(errors, [])
    await page.close()
  }
})

test('settings retain an omitted key, explicitly clear a key, and install only on request', { timeout: 30_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await connectTestBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  await page.route(`${origin}/**`, route => {
    const script = fixture.scripts.get(new URL(route.request().url()).pathname)
    return route.fulfill(script ? { contentType: 'text/javascript', body: script } : { contentType: 'text/html', body: fixture.html })
  })
  await page.goto(origin)
  const model = page.getByRole('textbox', { name: '모델' })
  await model.waitFor()
  assert.equal(await page.evaluate('window.installs'), 0)
  await model.fill('another-model')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await page.getByText('설정을 저장했습니다.').waitFor()
  assert.equal(await page.evaluate(`Object.hasOwn(window.saves[0], 'apiKey')`), false)
  await page.getByRole('checkbox', { name: '저장된 키 지우기' }).check()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  assert.equal(await page.evaluate('window.saves[1].apiKey'), '')
  assert.equal(await page.evaluate('window.installs'), 0)
  await page.getByRole('button', { name: '설치', exact: true }).click()
  assert.equal(await page.evaluate('window.installs'), 1)
  await page.close()
})
