import type { Locale } from '../i18n-locales'

const ko = {
  global: '뮤 전역 지침', project: '현재 프로젝트', scope: '지침 적용 범위',
  globalHint: '현재 계정의 모든 프로젝트에 공통으로 적용됩니다. 변경 내용은 다음 요청부터 반영됩니다.',
  projectHint: '이 프로젝트에만 적용됩니다. 전역 설정과 충돌하면 프로젝트 지침을 우선합니다.',
  instructions: '추가 지침', save: '지침 저장', enabled: '프로젝트 자동 안내',
  disabled: '자동 안내가 꺼져 있어 전역·프로젝트 지침이 모두 전달되지 않습니다.',
  changed: '프로젝트가 변경되었습니다. 설정 창을 다시 여세요.',
  unsaved: '저장하지 않은 지침을 버릴까요?', discard: '변경 버리기', cancel: '취소',
}
export const guidanceScopeCopy: Record<Locale, { [K in keyof typeof ko]: string }> = {
  ko,
  en: { global: 'Mew-wide', project: 'Current project', scope: 'Instruction scope', globalHint: 'Shared by all projects in your account. Changes apply from the next request.', projectHint: 'Applies only to this project. Project instructions take precedence over conflicting global preferences.', instructions: 'Additional instructions', save: 'Save instructions', enabled: 'Project guidance', disabled: 'Guidance is off. Neither global nor project instructions will be sent.', changed: 'The project changed. Reopen settings.', unsaved: 'Discard unsaved instructions?', discard: 'Discard changes', cancel: 'Cancel' },
  ja: { global: 'Mew全体', project: '現在のプロジェクト', scope: '指針の適用範囲', globalHint: 'このアカウントの全プロジェクトに適用します。変更は次のリクエストから反映されます。', projectHint: 'このプロジェクトだけに適用します。全体設定と競合する場合はプロジェクトの指針を優先します。', instructions: '追加の指針', save: '指針を保存', enabled: 'プロジェクトの自動案内', disabled: '自動案内が無効のため、全体・プロジェクトの指針は送信されません。', changed: 'プロジェクトが変わりました。設定を開き直してください。', unsaved: '未保存の指針を破棄しますか？', discard: '変更を破棄', cancel: 'キャンセル' },
  'zh-CN': { global: 'Mew 全局', project: '当前项目', scope: '指引作用范围', globalHint: '适用于当前账号的所有项目，更改从下一次请求开始生效。', projectHint: '仅适用于当前项目。与全局设置冲突时，优先使用项目指引。', instructions: '附加指引', save: '保存指引', enabled: '项目自动指引', disabled: '自动指引已关闭，全局和项目指引都不会发送。', changed: '项目已更改，请重新打开设置。', unsaved: '放弃未保存的指引？', discard: '放弃更改', cancel: '取消' },
}
