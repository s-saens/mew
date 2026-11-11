import test from 'node:test'
import assert from 'node:assert/strict'
import { speechLabels, speechText } from './labels.ts'
import { LOCALES } from '../i18n-locales.ts'

test('speech labels are populated in every supported locale', () => {
  for (const locale of LOCALES) {
    const labels = speechLabels(locale)
    for (const [name, value] of Object.entries(labels)) assert.ok(value.trim(), `${locale}: ${name}`)
    assert.ok(speechText(locale, 'documentChanged'))
    assert.ok(speechText(locale, 'draftChanged'))
    if (locale !== 'ko') {
      assert.notEqual(labels.preflightDestination, '음성 전송 대상')
      assert.notEqual(labels.downloadConsent, '최초 사용 시 외부 출처에서 모델을 다운로드하는 데 동의합니다.')
    }
  }
})
