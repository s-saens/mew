import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { Window } from 'happy-dom'

const win = new Window({ url: 'https://select-field.test', width: 800, height: 600 })
for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'ResizeObserver', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { value: (win as unknown as Record<string, unknown>)[key], configurable: true })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })

interface RecordedAnimation {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancelled: boolean
  onfinish: (() => void) | null
  oncancel: (() => void) | null
  cancel: () => void
  finish: () => void
}

const animations: RecordedAnimation[] = []
let reducedMotion = false
const mediaListeners = new Set<() => void>()

win.matchMedia = ((query: string) => ({
  media: query,
  get matches() { return query.includes('prefers-reduced-motion') ? reducedMotion : false },
  addEventListener(_type: string, listener: () => void) { mediaListeners.add(listener) },
  removeEventListener(_type: string, listener: () => void) { mediaListeners.delete(listener) },
})) as unknown as typeof win.matchMedia

;(win.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {}
;(win.HTMLElement.prototype as unknown as { animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => RecordedAnimation }).animate = (keyframes, options) => {
  const entry: RecordedAnimation = {
    keyframes, options, cancelled: false, onfinish: null, oncancel: null,
    cancel() { entry.cancelled = true; entry.oncancel?.() },
    finish() { entry.onfinish?.() },
  }
  animations.push(entry)
  return entry
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = new URL(specifier, context.parentURL)
      for (const extension of ['.ts', '.tsx']) {
        const url = new URL(base.href + extension)
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
        }).outputText,
      }
    }
    return nextLoad(url, context)
  },
})

const [{ createElement: h, useState, act }, { createRoot }, { SelectField }] = await Promise.all([
  import('react'),
  import('react-dom/client'),
  import('./select-field.tsx'),
])

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
]

async function mount({ reduced = false, triggerTop = 40 }: { reduced?: boolean; triggerTop?: number } = {}) {
  animations.length = 0
  reducedMotion = reduced
  let current = 'a'
  function Fixture() {
    const [value, setValue] = useState('a')
    current = value
    return h(SelectField, { label: 'Theme', value, options, onChange: setValue })
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(h(Fixture)))
  const trigger = host.querySelector('[role="combobox"]') as HTMLElement
  const field = trigger.parentElement as HTMLElement
  field.getBoundingClientRect = () => new win.DOMRect(24, triggerTop, 180, 44)
  return {
    get value() { return current },
    trigger,
    popup: () => document.body.querySelector('[data-state]') as HTMLElement | null,
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
      await new Promise(resolve => setTimeout(resolve, 0))
    },
  }
}

test('SelectField unfolds and folds vertically from the trigger edge on open and close', async () => {
  const view = await mount({ triggerTop: 40 })
  try {
    await act(async () => view.trigger.click())
    const popup = view.popup()
    assert.ok(popup, 'popup mounts on open')
    assert.equal(view.trigger.getAttribute('aria-expanded'), 'true')
    assert.equal(popup.getAttribute('role'), 'listbox')
    assert.equal(popup.getAttribute('data-state'), 'open')
    assert.equal(popup.getAttribute('data-placement'), 'bottom')
    assert.equal(popup.style.transformOrigin, 'top')
    assert.equal(animations.length, 1)
    assert.deepEqual(animations[0].keyframes, [
      { opacity: 0, transform: 'scaleY(0.25)' },
      { opacity: 1, transform: 'scaleY(1)' },
    ])
    assert.equal(animations[0].options.duration, 160)
    await act(async () => animations[0].finish())

    const secondOption = popup.querySelectorAll('[role="option"]')[1] as HTMLElement
    await act(async () => secondOption.click())
    assert.equal(view.value, 'b')
    assert.equal(view.trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(document.body.querySelector('[role="listbox"]'), null, 'closing popup drops the listbox role immediately')
    const closingPopup = view.popup()
    assert.equal(closingPopup, popup, 'the same DOM node stays mounted during the exit animation')
    assert.equal(closingPopup?.getAttribute('data-state'), 'closed')
    assert.equal(closingPopup?.getAttribute('aria-hidden'), 'true')
    assert.equal(animations.length, 2)
    assert.deepEqual(animations[1].keyframes, [
      { opacity: 1, transform: 'scaleY(1)' },
      { opacity: 0, transform: 'scaleY(0.25)' },
    ])
    assert.equal(animations[1].options.duration, 120)

    await act(async () => animations[1].finish())
    assert.equal(view.popup(), null, 'popup unmounts once the closing animation finishes')
  } finally { await view.close() }
})

test('SelectField anchors upward popups to the bottom edge and reverses smoothly if reopened mid-close', async () => {
  const view = await mount({ triggerTop: 520 })
  try {
    await act(async () => view.trigger.click())
    const popup = view.popup()
    assert.ok(popup)
    assert.equal(popup.getAttribute('data-placement'), 'top')
    assert.equal(popup.style.transformOrigin, 'bottom')

    await act(async () => view.trigger.click())
    assert.equal(popup.getAttribute('data-state'), 'closed')
    assert.equal(animations.length, 2)
    popup.style.opacity = '0.4'
    popup.style.transform = 'scaleY(0.55)'
    await act(async () => view.trigger.click())
    assert.equal(view.popup(), popup, 'reopening mid-close reuses the mounted popup node')
    assert.equal(popup.getAttribute('data-state'), 'open')
    assert.equal(popup.getAttribute('role'), 'listbox')
    assert.equal(animations.length, 3)
    assert.deepEqual(animations[2].keyframes, [
      { opacity: 0.4, transform: 'scaleY(0.55)' },
      { opacity: 1, transform: 'scaleY(1)' },
    ])
  } finally { await view.close() }
})

test('SelectField skips open and close animations when prefers-reduced-motion is enabled', async () => {
  const view = await mount({ reduced: true })
  try {
    await act(async () => view.trigger.click())
    assert.ok(view.popup())
    assert.equal(animations.length, 0)
    await act(async () => view.trigger.click())
    assert.equal(view.popup(), null, 'reduced motion unmounts immediately on close')
    assert.equal(animations.length, 0)
  } finally { await view.close() }
})
