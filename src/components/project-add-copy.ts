import type { Locale } from '../i18n-locales'

const messages = {
  ko: {
    add: '추가', clone: 'Git 복제', create: '새 프로젝트', existing: '기존 연결',
    existingLabel: '기존 프로젝트', confirmCreate: '프로젝트 만들기', confirmClone: '저장소 복제',
    repositories: 'GitHub 저장소', noRepositories: '접근 가능한 저장소가 없습니다.',
    privateRepository: '비공개 저장소', openFailed: '프로젝트를 열지 못했습니다. 다시 시도하세요.',
  },
  en: {
    add: 'Add', clone: 'Git clone', create: 'New project', existing: 'Existing',
    existingLabel: 'Existing project', confirmCreate: 'Create project', confirmClone: 'Clone repository',
    repositories: 'GitHub repositories', noRepositories: 'No accessible repositories.',
    privateRepository: 'Private repository', openFailed: 'Could not open the project. Try again.',
  },
  'zh-CN': {
    add: '添加', clone: 'Git 克隆', create: '新建项目', existing: '已有项目',
    existingLabel: '已有项目', confirmCreate: '创建项目', confirmClone: '克隆仓库',
    repositories: 'GitHub 仓库', noRepositories: '没有可访问的仓库。',
    privateRepository: '私有仓库', openFailed: '无法打开项目，请重试。',
  },
  ja: {
    add: '追加', clone: 'Git 複製', create: '新規', existing: '既存',
    existingLabel: '既存のプロジェクト', confirmCreate: 'プロジェクトを作成', confirmClone: 'リポジトリを複製',
    repositories: 'GitHub リポジトリ', noRepositories: 'アクセスできるリポジトリがありません。',
    privateRepository: 'プライベートリポジトリ', openFailed: 'プロジェクトを開けませんでした。再試行してください。',
  },
} satisfies Record<Locale, Record<string, string>>

export function projectAddCopy(locale: Locale) { return messages[locale] }
