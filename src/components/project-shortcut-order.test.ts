import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const initialPaths = ['/mew', '/liiiiv', '/sleeeep', '/alaaaaarm', '/mew/mewlink', '/saens']
const visualPaths = ['/mew', '/mew/mewlink', '/liiiiv', '/sleeeep', '/alaaaaarm', '/saens']
const source = `import React,{useState} from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {ProjectSwitcher} from ${JSON.stringify(new URL('./ProjectSwitcher.tsx', import.meta.url).pathname)};
import {I18nProvider} from ${JSON.stringify(new URL('../i18n.tsx', import.meta.url).pathname)};
const root=createRoot(document.getElementById('root'));
window.fixture={activations:[],flush:fn=>flushSync(fn),close:()=>flushSync(()=>root.unmount())};
function Fixture(){
  const[paths,setPaths]=useState(${JSON.stringify(initialPaths)}),[active,setActive]=useState('/mew');
  const[sidebar,setSidebar]=useState(true);
  Object.assign(window.fixture,{paths,active,setPaths,setSidebar});
  return <ProjectSwitcher paths={paths} activePath={active} fallbackLabel="work" canOpen canChangeIcon={false}
    icons={{}} onActivate={path=>{window.fixture.activations.push(path);setActive(path)}} onIconChange={()=>{}}
    onOpen={()=>{}} onReorder={setPaths} sidebarEnabled sidebarOpen={sidebar} onSidebarOpenChange={setSidebar}
    sidebarHost={document.getElementById('sidebar')}/>;
}
flushSync(()=>root.render(<I18nProvider><Fixture/></I18nProvider>));`
const bundle = await build({
  input: 'virtual:project-shortcuts.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{
    name: 'project-shortcut-fixture',
    resolveId(id) {
      if (id === 'virtual:project-shortcuts.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    },
    async load(id) {
      if (id === 'virtual:project-shortcuts.tsx') return source
      if (id === 'virtual:style') return ''
      if (id.endsWith('?raw')) return `export default ${JSON.stringify(await readFile(id.slice(0, -4), 'utf8'))}`
    },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk')!

interface Fixture {
  paths: string[]
  active: string
  activations: string[]
  flush: (callback: () => void) => void
  setPaths: (paths: string[]) => void
  setSidebar: (open: boolean) => void
  close: () => void
}

function mount() {
  // Evaluate only the repository-owned fixture bundle, with a fresh DOM for each test.
  const win = new Window({ url: 'https://project-shortcuts.test', width: 1100, console,
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.localStorage.setItem('mew:locale', 'en')
  win.document.body.innerHTML = '<div id="root"></div><div id="sidebar"></div>'
  win.eval(chunk.code)
  const fixture = (win as unknown as { fixture: Fixture }).fixture
  const option = (path: string) => {
    const element = win.document.querySelector(`[data-project-option="${path}"]`)
    assert.ok(element, `project option ${path} exists`)
    return element
  }
  const order = () => [...win.document.querySelectorAll('[data-project-option]')].map(element => element.getAttribute('data-project-option'))
  const key = (target: ReturnType<typeof option> | typeof win.document.body, key: string, options: { altKey?: boolean; shiftKey?: boolean; code?: string } = {}) => {
    fixture.flush(() => target.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })))
  }
  const shortcuts = (expected: string[]) => {
    assert.deepEqual(order(), expected)
    expected.forEach((path, index) => {
      assert.equal(option(path).querySelector('kbd')?.textContent ?? null, index < 9 ? `Alt+${index + 1}` : null)
      assert.equal(option(path).getAttribute('aria-keyshortcuts'), index < 9 ? `Alt+${index + 1}` : null)
    })
  }
  return { win, fixture, option, order, key, shortcuts, close: async () => { fixture.close(); await win.happyDOM.close() } }
}

test('nested project shortcuts follow displayed rows and remain correct after keyboard reorder and closing the panel', async () => {
  const view = mount()
  try {
    view.shortcuts(visualPaths)
    view.key(view.win.document.body, '2', { altKey: true, code: 'Digit2' })
    assert.equal(view.fixture.active, '/mew/mewlink')
    view.key(view.win.document.body, '3', { altKey: true, code: 'Digit3' })
    assert.equal(view.fixture.active, '/liiiiv')

    view.key(view.option('/liiiiv'), 'ArrowDown', { shiftKey: true })
    const moved = ['/mew', '/mew/mewlink', '/sleeeep', '/liiiiv', '/alaaaaarm', '/saens']
    view.shortcuts(moved)
    assert.deepEqual([...view.fixture.paths], moved, 'persist the displayed sibling order')
    view.key(view.win.document.body, '3', { altKey: true, code: 'Digit3' })
    assert.equal(view.fixture.active, '/sleeeep')

    view.fixture.flush(() => view.fixture.setSidebar(false))
    assert.deepEqual(view.order(), [])
    view.key(view.win.document.body, '2', { altKey: true, code: 'Digit2' })
    assert.equal(view.fixture.active, '/mew/mewlink', 'closed project panel retains visual shortcut order')
    view.key(view.win.document.body, '4', { altKey: true, code: 'Digit4' })
    assert.equal(view.fixture.active, '/liiiiv')
  } finally { await view.close() }
})

test('dragging a handle changes displayed sibling order and shortcut targets', async () => {
  const view = mount()
  try {
    view.shortcuts(visualPaths)
    // Happy DOM has no layout; supply stable row geometry for the real drag hit testing.
    const rows = [...view.win.document.querySelectorAll('[data-project-row]')]
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => new view.win.DOMRect(0, index * 32, 220, 32)
    })
    const handle = view.win.document.querySelector('[data-project-drag-handle="/liiiiv"]')!
    Object.assign(handle, { setPointerCapture() {}, hasPointerCapture: () => false })
    for (const [type, y] of [['pointerdown', 80], ['pointermove', 120], ['pointerup', 120]] as const) {
      view.fixture.flush(() => handle.dispatchEvent(new view.win.PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: y,
      })))
    }
    view.shortcuts(['/mew', '/mew/mewlink', '/sleeeep', '/liiiiv', '/alaaaaarm', '/saens'])
    view.key(view.win.document.body, '3', { altKey: true, code: 'Digit3' })
    assert.equal(view.fixture.active, '/sleeeep')
  } finally { await view.close() }
})

test('only the first nine displayed hierarchy rows receive numeric shortcuts', async () => {
  const view = mount()
  try {
    const paths = [...initialPaths.filter(path => path !== '/mew/mewlink'), '/seventh', '/eighth', '/ninth', '/tenth', '/mew/mewlink']
    const expected = [...visualPaths, '/seventh', '/eighth', '/ninth', '/tenth']
    view.fixture.flush(() => view.fixture.setPaths(paths))
    view.shortcuts(expected)
    assert.equal(view.win.document.querySelectorAll('kbd').length, 9)
    view.key(view.win.document.body, '9', { altKey: true, code: 'Digit9' })
    assert.equal(view.fixture.active, '/ninth')
    view.key(view.win.document.body, '0', { altKey: true, code: 'Digit0' })
    assert.equal(view.fixture.active, '/ninth', 'the tenth project has no Alt+0 shortcut')
  } finally { await view.close() }
})
