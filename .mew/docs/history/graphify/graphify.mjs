import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const GRAPHIFY_VERSION = '0.9.96'
const sourceRoots = ['src/', 'server/', 'packages/', 'apps/cli/', 'tools/', 'native/']
const codeExtension = /\.(?:[cm]?js|jsx|tsx?|py|rs|go|c|cc|cpp|h|hpp|sh)$/
const excludedPart = /(?:^|\/)(?:\.[^/]+|node_modules|dist(?:-[^/]*)?|target|vendor|__tests__|fixtures)(?:\/|$)/

export function isSourceFile(file) {
  if (excludedPart.test(file) || /\.(?:test|spec)\.[^.]+$/.test(file)) return false
  if (!sourceRoots.some((root) => file.startsWith(root)) && file.includes('/')) return false
  return codeExtension.test(file) || /(?:^|\/)(?:package|tsconfig(?:\.[^/]+)?)\.json$/.test(file)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error([result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      || `${path.basename(command)} exited with status ${result.status}`)
    error.exitCode = result.status ?? 1
    throw error
  }
  return result.stdout
}

export function collectSources(root) {
  const names = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
  const files = []
  const hash = createHash('sha256').update(`graphify:${GRAPHIFY_VERSION}\0`)
  for (const file of [...new Set(names.split('\0').filter(isSourceFile))].sort()) {
    const absolute = path.join(root, file)
    if (!existsSync(absolute)) continue
    // Also reject symlinked parent directories, including links inside the repo.
    if (!lstatSync(absolute).isFile() || realpathSync(absolute) !== absolute) continue
    const content = readFileSync(absolute)
    hash.update(file).update('\0').update(createHash('sha256').update(content).digest()).update('\0')
    files.push({ path: file, content })
  }
  return { files, fingerprint: hash.digest('hex') }
}

function locations(root) {
  const data = path.join(root, '.data', 'graphify')
  const bin = path.join(data, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin')
  return {
    data,
    current: path.join(data, 'current.json'),
    python: path.join(bin, process.platform === 'win32' ? 'python.exe' : 'python'),
  }
}

function localEnvironment() {
  return { ...process.env, GRAPHIFY_OUT: 'graphify-out', GRAPHIFY_BACKEND: 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1' }
}

function requirePython(root) {
  const { python } = locations(root)
  if (!existsSync(python)) throw new Error('Run node tools/graphify.mjs setup first (requires uv and Python >=3.10).')
  const version = run(python, ['-c', 'from importlib.metadata import version; print(version("graphifyy"))']).trim()
  if (version !== GRAPHIFY_VERSION) throw new Error(`Expected graphifyy ${GRAPHIFY_VERSION}; run node tools/graphify.mjs setup.`)
  return python
}

export function readCurrent(root) {
  const { data, current } = locations(root)
  if (!existsSync(current)) throw new Error('No code graph. Run node tools/graphify.mjs index first.')
  const state = JSON.parse(readFileSync(current, 'utf8'))
  if (!/^index-[\w-]+$/.test(state.generation) || state.version !== GRAPHIFY_VERSION) {
    throw new Error('Incompatible code graph. Run node tools/graphify.mjs index again.')
  }
  return { ...state, graph: path.join(data, state.generation, 'graphify-out', 'graph.json') }
}

export function indexProject(root, python = requirePython(root)) {
  const { data, current } = locations(root)
  const sources = collectSources(root)
  if (!sources.files.length) throw new Error('No eligible source files found.')
  mkdirSync(data, { recursive: true })
  if (existsSync(current)) {
    try {
      const previous = readCurrent(root)
      if (previous.fingerprint === sources.fingerprint && existsSync(previous.graph)) return previous
    } catch {
      // A fresh generation can replace a corrupt or older-version pointer.
    }
  }
  const generation = mkdtempSync(path.join(data, 'index-'))
  const snapshot = path.join(generation, 'source')
  try {
    for (const file of sources.files) {
      const destination = path.join(snapshot, file.path)
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, file.content)
    }
    const started = performance.now()
    run(python, ['-m', 'graphify', 'extract', snapshot, '--out', generation,
      '--code-only', '--no-cluster', '--no-gitignore', '--max-workers', '2'],
    { cwd: root, env: localEnvironment(), stdio: ['ignore', 'inherit', 'inherit'] })
    const graph = JSON.parse(readFileSync(path.join(generation, 'graphify-out', 'graph.json'), 'utf8'))
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.nodes.length) {
      throw new Error('Graphify produced an empty or unsupported code graph; previous graph preserved.')
    }
    const state = {
      version: GRAPHIFY_VERSION,
      generation: path.basename(generation),
      fingerprint: sources.fingerprint,
      createdAt: new Date().toISOString(),
      files: sources.files.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      indexMs: Math.round(performance.now() - started),
    }
    const temporary = path.join(generation, 'current.json')
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
    renameSync(temporary, current)
    return readCurrent(root)
  } catch (error) {
    rmSync(generation, { recursive: true, force: true })
    throw error
  }
}

export function queryProject(root, command, terms, python = requirePython(root)) {
  const arity = { query: 1, explain: 1, path: 2, affected: 1 }[command]
  if (!arity || terms.length !== arity || terms.some((term) => !term.trim() || term.startsWith('-'))) {
    throw new Error('Use query "question", explain "symbol", path "from" "to", or affected "symbol".')
  }
  const state = readCurrent(root)
  if (collectSources(root).fingerprint !== state.fingerprint) {
    throw new Error('Code graph is stale. Run node tools/graphify.mjs index, then retry; confirm findings in the current source.')
  }
  return run(python, ['-m', 'graphify', command, ...terms, '--graph', state.graph,
    ...(command === 'query' ? ['--budget', '1500'] : [])], { cwd: root, env: localEnvironment() })
}

export function main(args, root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))) {
  const [command, ...terms] = args
  if (command === 'setup' && !terms.length) {
    const { data, python } = locations(root)
    mkdirSync(data, { recursive: true })
    if (!existsSync(python)) run('uv', ['venv', '--python', '>=3.10', path.join(data, 'venv')], { stdio: 'inherit' })
    run('uv', ['pip', 'install', '--python', python, `graphifyy==${GRAPHIFY_VERSION}`], { stdio: 'inherit' })
    requirePython(root)
    console.log(`Installed graphifyy ${GRAPHIFY_VERSION} in .data/graphify/venv.`)
  } else if (command === 'index' && !terms.length) {
    console.log(JSON.stringify(indexProject(root), null, 2))
  } else if (command === 'status' && !terms.length) {
    const state = readCurrent(root)
    console.log(JSON.stringify({ ...state, stale: !existsSync(state.graph) || collectSources(root).fingerprint !== state.fingerprint }, null, 2))
  } else if (['query', 'explain', 'path', 'affected'].includes(command)) {
    process.stdout.write(queryProject(root, command, terms))
  } else {
    throw new Error('Usage: node tools/graphify.mjs setup|index|status|query "question"|explain "symbol"|path "from" "to"|affected "symbol"')
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)) }
  catch (error) {
    console.error(error.message)
    process.exitCode = error.exitCode || 1
  }
}
