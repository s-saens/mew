import test, { type TestContext } from 'node:test'
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

// Exercise the actual component and capture helper with presentation-only dependencies stubbed.
const bundle = await build({
  input: 'virtual:voice-component', write: false, platform: 'node', output: { format: 'esm' },
  transform: { jsx: 'react-jsx' },
  plugins: [{
    name: 'voice-component-fixture',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id === 'react' || id.startsWith('react/')) return { id: import.meta.resolve(id), external: true }
      if (id === 'iconoir-react') return 'virtual:icons'
      if (id === '@mew/ui') return 'virtual:tooltip'
      if (id.startsWith('@mew/ui/i18n')) return 'virtual:locale'
    },
    load(id) {
      if (id === 'virtual:voice-component') return `export {VoiceRecordingBlock} from ${JSON.stringify(new URL('./VoiceRecordingBlock.tsx', import.meta.url).pathname)};`
      if (id === 'virtual:icons') return 'export const Microphone=()=>null,Square=()=>null,RefreshDouble=()=>null,Xmark=()=>null;'
      if (id === 'virtual:tooltip') return 'export const HoverTipLayer=({children})=>children;'
      if (id === 'virtual:locale') return 'export const uiText=value=>value;export const useUiLocale=()=>"ko";'
    },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
const { VoiceRecordingBlock } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`) as {
  VoiceRecordingBlock: typeof import('./VoiceRecordingBlock.tsx').VoiceRecordingBlock
}

async function fixture(t: TestContext, options: { pendingPermission?: boolean; save?: (file: File) => Promise<void> } = {}) {
  const descriptors: Array<[object, string, PropertyDescriptor | undefined]> = []
  const replace = (target: object, key: string, value: unknown) => {
    descriptors.push([target, key, Object.getOwnPropertyDescriptor(target, key)])
    Object.defineProperty(target, key, { configurable: true, value })
  }
  let microphoneRequests = 0, releasedTracks = 0, cancels = 0
  const stream = { getTracks: () => [{ stop: () => { releasedTracks++ } }] }
  let grant: (value: typeof stream) => void = () => {}
  const permission = options.pendingPermission ? new Promise<typeof stream>(resolve => { grant = resolve }) : Promise.resolve(stream)
  const recorders: FakeRecorder[] = []
  class FakeRecorder {
    state = 'inactive'
    mimeType = 'audio/webm;codecs=opus'
    stopCalls = 0
    ondataavailable?: (event: { data: Blob }) => void
    onstop?: () => void
    static isTypeSupported(type: string) { return type === 'audio/webm;codecs=opus' }
    constructor() { recorders.push(this) }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.stopCalls++ }
    finish(value = 'recorded voice') {
      this.ondataavailable?.({ data: new Blob([value], { type: this.mimeType }) })
      this.onstop?.()
    }
  }
  replace(globalThis, 'MediaRecorder', FakeRecorder)
  replace(globalThis, 'navigator', { mediaDevices: { getUserMedia: () => { microphoneRequests++; return permission } } })
  const created: Blob[] = [], revoked: string[] = [], timers = new Set<number>()
  let nextTimer = 0
  replace(URL, 'createObjectURL', (blob: Blob) => { created.push(blob); return `blob:voice-test-${created.length}` })
  replace(URL, 'revokeObjectURL', (url: string) => { revoked.push(url) })
  replace(win, 'setInterval', () => { const id = ++nextTimer; timers.add(id); return id })
  replace(win, 'clearInterval', (id: number) => { timers.delete(id) })
  const container = win.document.createElement('div')
  win.document.body.append(container)
  const root = createRoot(container)
  const controller = new AbortController()
  const uploads: File[] = []
  let mounted = true
  const close = async () => { if (mounted) { mounted = false; await React.act(async () => root.unmount()) } }
  await React.act(async () => root.render(React.createElement(VoiceRecordingBlock, {
    signal: controller.signal,
    onSave: async file => { uploads.push(file); await options.save?.(file) },
    onCancel: () => { cancels++; controller.abort(); root.unmount(); mounted = false },
  })))
  t.after(async () => {
    await close()
    container.remove()
    for (const [target, key, descriptor] of descriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  })
  const button = (name: string) => {
    const found = container.querySelector(`button[aria-label="${name}"]`)
    assert.ok(found, `expected ${name} button`)
    return found
  }
  return {
    container, recorders, uploads, created, revoked, timers, controller, close,
    microphoneRequests: () => microphoneRequests,
    releasedTracks: () => releasedTracks,
    cancels: () => cancels,
    grant: () => grant(stream),
    click: async (name: string, twice = false) => {
      const target = button(name)
      await React.act(async () => { target.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); if (twice) target.dispatchEvent(new win.MouseEvent('click', { bubbles: true })) })
    },
  }
}

test('Start, Stop, preview, failed upload and retry preserve one recording and clean resources', async t => {
  let attempts = 0
  let finishUpload: () => void = () => {}
  const ui = await fixture(t, { save: async () => {
    if (++attempts === 1) throw new Error('Upload unavailable')
    return new Promise<void>(resolve => { finishUpload = resolve })
  } })
  assert.equal(ui.microphoneRequests(), 0, 'rendering the block must not request microphone access')
  assert.equal(ui.recorders.length, 0)
  await ui.click('녹음 시작', true)
  assert.equal(ui.microphoneRequests(), 1, 'double Start cannot request the microphone twice')
  assert.equal(ui.recorders.length, 1)
  assert.equal(ui.timers.size, 1)
  await ui.click('녹음 중지', true)
  assert.equal(ui.recorders[0].stopCalls, 1, 'double Stop cannot finalize the same recording twice')
  assert.equal(ui.uploads.length, 0, 'upload waits for the final recorder chunk')
  assert.equal(ui.timers.size, 0)
  await React.act(async () => ui.recorders[0].finish())
  assert.equal(ui.uploads.length, 1)
  assert.equal(await ui.uploads[0].text(), 'recorded voice')
  assert.match(ui.uploads[0].name, /\.webm$/)
  assert.equal(ui.container.querySelector('audio')?.getAttribute('src'), 'blob:voice-test-1')
  assert.ok(ui.container.querySelector('[role="alert"]'))
  assert.equal(ui.created.length, 1)
  assert.ok(ui.releasedTracks() > 0)
  await ui.click('다시 시도', true)
  assert.equal(ui.uploads.length, 2, 'double Retry starts only one additional upload')
  assert.equal(ui.uploads[0], ui.uploads[1], 'retry reuses the captured File without requesting another microphone')
  assert.equal(ui.microphoneRequests(), 1)
  assert.equal(ui.container.querySelector('[role="alert"]'), null)
  await React.act(async () => finishUpload())
  await ui.close()
  assert.deepEqual(ui.revoked, ['blob:voice-test-1'])
  assert.equal(ui.timers.size, 0)
})

test('cancelling pending microphone permission releases a late stream without recording or saving', async t => {
  const ui = await fixture(t, { pendingPermission: true })
  await ui.click('녹음 시작')
  assert.match(ui.container.textContent ?? '', /마이크 권한 대기 중/)
  await ui.click('취소')
  assert.equal(ui.cancels(), 1)
  await React.act(async () => ui.grant())
  assert.equal(ui.recorders.length, 0)
  assert.equal(ui.releasedTracks(), 1)
  assert.equal(ui.uploads.length, 0)
  assert.equal(ui.created.length, 0)
})

test('unmounting an active recording stops its microphone and timer without uploading', async t => {
  const ui = await fixture(t)
  await ui.click('녹음 시작')
  assert.equal(ui.timers.size, 1)
  await ui.close()
  assert.ok(ui.releasedTracks() > 0)
  assert.equal(ui.recorders[0].stopCalls, 1)
  assert.equal(ui.timers.size, 0)
  await React.act(async () => ui.recorders[0].finish('discarded'))
  assert.equal(ui.uploads.length, 0)
  assert.equal(ui.created.length, 0)
})

test('cancelling while Stop is waiting for the final chunk cannot create a preview or upload', async t => {
  const ui = await fixture(t)
  await ui.click('녹음 시작')
  await ui.click('녹음 중지')
  await ui.click('취소')
  await React.act(async () => ui.recorders[0].finish('discarded'))
  assert.equal(ui.uploads.length, 0)
  assert.equal(ui.created.length, 0)
  assert.equal(ui.timers.size, 0)
  assert.ok(ui.releasedTracks() > 0)
})
