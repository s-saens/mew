import type { Locale } from '../i18n-locales'

const messages = {
  ko: { title: '프로젝트 선택', mine: '내 프로젝트', all: '전체' },
  en: { title: 'Project selection', mine: 'My', all: 'All' },
  'zh-CN': { title: '项目选择', mine: '我的', all: '全部' },
  ja: { title: 'プロジェクト選択', mine: '自分', all: 'すべて' },
} satisfies Record<Locale, { title: string; mine: string; all: string }>

export function projectPanelCopy(locale: Locale) { return messages[locale] }
