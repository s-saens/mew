import type { Locale } from '../i18n-locales'

const messages = {
  ko: {
    serverUpdateRequired: '서버에서 프로젝트 삭제 API를 찾을 수 없습니다. Mew 서버를 업데이트하고 재시작한 뒤 다시 시도하세요.',
    remove: '삭제', removeFromMine: '내 프로젝트에서 삭제하기', permanently: '완전히 삭제하기',
    title: '프로젝트를 삭제할까요?',
    deleteFiles: '디스크에서도 프로젝트 폴더와 파일을 삭제',
    irreversible: '디스크에서 삭제하면 되돌릴 수 없습니다.',
    detail: '모든 사용자의 프로젝트 목록에서 제거합니다. 체크하지 않으면 디스크의 파일은 유지됩니다.',
    cancel: '취소', deleting: '삭제 중…', unavailable: '지금은 프로젝트를 삭제할 수 없습니다. 잠시 후 다시 시도하세요.',
  },
  en: {
    serverUpdateRequired: 'The project deletion API is unavailable on this server. Update and restart the Mew server, then try again.',
    remove: 'Delete', removeFromMine: 'Remove from My Projects', permanently: 'Delete permanently',
    title: 'Delete this project?',
    deleteFiles: 'Also delete the project folder and files from disk',
    irreversible: 'Deleting files from disk cannot be undone.',
    detail: 'This removes the project from everyone’s project list. Files remain on disk unless checked.',
    cancel: 'Cancel', deleting: 'Deleting…', unavailable: 'Cannot delete the project right now. Please try again shortly.',
  },
  'zh-CN': {
    serverUpdateRequired: '此服务器未提供项目删除 API。请更新并重启 Mew 服务器后重试。',
    remove: '删除', removeFromMine: '从我的项目中移除', permanently: '永久删除',
    title: '删除此项目？',
    deleteFiles: '同时删除磁盘上的项目文件夹和文件',
    irreversible: '从磁盘删除文件后无法撤销。',
    detail: '项目将从所有用户的列表中移除。未勾选时磁盘文件会保留。',
    cancel: '取消', deleting: '正在删除…', unavailable: '暂时无法删除项目，请稍后重试。',
  },
  ja: {
    serverUpdateRequired: 'このサーバーではプロジェクト削除 API を利用できません。Mew サーバーを更新して再起動してから、もう一度お試しください。',
    remove: '削除', removeFromMine: '自分のプロジェクトから外す', permanently: '完全に削除',
    title: 'プロジェクトを削除しますか？',
    deleteFiles: 'ディスクからプロジェクトフォルダーとファイルも削除する',
    irreversible: 'ディスクからファイルを削除すると元に戻せません。',
    detail: 'すべてのユーザーのプロジェクト一覧から削除します。チェックしなければディスク上のファイルは残ります。',
    cancel: 'キャンセル', deleting: '削除中…', unavailable: '現在プロジェクトを削除できません。しばらくしてから再試行してください。',
  },
} satisfies Record<Locale, Record<string, string>>

export function projectDeleteCopy(locale: Locale) { return messages[locale] }
