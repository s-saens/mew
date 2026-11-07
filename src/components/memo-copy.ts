import { getUiLocale } from '@mew/ui/i18n-core'

const messages = {
  ko: { shared: '공용', private: '개인 메모', add: '개인 메모 추가', remove: '메모 삭제', confirm: '이 개인 메모를 삭제할까요?', detail: '메모 내용이 영구적으로 삭제됩니다.' },
  en: { shared: 'Shared', private: 'Private memo', add: 'Add private memo', remove: 'Delete memo', confirm: 'Delete this private memo?', detail: 'Its contents will be permanently deleted.' },
  ja: { shared: '共有', private: '個人メモ', add: '個人メモを追加', remove: 'メモを削除', confirm: 'この個人メモを削除しますか？', detail: 'メモの内容は完全に削除されます。' },
  'zh-CN': { shared: '公共', private: '个人便笺', add: '添加个人便笺', remove: '删除便笺', confirm: '删除这条个人便笺？', detail: '便笺内容将被永久删除。' },
}
export function memoCopy() { return messages[getUiLocale()] ?? messages.en }
export function memoTabName(name: string) { return /^Memo \d+$/.test(name) ? `${memoCopy().private} ${name.slice(5)}` : name }
