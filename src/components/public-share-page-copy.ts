import type { Locale } from '../i18n-locales.ts'

const english = {
  unavailable: 'This public link is unavailable.', retry: 'Retry', select: 'Select a file.', empty: 'This folder is empty.',
  save: 'Save', saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', readOnly: 'View only',
  conflict: 'This file changed elsewhere. Your changes have been kept. Open the latest version to continue.',
  saveFailed: 'Changes could not be saved. Retry to keep editing.', latest: 'Open latest version',
  discard: 'Discard your unsaved changes and open the latest version?',
  unsupported: 'This action is unavailable in a public document.', download: 'Download', files: 'Files', reload: 'Reload',
  plain: 'Source', rendered: 'Document',
}
export function publicSharePageCopy(locale: Locale): typeof english {
  if (locale === 'ko') return {
    unavailable: '사용할 수 없는 공개 링크입니다.', retry: '다시 시도', select: '파일을 선택하세요.', empty: '빈 폴더입니다.',
    save: '저장', saved: '저장됨', saving: '저장 중…', unsaved: '저장하지 않은 변경', readOnly: '보기 전용',
    conflict: '다른 곳에서 파일이 변경됐습니다. 입력한 내용은 유지됩니다. 최신 내용을 열어 계속하세요.',
    saveFailed: '변경 내용을 저장하지 못했습니다. 다시 시도해 주세요.', latest: '최신 내용 열기',
    discard: '저장하지 않은 변경을 버리고 최신 내용을 열까요?',
    unsupported: '공개 문서에서는 사용할 수 없는 기능입니다.', download: '다운로드', files: '파일', reload: '새로고침',
    plain: '원문', rendered: '문서',
  }
  if (locale === 'ja') return {
    unavailable: 'この公開リンクは利用できません。', retry: '再試行', select: 'ファイルを選択してください。', empty: '空のフォルダーです。',
    save: '保存', saved: '保存済み', saving: '保存中…', unsaved: '未保存の変更', readOnly: '閲覧のみ',
    conflict: '別の場所でファイルが変更されました。入力内容は保持されています。最新の内容を開いてください。',
    saveFailed: '変更を保存できませんでした。再試行してください。', latest: '最新の内容を開く',
    discard: '未保存の変更を破棄して最新の内容を開きますか？',
    unsupported: '公開文書では利用できません。', download: 'ダウンロード', files: 'ファイル', reload: '再読み込み',
    plain: 'ソース', rendered: '文書',
  }
  if (locale === 'zh-CN') return {
    unavailable: '此公开链接不可用。', retry: '重试', select: '请选择文件。', empty: '此文件夹为空。',
    save: '保存', saved: '已保存', saving: '保存中…', unsaved: '未保存的更改', readOnly: '仅查看',
    conflict: '文件已在其他位置更改。您的输入已保留，请打开最新版本后继续。',
    saveFailed: '无法保存更改，请重试。', latest: '打开最新版本', discard: '放弃未保存的更改并打开最新版本？',
    unsupported: '公开文档不支持此操作。', download: '下载', files: '文件', reload: '刷新', plain: '源码', rendered: '文档',
  }
  return english
}
