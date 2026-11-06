import type { Locale } from '../i18n-locales'

const messages = {
  ko: {
    remove: '삭제', removeFromMine: '내 프로젝트에서 삭제하기', permanently: '완전히 삭제하기',
    title: '프로젝트를 완전히 삭제할까요?',
    detail: '프로젝트 폴더와 모든 파일이 삭제됩니다. 다른 사용자의 프로젝트 목록에서도 사라지며, 이 작업은 되돌릴 수 없습니다.',
    cancel: '취소', deleting: '삭제 중…', unavailable: '지금은 프로젝트를 삭제할 수 없습니다. 잠시 후 다시 시도하세요.',
  },
  en: {
    remove: 'Delete', removeFromMine: 'Remove from My Projects', permanently: 'Delete permanently',
    title: 'Permanently delete this project?',
    detail: 'The project folder and all its files will be deleted. It will also be removed from everyone’s project list. This cannot be undone.',
    cancel: 'Cancel', deleting: 'Deleting…', unavailable: 'Cannot delete the project right now. Please try again shortly.',
  },
  'zh-CN': {
    remove: '删除', removeFromMine: '从我的项目中移除', permanently: '永久删除',
    title: '永久删除此项目？',
    detail: '项目文件夹及其所有文件都将被删除，也会从所有用户的项目列表中移除。此操作无法撤销。',
    cancel: '取消', deleting: '正在删除…', unavailable: '暂时无法删除项目，请稍后重试。',
  },
  ja: {
    remove: '削除', removeFromMine: '自分のプロジェクトから外す', permanently: '完全に削除',
    title: 'プロジェクトを完全に削除しますか？',
    detail: 'プロジェクトフォルダーとすべてのファイルが削除され、全ユーザーのプロジェクト一覧からも消えます。この操作は取り消せません。',
    cancel: 'キャンセル', deleting: '削除中…', unavailable: '現在プロジェクトを削除できません。しばらくしてから再試行してください。',
  },
} satisfies Record<Locale, Record<string, string>>

export function projectDeleteCopy(locale: Locale) { return messages[locale] }
