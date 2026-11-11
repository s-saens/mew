import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { build } from 'rolldown'

const win = new Window({ url: 'http://localhost' })
const globals = win as unknown as Record<string, unknown>
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'MutationObserver']) {
  if (!(key in globalThis)) Object.defineProperty(globalThis, key, { configurable: true, value: globals[key] })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
const React = await import('react')
const { createRoot } = await import('react-dom/client')
const bundle = await build({
  input: 'virtual:speech', write: false, platform: 'node', output: { format: 'esm' }, transform: { jsx: 'react-jsx' },
  plugins: [{
    name: 'speech-fixture',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id === 'react' || id.startsWith('react/') || id === 'react-dom' || id.startsWith('react-dom/')) return { id: import.meta.resolve(id), external: true }
      if (id === 'iconoir-react') return 'virtual:icons'
      if (id === '@mew/ui') return 'virtual:ui'
      if (id === '@mew/ui/i18n-core') return 'virtual:locale'
      if (id === '../i18n') return 'virtual:i18n'
      if (id.endsWith('/voiceCapture')) return 'virtual:capture'
      if (id === './api') return 'virtual:api'
      if (id === './audio') return 'virtual:audio'
    },
    load(id) {
      if (id === 'virtual:speech') return `export { SpeechInputButton } from ${JSON.stringify(new URL('./SpeechInputButton.tsx', import.meta.url).pathname)};`
      if (id === 'virtual:icons') return 'export const Microphone=()=>null,Xmark=()=>null;'
      if (id === 'virtual:ui') return 'import React from "react";export const HoverTipLayer=({children})=>children;export const DialogFrame=({children})=>React.createElement("div",{role:"dialog"},children);'
      if (id === 'virtual:locale') return 'export const uiText=(key)=>key;'
      if (id === 'virtual:i18n') return 'export const useI18n=()=>({locale:"ko"});'
      if (id === 'virtual:capture') return 'export const beginVoiceCapture=(signal)=>globalThis.__speechFixture.begin(signal);'
      if (id === 'virtual:api') return 'export const fetchSpeech=(signal)=>globalThis.__speechFixture.fetch(signal);export const transcribeSpeech=(audio,revision,signal)=>globalThis.__speechFixture.transcribe(audio,revision,signal);'
      if (id === 'virtual:audio') return 'export const MAX_RECORDING_MS=60000;export const convertToWav=async(blob)=>blob;'
    },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
const { SpeechInputButton } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`) as { SpeechInputButton: typeof import('./SpeechInputButton.tsx').SpeechInputButton }

const fixtureState = () => ({ config: { provider: 'openai', baseUrl: 'https://voice.example/v1', model: 'whisper-1', language: 'ko', hasApiKey: false, allowModelDownload: false }, revision: 'revision-1', canInstall: false, canManage: true, install: { state: 'idle', output: '', installed: false } })

test('discloses destination before mic and preserves transcript when target changes', async t => {
  let starts = 0, captured = 0, canceled = 0, attempts = 0, received = '', revision = ''
  const fx = {
    fetch: async () => fixtureState(),
    begin: async () => { captured++; return { cancel: () => { canceled++ }, stop: async () => new Blob(['audio']) } },
    transcribe: async (_audio: Blob, current: string) => { revision = current; return { text: '인식 결과' } },
  }
  Object.defineProperty(globalThis, '__speechFixture', { configurable: true, value: fx })
  const container = win.document.createElement('div'); win.document.body.append(container)
  const root = createRoot(container)
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); delete (globalThis as Record<string, unknown>).__speechFixture })
  await React.act(async () => root.render(React.createElement(SpeechInputButton, { onSessionStart: () => { starts++ }, onTranscript: text => { attempts++; if (attempts === 1) throw new Error('draft changed'); received = text } })))
  const click = async (label: string) => {
    const button = Array.from(win.document.querySelectorAll('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label)
    assert.ok(button, `missing button ${label}`)
    await React.act(async () => button.dispatchEvent(new win.MouseEvent('click', { bubbles: true })))
  }
  await click('음성 인식')
  assert.equal(starts, 1)
  assert.equal(captured, 0)
  assert.match(win.document.body.textContent ?? '', /https:\/\/voice\.example\/v1/)
  assert.match(win.document.body.textContent ?? '', /whisper-1/)
  await click('녹음 시작')
  assert.equal(captured, 1)
  await click('녹음 종료 및 변환')
  assert.equal(revision, 'revision-1')
  assert.equal(received, '')
  await click('삽입')
  assert.match(win.document.body.textContent ?? '', /draft changed/)
  assert.equal(win.document.querySelector('textarea')?.value, '인식 결과')
  await click('삽입')
  assert.equal(received, '인식 결과')
  assert.equal(win.document.querySelector('[role="dialog"]'), null)
  assert.equal(canceled, 0)
})

test('closing while permission is pending aborts capture and prevents transcription', async t => {
  let signal: AbortSignal | undefined, resolve: ((value: { cancel: () => void; stop: () => Promise<Blob> }) => void) | undefined
  let canceled = 0, requests = 0
  const fx = {
    fetch: async () => fixtureState(),
    begin: (value: AbortSignal) => { signal = value; return new Promise<{ cancel: () => void; stop: () => Promise<Blob> }>(done => { resolve = done }) },
    transcribe: async () => { requests++; return { text: '' } },
  }
  Object.defineProperty(globalThis, '__speechFixture', { configurable: true, value: fx })
  const container = win.document.createElement('div'); win.document.body.append(container)
  const root = createRoot(container)
  t.after(async () => { await React.act(async () => root.unmount()); container.remove(); delete (globalThis as Record<string, unknown>).__speechFixture })
  await React.act(async () => root.render(React.createElement(SpeechInputButton, { onTranscript: () => {} })))
  const click = async (label: string) => {
    const button = Array.from(win.document.querySelectorAll('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label)
    assert.ok(button)
    await React.act(async () => button.dispatchEvent(new win.MouseEvent('click', { bubbles: true })))
  }
  await click('음성 인식')
  await click('녹음 시작')
  await click('취소')
  assert.equal(signal?.aborted, true)
  await React.act(async () => resolve?.({ cancel: () => { canceled++ }, stop: async () => new Blob() }))
  assert.equal(canceled, 1)
  assert.equal(requests, 0)
})
