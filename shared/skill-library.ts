export type SkillScope = 'common' | 'project'

export interface SkillOrigin {
  id: string
  label: string
  path: string
  agent: string
}

export interface SkillLibraryItem {
  id: string
  name: string
  description: string
  path: string
  scope: SkillScope
  enabled: boolean
  enabledScope: SkillScope
  commonEnabled?: boolean
  source: 'managed' | 'builtin'
  editable: boolean
  revision: string
  origins: SkillOrigin[]
  overridesCommon?: boolean
}

export interface SkillImportCandidate {
  id: string
  name: string
  description: string
  path: string
  agent: string
  scope: SkillScope
  label: string
  revision: string
  importable: boolean
  reason?: string
}

export interface SkillLibraryInventory {
  items: SkillLibraryItem[]
  candidates: SkillImportCandidate[]
  defaults: { name: string; description: string; installed: boolean }[]
  warnings: string[]
}

export interface SkillLibraryDetail {
  item?: SkillLibraryItem
  candidate?: SkillImportCandidate
  content: string
  files: string[]
  revision: string
}

export interface SkillLibraryMutation {
  cwd: string
  action: 'create' | 'save' | 'toggle' | 'reset' | 'delete' | 'import' | 'restore'
  id?: string
  name?: string
  content?: string
  scope?: SkillScope
  enabled?: boolean
  revision?: string
}
