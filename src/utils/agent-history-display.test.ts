import test from 'node:test'
import assert from 'node:assert/strict'
import { historyDisplayText } from './agent-history-display.ts'

const labels = { image: '(사진)', video: '(비디오)', audio: '(음성)', file: '(파일)' }

test('history display replaces uploaded attachments while preserving surrounding text and document references', () => {
  const input = '앞 [[.workspace:.mew/temp/assets/사진 copy.PNG]] [[docs:.mew/assets/clip.MP4]] [[docs:.mew/files/sound.mp3]] [[docs:.mew/files/report.pdf]] 뒤 [[docs:guide.md]]'
  assert.equal(historyDisplayText(input, labels), '앞 (사진) (비디오) (음성) (파일) 뒤 [[docs:guide.md]]')
  assert.equal(historyDisplayText('[[docs:.mew/temp/assets/a.jpg]][[docs:.mew/temp/assets/a.jpg]]', labels), '(사진)(사진)')
  assert.equal(historyDisplayText('제목 [[docs:.mew/temp/assets/long', labels), '제목 (파일)')
  assert.equal(historyDisplayText('일반 텍스트 [[docs:unfinished', labels), '일반 텍스트 [[docs:unfinished')
})

test('history attachment labels are localized', async () => {
  const { translateUi } = await import('../../packages/ui/src/i18n-core.ts')
  for (const [locale, expected] of [
    ['en', '(Image) (Video) (Audio) (File)'],
    ['ja', '(画像) (動画) (音声) (ファイル)'],
    ['zh-CN', '(图片) (视频) (音频) (文件)'],
  ] as const) {
    const translated = { image: translateUi(locale, '(사진)'), video: translateUi(locale, '(비디오)'), audio: translateUi(locale, '(음성)'), file: translateUi(locale, '(파일)') }
    assert.equal(historyDisplayText('[[p:.mew/assets/a.jpg]] [[p:.mew/assets/b.mp4]] [[p:.mew/assets/c.wav]] [[p:.mew/files/d.pdf]]', translated), expected)
  }
})
