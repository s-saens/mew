import { uiMessages, type UiMessage } from './ui-messages.ts'
import { getUiLocale, type UiLocale } from './i18n-locale.ts'

export { getUiLocale, setUiLocale, subscribeUiLocale, type UiLocale } from './i18n-locale.ts'
const translationIndex = { en: 0, 'zh-CN': 1, ja: 2 } as const

export function hasUiMessage(message: string): message is UiMessage { return Object.hasOwn(uiMessages, message) }

export function translateUi(locale: UiLocale, message: UiMessage, values?: Record<string, unknown>): string {
  const translated = locale === 'ko' ? message : uiMessages[message][translationIndex[locale]]
  return values ? translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match) : translated
}

export function uiText(message: UiMessage, values?: Record<string, unknown>, language: UiLocale = getUiLocale()): string {
  return translateUi(language, message, values)
}

/** Sunday first, independent of the host timezone and translated date-unit labels. */
export function uiWeekdays(): string[] {
  const formatter = new Intl.DateTimeFormat(getUiLocale(), { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, day) => formatter.format(new Date(Date.UTC(2024, 0, 7 + day))))
}
