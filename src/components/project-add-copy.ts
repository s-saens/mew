import type { Locale } from '../i18n-locales'

const messages = {
  ko: {
    add: '프로젝트 추가', clone: 'Git repo 클론하기', create: '새 프로젝트 만들기', import: '프로젝트 가져오기',
    heading: '프로젝트를 추가하세요', workspace: '이 워크스페이스에서 가져오기', browse: '경로 탐색하기', back: '이전 선택지로',
    confirmCreate: '프로젝트 만들기', confirmClone: '저장소 복제',
    repositories: 'GitHub 저장소', noRepositories: '접근 가능한 저장소가 없습니다.',
    privateRepository: '비공개 저장소', openFailed: '프로젝트를 열지 못했습니다. 다시 시도하세요.',
  },
  en: {
    add: 'Add project', clone: 'Clone Git repo', create: 'Create new project', import: 'Import project',
    heading: 'Add a project', workspace: 'Import from this workspace', browse: 'Browse paths', back: 'Previous choices',
    confirmCreate: 'Create project', confirmClone: 'Clone repository',
    repositories: 'GitHub repositories', noRepositories: 'No accessible repositories.',
    privateRepository: 'Private repository', openFailed: 'Could not open the project. Try again.',
  },
  'zh-CN': {
    add: '添加项目', clone: '克隆 Git 仓库', create: '新建项目', import: '导入项目',
    heading: '添加项目', workspace: '从此工作区导入', browse: '浏览路径', back: '返回上一级选项',
    confirmCreate: '创建项目', confirmClone: '克隆仓库',
    repositories: 'GitHub 仓库', noRepositories: '没有可访问的仓库。',
    privateRepository: '私有仓库', openFailed: '无法打开项目，请重试。',
  },
  ja: {
    add: 'プロジェクトを追加', clone: 'Git リポジトリをクローン', create: '新規プロジェクトを作成', import: 'プロジェクトを取り込む',
    heading: 'プロジェクトを追加してください', workspace: 'このワークスペースから取り込む', browse: 'パスを参照', back: '前の選択肢に戻る',
    confirmCreate: 'プロジェクトを作成', confirmClone: 'リポジトリを複製',
    repositories: 'GitHub リポジトリ', noRepositories: 'アクセスできるリポジトリがありません。',
    privateRepository: 'プライベートリポジトリ', openFailed: 'プロジェクトを開けませんでした。再試行してください。',
  },
} satisfies Record<Locale, Record<string, string>>

export function projectAddCopy(locale: Locale) { return messages[locale] }
