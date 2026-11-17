import { getUiLocale, type UiLocale } from './i18n-locale.ts'

/** Canonical startup and recovery copy; the complete UI catalog includes these same entries. */
export const startupUiMessages = {
  "불러오는 중…": ["Loading…", "加载中…", "読み込み中…"],
  "새로고침": ["Refresh", "刷新", "更新"],
  "접속 중…": ["Connecting…", "正在连接…", "接続中…"],
  "작업 화면을 불러오지 못했습니다. 페이지를 다시 열어 주세요.": ["Could not load the workspace. Reopen the page.", "无法加载工作区，请重新打开页面。", "ワークスペースを読み込めませんでした。ページを開き直してください。"],
  "업데이트 후 발생했다면 서버를 재시작한 뒤 새로고침해 주세요.": ["If this happened after an update, restart the server, then refresh.", "如果在更新后发生此问题，请重启服务器，然后刷新。", "更新後に発生した場合は、サーバーを再起動してから再読み込みしてください。"],
} as const

export type StartupUiMessage = keyof typeof startupUiMessages
const translationIndex = { en: 0, 'zh-CN': 1, ja: 2 } as const

export function startupUiText(message: StartupUiMessage, language: UiLocale = getUiLocale()): string {
  return language === 'ko' ? message : startupUiMessages[message][translationIndex[language]]
}
