import type { Extension } from '@codemirror/state'

export type CodeLanguage = { extensions: Extension[]; jsonLinter?: ReturnType<typeof import('@codemirror/lang-json')['jsonParseLinter']>; databaseLinks?: typeof import('./database-links')['databaseLinks'] }
const empty: CodeLanguage = { extensions: [] }
const prepared = new Map<string, CodeLanguage>()
const loading = new Map<string, Promise<CodeLanguage>>()

export function codeLanguageKey(filePath: string): string {
  const name = filePath.split('/').pop() ?? filePath
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (['md', 'mdx'].includes(extension)) return 'markdown'
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(extension)) return extension === 'mjs' || extension === 'cjs' ? 'js' : extension
  if (['json', 'jsonc'].includes(extension)) return 'json'
  if (['yml', 'yaml'].includes(extension)) return 'yaml'
  if (['css', 'scss', 'html', 'sql'].includes(extension)) return extension
  if (extension === 'svg') return 'xml'
  if (extension === 'py') return 'python'
  if (extension === 'rs') return 'rust'
  if (extension === 'go') return 'go'
  if (['sh', 'zsh', 'bash'].includes(extension) || name === 'Dockerfile' || name === 'Makefile') return 'shell'
  if (['toml', 'ini'].includes(extension)) return 'toml'
  if (name === '.gitignore' || name === '.env' || name.startsWith('.env.')) return 'properties'
  return ''
}

async function prepare(key: string): Promise<CodeLanguage> {
  switch (key) {
    case 'markdown': { const [language, links] = await Promise.all([import('@codemirror/lang-markdown'), import('./database-links')]); return { extensions: [language.markdown()], databaseLinks: links.databaseLinks } }
    case 'ts': case 'tsx': case 'js': case 'jsx': return { extensions: [(await import('@codemirror/lang-javascript')).javascript({ typescript: key === 'ts' || key === 'tsx', jsx: key === 'jsx' || key === 'tsx' })] }
    case 'json': { const module = await import('@codemirror/lang-json'); return { extensions: [module.json()], jsonLinter: module.jsonParseLinter() } }
    case 'yaml': return { extensions: [(await import('@codemirror/lang-yaml')).yaml()] }
    case 'css': return { extensions: [(await import('@codemirror/lang-css')).css()] }
    case 'html': return { extensions: [(await import('@codemirror/lang-html')).html()] }
    case 'python': return { extensions: [(await import('@codemirror/lang-python')).python()] }
    case 'sql': return { extensions: [(await import('@codemirror/lang-sql')).sql()] }
    case 'rust': return { extensions: [(await import('@codemirror/lang-rust')).rust()] }
    case 'go': return { extensions: [(await import('@codemirror/lang-go')).go()] }
    case 'xml': return { extensions: [(await import('@codemirror/lang-xml')).xml()] }
    case 'scss': { const [language, mode] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/css')]); return { extensions: [language.StreamLanguage.define(mode.sCSS)] } }
    case 'shell': { const [language, mode] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/shell')]); return { extensions: [language.StreamLanguage.define(mode.shell)] } }
    case 'toml': { const [language, mode] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/toml')]); return { extensions: [language.StreamLanguage.define(mode.toml)] } }
    case 'properties': { const [language, mode] = await Promise.all([import('@codemirror/language'), import('@codemirror/legacy-modes/mode/properties')]); return { extensions: [language.StreamLanguage.define(mode.properties)] } }
    default: return empty
  }
}

export function preparedCodeLanguage(filePath: string): CodeLanguage | undefined {
  const key = codeLanguageKey(filePath)
  return key ? prepared.get(key) : empty
}

export function loadCodeLanguage(filePath: string): Promise<CodeLanguage> {
  const key = codeLanguageKey(filePath), cached = preparedCodeLanguage(filePath)
  if (cached) return Promise.resolve(cached)
  let pending = loading.get(key)
  if (!pending) {
    pending = prepare(key).then(language => { prepared.set(key, language); loading.delete(key); return language }, error => { loading.delete(key); throw error })
    loading.set(key, pending)
  }
  return pending
}
