import type { FileVersion } from './file-version.ts'

export type PublicShareMode = 'view' | 'edit'
export type PublicShareSetting = 'off' | PublicShareMode
export type PublicShareType = 'f' | 'd'

export interface PublicShare {
  id: string
  type: PublicShareType
  path: string
  mode: PublicShareMode
  url: string
}

export interface PublicShareInfo {
  name: string
  type: PublicShareType
  mode: PublicShareMode
}

export interface PublicShareFile {
  name: string
  path: string
  content: string
  version: FileVersion
}
