import assert from 'node:assert/strict'
import test from 'node:test'
import { loadFloatingRect } from './use-floating-panel.ts'

test('desktop popup geometry migrates once from the active project and remains account-wide', () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } })
  const first = { x: 35, y: 60, width: 440, height: 500 }
  const second = { x: 90, y: 120, width: 600, height: 300 }
  storage.set('mew:popup:a:/first:memo', JSON.stringify(first))
  storage.set('mew:popup:a:/second:memo', JSON.stringify(second))
  assert.deepEqual(loadFloatingRect('mew:popup:a:memo', 'mew:popup:a:/first:memo'), first)
  assert.deepEqual(loadFloatingRect('mew:popup:a:memo', 'mew:popup:a:/second:memo'), first)
  assert.notDeepEqual(loadFloatingRect('mew:popup:b:memo'), first, 'accounts do not share popup geometry')
  storage.set('mew:popup:a:/invalid:memo', '{"width":1}')
  assert.deepEqual(loadFloatingRect('mew:popup:a:tasks', 'mew:popup:a:/invalid:memo'), { x: 24, y: 24, width: 420, height: 480 })
  assert.equal(storage.has('mew:popup:a:tasks'), false, 'invalid legacy geometry is not migrated')
})

test('a popup mounted before the project is known imports its geometry when the project arrives', async () => {
  const { Window } = await import('happy-dom')
  const win = new Window({ url: 'http://localhost' })
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of ['window', 'document', 'Node', 'HTMLElement', 'localStorage', 'CustomEvent', 'ResizeObserver']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value: (win as unknown as Record<string, unknown>)[key] })
  }
  previous.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'))
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
  const [{ act, createElement }, { createRoot }, { useFloatingPanel }] = await Promise.all([import('react'), import('react-dom/client'), import('./use-floating-panel.ts')])
  const host = document.createElement('div'); document.body.append(host)
  Object.defineProperties(host, { clientWidth: { value: 1200 }, clientHeight: { value: 800 } })
  const root = createRoot(host)
  let current!: ReturnType<typeof useFloatingPanel>
  function Harness({ project }: { project: string | null }) {
    current = useFloatingPanel('mew:popup:a:memo', host, true, false, project ? `mew:popup:a:${project}:memo` : undefined)
    return null
  }
  const saved = { x: 80, y: 90, width: 450, height: 300 }
  localStorage.setItem('mew:popup:a:/first:memo', JSON.stringify(saved))
  try {
    await act(async () => root.render(createElement(Harness, { project: null })))
    await act(async () => root.render(createElement(Harness, { project: '/first' })))
    assert.equal(current.style.left, saved.x)
    assert.equal(current.style.top, saved.y)
    await act(async () => root.render(createElement(Harness, { project: '/second' })))
    assert.equal(current.style.left, saved.x, 'later projects reuse the migrated account position')
    const moved = { ...saved, x: 170, y: 140 }
    await act(async () => window.dispatchEvent(new CustomEvent('mew:popup-layout', { detail: { key: 'mew:popup:a:memo', rect: moved } })))
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } } })
    await act(async () => root.render(createElement(Harness, { project: '/third' })))
    assert.equal(current.style.left, moved.x, 'project changes retain in-memory popup geometry when storage is blocked')
  } finally {
    await act(async () => root.unmount())
    await win.happyDOM.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
