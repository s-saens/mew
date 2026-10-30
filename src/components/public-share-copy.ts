import type { Locale } from '../i18n-locales'

const en = {
  title: 'Publish', off: 'Not public', view: 'Public viewing', edit: 'Allow editing',
  viewBadge: 'Public: view only', editBadge: 'Public: editing allowed',
  close: 'Close', copy: 'Copy link', copied: 'Link copied', open: 'Open public link',
  loading: 'Loading…', saving: 'Saving…', retry: 'Try again',
  loadFailed: 'Could not load public access. Try again.', saveFailed: 'Could not save public access. Try again.',
  copyFailed: 'Could not copy the link. Select and copy the address.', link: 'Public link',
  linkUnavailable: 'The public address is unavailable. Reconnect and try again.',
}
type Copy = { [K in keyof typeof en]: string }

export const publicShareCopy: Record<Locale, Copy> = {
  en,
  ko: {
    title: '공개', off: '공개 안 함', view: '공개함', edit: '편집까지 허용',
    viewBadge: '공개: 보기 허용', editBadge: '공개: 편집 허용',
    close: '닫기', copy: '링크 복사', copied: '링크를 복사했습니다', open: '공개 링크 열기',
    loading: '불러오는 중…', saving: '저장 중…', retry: '다시 시도',
    loadFailed: '공개 설정을 불러오지 못했습니다. 다시 시도해 주세요.', saveFailed: '공개 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
    copyFailed: '링크를 복사하지 못했습니다. 주소를 선택해 복사해 주세요.', link: '공개 링크',
    linkUnavailable: '공개 주소를 확인하지 못했습니다. 다시 연결해 시도해 주세요.',
  },
  ja: {
    title: '公開', off: '公開しない', view: '公開する', edit: '編集を許可',
    viewBadge: '公開：閲覧のみ', editBadge: '公開：編集可能',
    close: '閉じる', copy: 'リンクをコピー', copied: 'リンクをコピーしました', open: '公開リンクを開く',
    loading: '読み込み中…', saving: '保存中…', retry: '再試行',
    loadFailed: '公開設定を読み込めませんでした。再試行してください。', saveFailed: '公開設定を保存できませんでした。再試行してください。',
    copyFailed: 'リンクをコピーできませんでした。アドレスを選択してコピーしてください。', link: '公開リンク',
    linkUnavailable: '公開アドレスを確認できませんでした。再接続してお試しください。',
  },
  'zh-CN': {
    title: '公开', off: '不公开', view: '公开查看', edit: '允许编辑',
    viewBadge: '公开：仅查看', editBadge: '公开：允许编辑',
    close: '关闭', copy: '复制链接', copied: '链接已复制', open: '打开公开链接',
    loading: '正在加载…', saving: '正在保存…', retry: '重试',
    loadFailed: '无法加载公开设置，请重试。', saveFailed: '无法保存公开设置，请重试。',
    copyFailed: '无法复制链接，请选择并复制地址。', link: '公开链接',
    linkUnavailable: '无法获取公开地址，请重新连接后重试。',
  },
}
