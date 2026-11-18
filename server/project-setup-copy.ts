import { isWikiDocumentationPath } from '../shared/wiki-documentation.ts'

/** Localized first-project templates. Existing project documents are never translated. */
const copy = {
  ko: {
    agent: '에이전트 진입점', rules: '문서 관리', project: '프로젝트',
    agentDescription: '프로젝트 지침과 description을 이용해 작업에 필요한 기준 문서를 찾는 에이전트 진입점.',
    rulesDescription: '문서 description 작성, 기준본 소유권, 변경 사항 반영 및 이전 자료 보존 규칙.',
    read: '프로젝트 README와 기존 지침을 먼저 읽습니다. MOC는 선택 사항입니다. 작업 후 관련 기준 문서를 갱신합니다.',
    wikiSearch: '위키에서 문서 경로와 프론트매터 description을 확인한 뒤 관련 본문만 읽습니다.',
    fileSearch: '문서 경로와 본문 검색으로 필요한 현재 문서를 골라 읽습니다.',
    ownership: '한 내용은 한 문서를 기준으로 관리하고 다른 곳에서는 링크합니다. 현재 안내와 이전 자료를 구분하고 원본을 보존합니다.',
    update: '기능·코드·운영 절차가 바뀌면 같은 작업에서 해당 문서를 갱신합니다. 문서가 이동하면 기존 링크도 고칩니다. 기존 결정을 변경하기 전에 프로젝트의 결정 기록 규칙을 따릅니다. 비밀값이나 임시 디버깅 로그를 저장하지 않습니다.',
    wikiDescriptions: '새로 만들거나 수정하는 위키 문서에는 내용을 구분할 수 있는 description을 작성합니다.',
    purpose: '목표, 시작 방법, 필요한 설정, 검증 방법을 기록합니다.',
  },
  ja: {
    agent: 'エージェントの入口', rules: '文書管理', project: 'プロジェクト',
    agentDescription: 'プロジェクトの指示とdescriptionから必要な基準文書を探すエージェントの入口。',
    rulesDescription: '文書のdescription、基準文書の所有、変更の反映と過去の資料の保存に関する規則。',
    read: '最初にプロジェクトのREADMEと既存の指示を読みます。MOCの利用は任意です。作業後は関連する基準文書を更新します。',
    wikiSearch: 'Wikiの文書パスとフロントマターのdescriptionを確認してから、関連する本文を読みます。',
    fileSearch: '文書のパスと本文検索から、必要な現行文書を選んで読みます。',
    ownership: '各内容の基準文書を一つにし、他の場所からはリンクします。現在の案内と過去の資料を分け、原本を保存します。',
    update: '機能・コード・運用手順を変更したら同じ作業で文書を更新します。移動した文書への既存リンクも修正します。既存の決定を変更する前にプロジェクトの決定記録ルールに従います。秘密情報や一時的なデバッグログを保存しません。',
    wikiDescriptions: 'Wikiの文書を作成または更新するときは、内容を識別できるdescriptionを書きます。',
    purpose: '目的、開始方法、必要な設定、検証方法を記録します。',
  },
  'zh-CN': {
    agent: '智能体入口', rules: '文档管理', project: '项目',
    agentDescription: '通过项目指令和description查找任务所需基准文档的智能体入口。',
    rulesDescription: '文档description编写、基准文档归属、变更同步与历史资料保留规则。',
    read: '先阅读项目README和现有指令。可按需使用MOC。完成工作后更新相关的基准文档。',
    wikiSearch: '先查看Wiki文档路径和前置元数据的description，再阅读相关文档的正文。',
    fileSearch: '通过文档路径和正文搜索，选读相关的当前文档。',
    ownership: '每项内容只保留一份基准文档，其他位置使用链接。区分当前指南与历史资料，并保留原件。',
    update: '功能、代码或操作流程变更时，在同一任务中更新相关文档。文档移动后修正已有链接。修改现有决定前遵循项目的决策记录规则。不要保存密钥或临时调试日志。',
    wikiDescriptions: '新建或修改Wiki文档时，编写能够区分其内容的description。',
    purpose: '记录目标、开始方法、必要配置和验证方法。',
  },
}
export function localizedProjectTemplates(locale: string | undefined, docs: string): Map<string, string> | null {
  const c = copy[locale as keyof typeof copy]
  if (!c) return null
  const encoded = docs.split('/').map(encodeURIComponent).join('/')
  const wiki = isWikiDocumentationPath(docs)
  const frontmatter = (description: string) => wiki ? `---\ndescription: ${JSON.stringify(description)}\n---\n\n` : ''
  const discovery = wiki ? c.wikiSearch : c.fileSearch
  const descriptions = wiki ? `\n\n${c.wikiDescriptions}` : ''
  return new Map([
    [`${docs}/AGENT.md`, `${frontmatter(c.agentDescription)}# ${c.agent}\n\n[${c.rules}](README.md)\n\n${c.read} ${discovery}\n`],
    [`${docs}/README.md`, `${frontmatter(c.rulesDescription)}# ${c.rules}\n\n[${c.agent}](AGENT.md)\n\n${c.ownership}\n\n${c.read} ${discovery}\n\n${c.update}${descriptions}\n`],
    ['README.md', `# ${c.project}\n\n${c.purpose}\n\n[${c.rules}](${encoded}/README.md) · [${c.agent}](${encoded}/AGENT.md)\n`],
  ])
}
