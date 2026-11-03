import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { Window } from 'happy-dom'
import type { ChatMessage, ChatView } from '../api/client.ts'

const win = new Window({ url: 'https://localhost' })
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, key, { value: (win as unknown as Record<string, unknown>)[key], configurable: true })
}
Object.defineProperty(globalThis, 'requestAnimationFrame', { value: win.requestAnimationFrame.bind(win), configurable: true })
Object.defineProperty(globalThis, 'cancelAnimationFrame', { value: win.cancelAnimationFrame.bind(win), configurable: true })
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
localStorage.setItem('mew:locale', 'en')

const api = {
  fetchChat: async (): Promise<ChatView> => { throw new Error('Unexpected chat request') },
  fetchMemberProfiles: async () => [{ email: 'sender@example.test', displayName: 'Sender' }],
  markChatRead: async (_conversation: string) => {},
}
Object.defineProperty(globalThis, '__mewChatNotificationTestApi', { value: api, configurable: true })
registerHooks({
  resolve(specifier, context, nextResolve) {
    // Replace only the HTTP boundary. Notification state, subscriptions and UI stay real.
    if (specifier === '../api/client' && /\/(use-chat-notifications\.ts|ChatPanel\.tsx)$/.test(context.parentURL ?? '')) {
      return { url: `data:text/javascript,${encodeURIComponent(`
        const api = globalThis.__mewChatNotificationTestApi;
        export const GROUP_CHAT = 'group';
        export const fetchChat = (...args) => api.fetchChat(...args);
        export const fetchMemberProfiles = (...args) => api.fetchMemberProfiles(...args);
        export const markChatRead = (...args) => api.markChatRead(...args);
        export const postChat = async () => { throw new Error('Unexpected send'); };
        export const deleteChatHistory = async () => { throw new Error('Unexpected delete'); };
      `)}`, shortCircuit: true }
    }
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
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' }
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText }
    return nextLoad(url, context)
  },
})

const [{ createElement: h, act }, { createRoot }, { I18nProvider }, { useChatNotifications }, store, { HeaderNotifications }, { ChatPanel }] = await Promise.all([
  import('react'), import('react-dom/client'), import('../i18n.tsx'), import('./use-chat-notifications.ts'),
  import('../utils/mewcat-notifications.ts'), import('../components/header-notifications.tsx'), import('../components/ChatPanel.tsx'),
])

