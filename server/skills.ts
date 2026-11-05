import os from 'node:os'
import { workspacePaths } from './paths.ts'
import { readAgentSettings } from './agentSettings.ts'
import { SkillLibraryStore, skillLibrary } from './skill-library.ts'

export interface SkillSummary {
  name: string
  description: string
  path: string
}

/** Suggestions and explicit selection share the same enabled library as automatic guidance. */
export function listSkills(cwd = workspacePaths.root, runtime = 'codex', home?: string, env?: NodeJS.ProcessEnv): SkillSummary[] {
  const store = home === undefined && env === undefined ? skillLibrary : new SkillLibraryStore({
    home: home ?? os.homedir(), env: env ?? process.env,
    runtimeEnvs: Object.fromEntries(Object.entries(readAgentSettings()).map(([id, setting]) => [id, setting.env ?? {}])),
  })
  return store.resolve(cwd, runtime).map(({ name, description, path }) => ({ name, description, path }))
}
