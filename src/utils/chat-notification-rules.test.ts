import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChatMessage } from '../api/client.ts'
import { createChatNoticeTracker } from './chat-notification-rules.ts'

const identity = 'me@example.com'
const author = 'sender@example.com'
const message = (id: string, time: number, changes: Partial<ChatMessage> = {}): ChatMessage => ({
  id, time, author, text: 'Private message contents', unread: 1, ...changes,
})

test('the first successful snapshot is a silent history baseline', () => {
  const track = createChatNoticeTracker(identity)
  assert.deepEqual(track([message('history', 10)]), [])
  assert.deepEqual(track([message('history', 10), message('older', 5)]), [])
  assert.deepEqual(track([message('new', 11)]), [{
    key: 'chat:new', kind: 'chat', level: 'success', source: author, target: 'chat', chatConversation: 'group',
  }])
})

test('an empty first snapshot still initializes the tracker', () => {
  const track = createChatNoticeTracker(identity)
  assert.deepEqual(track([]), [])
  assert.deepEqual(track([message('first', 0)]).map(notice => notice.key), ['chat:first'])
})

test('group messages and addressed DMs notify, excluding own and nonrecipient messages', () => {
  const track = createChatNoticeTracker(identity)
  track([])
  const notices = track([
    message('group', 1),
    message('empty-recipients', 2, { to: [] }),
    message('dm', 3, { to: [identity] }),
    message('own-group', 4, { author: identity }),
    message('own-dm', 5, { author: identity, to: [author] }),
    message('other-dm', 6, { to: ['someone@example.com'] }),
  ])
  assert.deepEqual(notices.map(notice => [notice.key, notice.chatConversation]), [
    ['chat:group', 'group'], ['chat:empty-recipients', 'group'], ['chat:dm', author],
  ])
  assert.ok(!JSON.stringify(notices).includes('Private message contents'))
})

test('repeated and out-of-order snapshots emit only strictly newer messages in time order', () => {
  const track = createChatNoticeTracker(identity)
  track([message('history', 10)])
  const snapshot = [message('third', 13), message('older', 9), message('second', 12), message('first', 11)]
  assert.deepEqual(track(snapshot).map(notice => notice.key), ['chat:first', 'chat:second', 'chat:third'])
  assert.deepEqual(track(snapshot), [])
  assert.deepEqual(track([message('late-old', 12), message('same-time', 13)]), [])
  assert.deepEqual(track([message('fourth', 14)]).map(notice => notice.key), ['chat:fourth'])
})

test('deleting or truncating history never moves the high-water timestamp backward', () => {
  const track = createChatNoticeTracker(identity)
  track([message('history', 10)])
  assert.deepEqual(track([]), [])
  assert.deepEqual(track([message('older', 4)]), [])
  assert.deepEqual(track([message('new', 11)]).map(notice => notice.key), ['chat:new'])
  assert.deepEqual(track([]), [])
  assert.deepEqual(track([message('history', 10), message('new', 11)]), [])
})

test('own and nonrecipient messages also advance the high-water timestamp', () => {
  const track = createChatNoticeTracker(identity)
  track([])
  assert.deepEqual(track([message('own', 10, { author: identity })]), [])
  assert.deepEqual(track([message('late-group', 9)]), [])
  assert.deepEqual(track([message('other-dm', 20, { to: ['someone@example.com'] })]), [])
  assert.deepEqual(track([message('late-dm', 19, { to: [identity] })]), [])
  assert.deepEqual(track([message('new', 21)]).map(notice => notice.key), ['chat:new'])
})

test('received messages notify even when all recipients already read them', () => {
  const track = createChatNoticeTracker(identity)
  track([])
  assert.equal(track([message('read', 1, { unread: 0 })]).length, 1)
})

test('repeated identifiers emit only once, including duplicates in one snapshot', () => {
  const track = createChatNoticeTracker(identity)
  track([message('history', 1)])
  assert.deepEqual(track([message('new', 2), message('new', 2)]).map(notice => notice.key), ['chat:new'])
  assert.deepEqual(track([message('new', 3), message('history', 4)]), [])
  assert.deepEqual(track([message('next', 5)]).map(notice => notice.key), ['chat:next'])
})

test('rotating history snapshots continue notifying once as older history falls out', () => {
  const track = createChatNoticeTracker(identity)
  const snapshot = (start: number) => Array.from({ length: 500 }, (_, offset) => message(`message-${start + offset}`, start + offset))
  assert.deepEqual(track(snapshot(0)), [])
  for (let start = 250; start <= 2500; start += 250) {
    const current = snapshot(start)
    assert.deepEqual(track(current).map(notice => notice.key), current.slice(250).map(entry => `chat:${entry.id}`))
    assert.deepEqual(track(current), [])
  }
  assert.deepEqual(track([]), [])
  assert.deepEqual(track(snapshot(0)), [])
  assert.deepEqual(track([message('latest', 3000)]).map(notice => notice.key), ['chat:latest'])
})
