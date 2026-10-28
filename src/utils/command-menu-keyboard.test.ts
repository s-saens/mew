import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { captureCommandMenuShortcut, focusFirstCommand, navigateCommandMenu } from './command-menu-keyboard.ts'

test('Ctrl+E consumes browser/editor input, ignores modifiers and repeats, and cleans up', async () => {
  const win = new Window()
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true })
  const { registerKeyboardCapture } = await import('../../packages/shortcuts/src/keyboardCapture.ts')
  const input = win.document.createElement('textarea')
  win.document.body.append(input)
  let opened = 0
  let received = 0
  input.addEventListener('keydown', () => received++)
  const release = captureCommandMenuShortcut(() => opened++)
  const press = (extra: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key: 'e', code: 'KeyE', ctrlKey: true, bubbles: true, cancelable: true, ...extra })
    input.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    assert.equal(press(), true)
    assert.equal(press({ key: 'ㄷ' }), true)
    assert.equal(opened, 2)
    assert.equal(received, 0)
    assert.equal(press({ repeat: true }), true)
    assert.equal(opened, 2)
    for (const extra of [{ ctrlKey: false }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { key: 'q', code: 'KeyQ' }]) {
      assert.equal(press(extra), false)
    }
    const releaseRemote = registerKeyboardCapture(event => {
      event.preventDefault(); event.stopImmediatePropagation(); return true
    })
    try { assert.equal(press(), true); assert.equal(opened, 2) } finally { releaseRemote() }
    release()
    assert.equal(press(), false)
  } finally { release(); await win.happyDOM.close() }
})

test('arrows move between command rows and actions, wrap, and skip disabled buttons', async () => {
  const win = new Window()
  const menu = win.document.createElement('div')
  menu.innerHTML = '<div data-command-row><button>A</button><button>Run A</button><button>Terminal A</button></div>'
    + '<div data-command-row><button disabled>B</button><button disabled>Run B</button><button>Terminal B</button></div>'
    + '<div data-command-row><button>Add</button></div>'
  win.document.body.append(menu)
  let activated = ''
  menu.addEventListener('click', event => { activated = (event.target as unknown as HTMLButtonElement).textContent! })
  menu.addEventListener('keydown', event => navigateCommandMenu(event as unknown as KeyboardEvent, menu as unknown as HTMLElement))
  const active = () => win.document.activeElement?.textContent
  const press = (key: string, extra: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
    win.document.activeElement!.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    focusFirstCommand(menu as unknown as HTMLElement)
    assert.equal(active(), 'A')
    assert.equal(press('ArrowRight'), true); assert.equal(active(), 'Run A')
    press('ArrowRight'); assert.equal(active(), 'Terminal A')
    press('ArrowDown'); assert.equal(active(), 'Terminal B')
    press('ArrowDown'); assert.equal(active(), 'Add')
    press('ArrowDown'); assert.equal(active(), 'A')
    press('ArrowUp'); assert.equal(active(), 'Add')
    press('Home'); assert.equal(active(), 'A')
    press('ArrowLeft'); assert.equal(active(), 'Terminal A')
    press('End'); assert.equal(active(), 'Add')
    assert.equal(press('ArrowUp', { isComposing: true }), false); assert.equal(active(), 'Add')
    assert.equal(press('Enter'), false, 'native button activation stays available')
    ;(win.document.activeElement as unknown as HTMLButtonElement).click()
    assert.equal(activated, 'Add')
    assert.equal(press('Tab'), false, 'Tab remains available to leave the dropdown')
  } finally { await win.happyDOM.close() }
})

test('Alt+R opens from an editor, supports physical keys, and respects exclusive captures', async () => {
  const win = new Window()
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true })
  const input = win.document.createElement('textarea')
  win.document.body.append(input)
  let opened = 0
  let received = 0
  input.addEventListener('keydown', () => received++)
  const release = captureCommandMenuShortcut(() => opened++)
  const press = (extra: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true, cancelable: true, ...extra })
    input.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    assert.equal(press(), true)
    assert.equal(press({ key: 'ㄱ' }), true)
    assert.equal(press({ key: 'R', code: '' }), true)
    assert.equal(opened, 3)
    assert.equal(received, 0)
    assert.equal(press({ repeat: true }), true)
    assert.equal(opened, 3)
    for (const extra of [{ altKey: false }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { key: 'q', code: 'KeyQ' }]) {
      assert.equal(press(extra), false)
    }
    const prevent = (event: Event) => event.preventDefault()
    win.addEventListener('keydown', prevent, true)
    // An exclusive surface registered earlier must retain priority over this shortcut.
    release()
    const releaseAfterCapture = captureCommandMenuShortcut(() => opened++)
    try { assert.equal(press(), true); assert.equal(opened, 3) } finally { releaseAfterCapture() }
    win.removeEventListener('keydown', prevent, true)
    assert.equal(press(), false)
  } finally { release(); await win.happyDOM.close() }
})

test('digits activate commands by list position without triggering ports, stop, terminal, or add', async () => {
  const win = new Window()
  const menu = win.document.createElement('div')
  menu.innerHTML = Array.from({ length: 10 }, (_, index) => `<div data-command-row><button data-command-choice ${index === 1 ? 'disabled' : ''}>Command ${index + 1}</button><button>Stop</button><button>5555</button><button>Terminal</button></div>`).join('')
    + '<div data-command-row><button>Add</button></div>'
  win.document.body.append(menu)
  const activated: string[] = []
  menu.addEventListener('click', event => activated.push((event.target as unknown as HTMLButtonElement).textContent!))
  menu.addEventListener('keydown', event => navigateCommandMenu(event as unknown as KeyboardEvent, menu as unknown as HTMLElement))
  const press = (key: string, extra: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
    menu.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    assert.equal(press('1'), true)
    assert.equal(win.document.activeElement?.textContent, 'Command 1')
    assert.equal(press('2'), true, 'busy commands retain their list position')
    assert.equal(press('3'), true)
    assert.equal(press('End', { code: 'Numpad9' }), true)
    assert.equal(press('é', { code: 'Digit4' }), true)
    assert.equal(press('4', { repeat: true }), true)
    for (const extra of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
      assert.equal(press('1', extra), false)
    }
    for (const key of ['0', 'a', 'Enter']) assert.equal(press(key), false)
    assert.deepEqual(activated, ['Command 1', 'Command 3', 'Command 9', 'Command 4'])
    menu.innerHTML = '<div data-command-row><button>Add</button></div>'
    assert.equal(press('1'), false, 'empty menus never number the add action')
    assert.equal(press('9'), false)
  } finally { await win.happyDOM.close() }
})
