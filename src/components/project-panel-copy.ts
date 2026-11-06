import type { Locale } from '../i18n-locales'

const messages = {
  ko: { title: '프로젝트', mine: '내 프로젝트', all: '전체' },
  en: { title: 'Projects', mine: 'My', all: 'All' },
  'zh-CN': { title: '项目', mine: '我的', all: '全部' },
  ja: { title: 'プロジェクト', mine: '自分', all: 'すべて' },
} satisfies Record<Locale, { title: string; mine: string; all: string }>

export function projectPanelCopy(locale: Locale) { return messages[locale] }