const identity = 'me@example.test'
const sender = 'sender@example.test'
const message = (id: string, time: number, changes: Partial<ChatMessage> = {}): ChatMessage => ({ id, time, author: sender, text: 'Private message contents', unread: 1, ...changes })
const snapshot = (messages: ChatMessage[] = [], unread: Record<string, number> = {}): ChatView => ({ messages, unread, dmSupported: true })
const chatSignal = () => window.dispatchEvent(new CustomEvent('mew:signal', { detail: { type: 'chat' } }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function mount(child: ReturnType<typeof h>) {
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  const render = async (next: ReturnType<typeof h>) => { await act(async () => root.render(h(I18nProvider, null, next))) }
  await render(child)
  return { element, render, close: async () => { await act(async () => root.unmount()); element.remove() } }
}
function Delivery({ enabled = true, account = identity }: { enabled?: boolean; account?: string | null }) {
  useChatNotifications(enabled, account)
  return null
}
function captureNotices() {
  store.clearMewcatNotices()
  const notices: ReturnType<typeof store.useMewcatNotices> = []
  const stop = store.onMewcatNotice(notice => notices.push(notice))
  return { notices, stop }
}

test('receives actionable chat notices with no chat panel; history, own messages and foreign DMs stay silent', async () => {
  const capture = captureNotices()
  let view = snapshot([message('integration-history', 10)])
  api.fetchChat = async () => view
  const delivery = await mount(h(Delivery))
  const header = await mount(h(HeaderNotifications))
  assert.equal(capture.notices.length, 0)
  assert.equal(header.element.querySelector('button'), null)
  view = snapshot([
    ...view.messages,
    message('integration-own', 11, { author: identity }),
    message('integration-foreign', 12, { to: ['other@example.test'] }),
    message('integration-group', 13),
    message('integration-dm', 14, { to: [identity], unread: 0 }),
  ])
  await act(async () => { chatSignal() })
  assert.deepEqual(capture.notices.map(notice => [notice.kind, notice.target, notice.chatConversation]), [
    ['chat', 'chat', 'group'], ['chat', 'chat', sender],
  ])
  assert.ok(capture.notices.every(notice => notice.source === sender))
  assert.ok(!JSON.stringify(capture.notices).includes('Private message contents'))
  assert.match(header.element.querySelector('button')!.getAttribute('aria-label')!, /Notifications: 2/)
  const opened: unknown[] = []
  const onOpen = (event: Event) => opened.push((event as CustomEvent).detail)
  window.addEventListener(store.OPEN_NOTICE_EVENT, onOpen)
  await act(async () => { header.element.querySelector('button')!.click() })
  const dialog = document.querySelector('[role="dialog"]')!
  assert.match(dialog.textContent!, /New chat message/)
  assert.doesNotMatch(dialog.textContent!, /Private message contents/)
  const openChat = [...dialog.querySelectorAll('button')].find(button => button.textContent!.includes('New chat message'))!
  await act(async () => { openChat.click() })
  assert.equal((opened[0] as { chatConversation: string }).chatConversation, sender)
  await act(async () => { chatSignal() })
  view = snapshot([])
  await act(async () => { chatSignal() })
  view = snapshot([message('integration-group', 13), message('integration-dm', 14, { to: [identity], unread: 0 })])
  await act(async () => { chatSignal() })
  assert.equal(capture.notices.length, 2, 'read receipts, deletion and restored snapshots cannot repeat notices')
  window.removeEventListener(store.OPEN_NOTICE_EVENT, onOpen)
  await delivery.close(); await header.close(); capture.stop()
})

test('coalesces overlapping signals into a trailing fetch without losing incoming messages', async () => {
  const capture = captureNotices()
  const first = deferred<ChatView>()
  const second = deferred<ChatView>()
  const third = deferred<ChatView>()
  const requests = [first, second, third]
  let calls = 0
  api.fetchChat = () => requests[calls++].promise
  const delivery = await mount(h(Delivery))
  await act(async () => { chatSignal(); chatSignal(); chatSignal() })
  assert.equal(calls, 1)
  await act(async () => { first.resolve(snapshot()) })
  assert.equal(calls, 2)
  await act(async () => { chatSignal(); chatSignal() })
  assert.equal(calls, 2)
  await act(async () => { second.resolve(snapshot([message('overlap-first', 1)])) })
  assert.equal(calls, 3)
  await act(async () => { third.resolve(snapshot([message('overlap-first', 1), message('overlap-second', 2)])) })
  assert.deepEqual(capture.notices.map(notice => notice.key), ['chat:overlap-first', 'chat:overlap-second'])
  await delivery.close(); capture.stop()
})

test('retries failed refreshes and establishes the baseline only after the first successful response', async () => {
  const capture = captureNotices()
  let calls = 0
  api.fetchChat = async () => {
    calls++
    if (calls === 1 || calls === 3) throw new Error('Offline')
    return snapshot([message('retry-history', 10), ...(calls >= 4 ? [message('retry-new', 11)] : [])])
  }
  const delivery = await mount(h(Delivery))
  await act(async () => { chatSignal() })
  assert.equal(capture.notices.length, 0)
  await act(async () => { chatSignal() })
  await act(async () => { chatSignal() })
  assert.deepEqual(capture.notices.map(notice => notice.key), ['chat:retry-new'])
  assert.equal(calls, 4)
  await delivery.close(); capture.stop()
})

test('disabled or unidentified accounts do not request chat, and disabling ignores late responses and removes listeners', async () => {
  const capture = captureNotices()
  let calls = 0
  const pending = deferred<ChatView>()
  api.fetchChat = async () => { calls++; return calls === 1 ? snapshot() : pending.promise }
  const delivery = await mount(h(Delivery, { enabled: false }))
  await delivery.render(h(Delivery, { account: null }))
  await act(async () => { chatSignal(); window.dispatchEvent(new Event('mew:remote-reconnected')) })
  assert.equal(calls, 0)
  await delivery.render(h(Delivery))
  await act(async () => { chatSignal() })
  await delivery.render(h(Delivery, { enabled: false }))
  await act(async () => {
    pending.resolve(snapshot([message('disabled-late', 1)]))
    chatSignal()
    window.dispatchEvent(new Event('mew:permissions-changed'))
    window.dispatchEvent(new Event('mew:remote-reconnected'))
  })
  assert.equal(calls, 2)
  assert.equal(capture.notices.length, 0)
  await delivery.close(); capture.stop()
})

test('account changes and unmount ignore pending responses and start each account with a silent baseline', async () => {
  const capture = captureNotices()
  const stale = deferred<ChatView>()
  const unmounted = deferred<ChatView>()
  let calls = 0
  api.fetchChat = async () => {
    calls++
    if (calls === 2) return stale.promise
    if (calls === 4) return unmounted.promise
    return snapshot(calls === 3 ? [message('account-baseline', 20)] : [])
  }
  const delivery = await mount(h(Delivery))
  await act(async () => { chatSignal() })
  await delivery.render(h(Delivery, { account: 'next@example.test' }))
  await act(async () => { stale.resolve(snapshot([message('account-stale', 10)])) })
  assert.equal(capture.notices.length, 0)
  await act(async () => { chatSignal() })
  await delivery.close()
  await act(async () => { unmounted.resolve(snapshot([message('unmount-late', 21)])); chatSignal() })
  assert.equal(calls, 4)
  assert.equal(capture.notices.length, 0)
  capture.stop()
})

test('permissions, reconnect and foreground events catch up while irrelevant signals and hidden visibility do not fetch', async () => {
  const capture = captureNotices()
  let calls = 0
  api.fetchChat = async () => { calls++; return snapshot(calls > 1 ? [message(`catchup-${calls}`, calls)] : []) }
  const delivery = await mount(h(Delivery))
  await act(async () => {
    window.dispatchEvent(new CustomEvent('mew:signal', { detail: { type: 'comments' } }))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  assert.equal(calls, 1)
  await act(async () => { window.dispatchEvent(new Event('mew:permissions-changed')) })
  await act(async () => { window.dispatchEvent(new Event('mew:remote-reconnected')) })
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  assert.equal(calls, 4)
  assert.deepEqual(capture.notices.map(notice => notice.key), ['chat:catchup-2', 'chat:catchup-3', 'chat:catchup-4'])
  await delivery.close(); capture.stop()
})

test('opening a DM notice selects its conversation before marking read and fresh requests reopen the same DM', async () => {
  store.clearMewcatNotices()
  const reads: string[] = []
  api.markChatRead = async conversation => { reads.push(conversation) }
  api.fetchChat = async () => snapshot([
    message('navigation-group', 1), message('navigation-dm', 2, { to: [identity] }),
  ], { group: 1, [sender]: 1 })
  const props = { authEmail: identity, authDisplayName: 'Me', project: 'test', tree: [], onOpenFile: () => {}, onClose: () => {} }
  const panel = await mount(h(ChatPanel, { ...props, conversationRequest: { conversation: sender } }))
  assert.deepEqual(reads, [sender], 'opening a DM must not mark the group conversation read')
  assert.equal(panel.element.querySelector('[aria-current="true"]')?.getAttribute('aria-label'), `Sender · ${sender}`)
  await act(async () => { (panel.element.querySelector('[aria-label="Group conversation"]') as HTMLElement).click() })
  assert.equal(panel.element.querySelector('[aria-current="true"]')?.getAttribute('aria-label'), 'Group conversation')
  await panel.render(h(ChatPanel, { ...props, conversationRequest: { conversation: sender } }))
  assert.equal(panel.element.querySelector('[aria-current="true"]')?.getAttribute('aria-label'), `Sender · ${sender}`)
  assert.deepEqual(reads, [sender, 'group', sender])
  await panel.close()
})
