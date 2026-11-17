import assert from 'node:assert/strict'
import test from 'node:test'
import { getUiLocale, setUiLocale, subscribeUiLocale, translateUi, uiText, uiWeekdays } from './i18n-core.ts'
import { uiMessages, type UiMessage } from './ui-messages.ts'
import { getUiLocale as getStartupLocale, setUiLocale as setStartupLocale } from './i18n-locale.ts'
import { startupUiMessages, startupUiText, type StartupUiMessage } from './i18n-startup.ts'

const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort()

test('startup copy is canonical and shares locale state with the full UI in every language', () => {
  const initial = getUiLocale()
  try {
    for (const locale of ['ko', 'en', 'zh-CN', 'ja'] as const) {
      setStartupLocale(locale)
      assert.equal(getUiLocale(), locale)
      for (const message of Object.keys(startupUiMessages) as StartupUiMessage[]) {
        assert.equal(uiMessages[message], startupUiMessages[message], 'both catalogs retain the same canonical entry')
        assert.equal(startupUiText(message), translateUi(locale, message))
      }
      setUiLocale(locale === 'ko' ? 'en' : 'ko')
      assert.equal(getStartupLocale(), getUiLocale())
    }
  } finally { setUiLocale(initial) }
})

test('every shared UI message has three translations with matching placeholders', () => {
  for (const [source, translations] of Object.entries(uiMessages)) {
    assert.equal(translations.length, 3, source)
    for (const translated of translations) {
      assert.ok(translated.trim(), source)
      assert.doesNotMatch(translated, /[가-힣]/, source)
      assert.deepEqual(placeholders(translated), placeholders(source), source)
    }
    assert.equal(translateUi('ko', source as UiMessage), source)
  }
})

test('interpolation preserves user text, including Korean, dollar signs and braces', () => {
  const name = '한국어 $& {name} <script>'
  assert.equal(translateUi('en', '{name} 여는 중…', { name }), `Opening ${name}…`)
  assert.equal(translateUi('ja', '{name} 여는 중…', { name }), `${name} を開いています…`)
  assert.equal(translateUi('zh-CN', '{name} 여는 중…', { name }), `正在打开 ${name}…`)
  assert.equal(translateUi('en', '{name} 여는 중…'), 'Opening {name}…')
})

test('file explorer controls use the renamed panel label in every language', () => {
  for (const [locale, open, close] of [
    ['ko', '파일 탐색기 열기', '파일 탐색기 닫기'],
    ['en', 'Open file explorer', 'Close file explorer'],
    ['zh-CN', '打开文件资源管理器', '关闭文件资源管理器'],
    ['ja', 'ファイルエクスプローラーを開く', 'ファイルエクスプローラーを閉じる'],
  ] as const) {
    assert.equal(translateUi(locale, '파일 탐색기 열기'), open)
    assert.equal(translateUi(locale, '파일 탐색기 닫기'), close)
    assert.equal(translateUi(locale, '파일 탐색기 열기 (Ctrl+B)'), `${open} (Ctrl+B)`)
    assert.equal(translateUi(locale, '파일 탐색기 닫기 (Ctrl+B)'), `${close} (Ctrl+B)`)
  }
})

test('shared UI locale updates subscribers once, supports cleanup, and formats weekdays', () => {
  const initial = getUiLocale()
  let updates = 0
  const unsubscribe = subscribeUiLocale(() => { updates++ })
  try {
    setUiLocale('en')
    setUiLocale('en')
    assert.equal(updates, 1)
    assert.equal(uiText('히스토리'), 'History')
    assert.deepEqual(uiWeekdays(), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
    setUiLocale('ja')
    assert.equal(uiText('현재 대화 새로고침'), '現在の会話を再読み込み')
    assert.equal(uiWeekdays()[0], '日')
    unsubscribe()
    setUiLocale('ko')
    assert.equal(updates, 2)
    assert.equal(uiWeekdays()[0], '일')
  } finally {
    unsubscribe()
    setUiLocale(initial)
  }
})
