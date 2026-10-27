import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { collectSources, GRAPHIFY_VERSION, readCurrent } from './graphify.mjs'

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const tool = fileURLToPath(new URL('./graphify.mjs', import.meta.url))
const caseFile = fileURLToPath(new URL('./graphify-benchmark-cases.json', import.meta.url))

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function percentile(values, fraction) {
  if (!values.length) return null
  if (fraction < 0 || fraction > 1) throw new Error('Percentile fraction must be between 0 and 1.')
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

export function candidateFiles(output, files) {
  const matches = []
  for (const file of files) {
    let position = output.indexOf(file)
    while (position !== -1) {
      const before = output[position - 1] ?? ''
      const after = output[position + file.length] ?? ''
      if (!/[\w./-]/.test(before) && !/[\w./-]/.test(after)) {
        matches.push({ file, position })
        break
      }
      position = output.indexOf(file, position + 1)
    }
  }
  return matches.sort((a, b) => a.position - b.position).map((match) => match.file)
}

export function coverage(expected, candidates, limit = Infinity) {
  const gold = [...new Set(expected)]
  if (!gold.length) return null
  const returned = new Set(candidates.slice(0, limit))
  return gold.filter((file) => returned.has(file)).length / gold.length
}

export function pathEvidence(output) {
  const relations = [...output.matchAll(/--([a-z_]+) \[(?:EXTRACTED|INFERRED)\]/g)].map((match) => match[1])
  return {
    relations,
    forwardCallOnly: relations.length > 0 && !output.includes('<--')
      && relations.every((relation) => relation === 'calls' || relation === 'indirect_call'),
  }
}

function execute(command, args, options = {}) {
  const started = performance.now()
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000, ...options })
  return {
    ms: performance.now() - started,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? null,
  }
}

function checked(command, args, options) {
  const result = execute(command, args, options)
  if (result.status !== 0 || result.error) throw new Error(`${command}: ${result.error || result.stderr || result.stdout}`)
  return result
}

export function rgArguments(task, files) {
  return ['--no-config', '--color', 'never', '--sort', 'path', '--line-number', '--with-filename',
    '--fixed-strings', '--word-regexp', ...task.rgTerms.flatMap((term) => ['-e', term]), '--', ...files]
}

function graphCommand(corpus, args) {
  const program = `import {main} from ${JSON.stringify(pathToFileURL(tool).href)};
try { main(JSON.parse(process.argv[2]), process.argv[1]); }
catch(error) { console.error(error.message); process.exitCode=error.exitCode||1; }`
  return execute(process.execPath, ['--input-type=module', '-e', program, corpus, JSON.stringify(args)], { cwd: corpus })
}

function summarize(records) {
  const groups = {}
  for (const kind of ['all', 'lookup', 'callers', 'path']) {
    groups[kind] = {}
    for (const method of ['rg', 'graph-query', 'graph-specialized']) {
      const rows = records.filter((row) => row.method === method && (kind === 'all' || row.kind === kind))
      const first = rows.filter((row) => row.round === 0)
      const fileRows = first.filter((row) => row.recall !== null)
      groups[kind][method] = {
        tasks: first.length,
        samples: rows.length,
        medianMs: median(rows.map((row) => row.ms)),
        p95Ms: percentile(rows.map((row) => row.ms), 0.95),
        medianTaskMs: median(first.map((row) => median(rows.filter((other) => other.id === row.id).map((other) => other.ms)))),
        medianBytes: median(first.map((row) => row.bytes)),
        medianOutputTokens: median(first.map((row) => row.outputTokens)),
        totalOutputTokens: first.reduce((sum, row) => sum + row.outputTokens, 0),
        meanKnownFileRecall: fileRows.length ? fileRows.reduce((sum, row) => sum + row.recall, 0) / fileRows.length : null,
        meanKnownFileRecallAt10: fileRows.length ? fileRows.reduce((sum, row) => sum + row.recallAt10, 0) / fileRows.length : null,
        allKnownFilesFound: fileRows.filter((row) => row.recall === 1).length,
        fileScoredTasks: fileRows.length,
        medianCandidates: median(first.map((row) => row.candidates.length)),
        successfulTasks: first.filter((row) => row.status === 0).length,
        failures: first.filter((row) => row.status !== 0).map((row) => ({ id: row.id, status: row.status })),
        failedSamples: rows.filter((row) => row.status !== 0).length,
        forwardCallOnlyPaths: first.filter((row) => row.forwardCallOnly === true).length,
      }
    }
  }
  return groups
}

export function runBenchmark({ output, rounds = 5, tasks = JSON.parse(readFileSync(caseFile, 'utf8')) }) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 15) throw new Error('rounds must be an integer between 1 and 15.')
  output = path.resolve(output)
  if (!output.startsWith(`${path.join(root, '.data')}${path.sep}`)) throw new Error('Output must be inside this repository\'s .data directory.')
  if (existsSync(output)) throw new Error('Use a new output directory to preserve previous results.')
  const python = path.join(root, '.data/graphify/venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const tokenizerPython = process.env.MEW_GRAPHIFY_TOKENIZER_PYTHON || 'python3'
  checked(tokenizerPython, ['-c', 'import tiktoken; tiktoken.get_encoding("o200k_base")'])
  const pythonVersion = checked(python, ['-c', 'import platform; from importlib.metadata import version; print(platform.python_version()); print(version("graphifyy"))']).stdout.trim()
  if (!pythonVersion.endsWith(`\n${GRAPHIFY_VERSION}`)) throw new Error('Run node tools/graphify.mjs setup for the pinned Graphify version.')

  const revisionAtStart = checked('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim()
  const source = collectSources(root)
  const files = source.files.map((file) => file.path)
  for (const task of tasks) {
    if (!['lookup', 'callers', 'path'].includes(task.kind) || task.terms.length !== (task.kind === 'path' ? 2 : 1)) throw new Error(`Invalid task: ${task.id}`)
    for (const file of task.expectedFiles) if (!files.includes(file)) throw new Error(`Gold file outside corpus: ${file}`)
  }
  mkdirSync(output, { recursive: true })
  const corpus = path.join(output, 'corpus')
  for (const file of source.files) {
    const destination = path.join(corpus, file.path)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, file.content)
  }
  writeFileSync(path.join(corpus, '.gitignore'), '.data/\n')
  checked('git', ['init', '--quiet', corpus])
  const localData = path.join(corpus, '.data/graphify')
  mkdirSync(localData, { recursive: true })
  symlinkSync(path.join(root, '.data/graphify/venv'), path.join(localData, 'venv'), 'dir')
  if (collectSources(corpus).fingerprint !== source.fingerprint) throw new Error('Frozen corpus fingerprint differs from selected source.')

  const artifact = (name, value) => writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`)
  artifact('cases.json', tasks)
  artifact('source-hashes.json', source.files.map((file) => ({ path: file.path, sha256: createHash('sha256').update(file.content).digest('hex') })))
  writeFileSync(path.join(output, 'graphify.mjs'), readFileSync(tool))
  writeFileSync(path.join(output, 'benchmark.mjs'), readFileSync(fileURLToPath(import.meta.url)))

  process.stdout.write(`Frozen ${files.length} files. Building an isolated fresh index...\n`)
  const cold = graphCommand(corpus, ['index'])
  writeFileSync(path.join(output, 'index.stdout.txt'), cold.stdout)
  writeFileSync(path.join(output, 'index.stderr.txt'), cold.stderr)
  if (cold.status !== 0) throw new Error(cold.stderr || cold.error || 'Cold index failed.')
  const state = readCurrent(corpus)
  const noOp = graphCommand(corpus, ['index'])
  if (noOp.status !== 0) throw new Error(noOp.stderr)
  const graphBytes = readFileSync(state.graph).length
  const methods = ['rg', 'graph-query', 'graph-specialized']
  const invoke = (method, task) => {
    if (method === 'rg') return execute('rg', rgArguments(task, files), { cwd: corpus })
    if (method === 'graph-query') return graphCommand(corpus, ['query', task.rgTerms.join(' ')])
    const command = { lookup: 'explain', callers: 'affected', path: 'path' }[task.kind]
    return graphCommand(corpus, [command, ...task.terms])
  }
  const records = []
  // One unmeasured pass per task/method warms filesystem and graph reads; subprocesses stay fresh.
  process.stdout.write(`Warm-up: ${tasks.length} tasks × 3 methods (no timing samples retained).\n`)
  for (const task of tasks) for (const method of methods) invoke(method, task)
  for (let round = 0; round < rounds; round++) {
    process.stdout.write(`Measured round ${round + 1}/${rounds}\n`)
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index]
      const offset = (round + index) % methods.length
      for (let step = 0; step < methods.length; step++) {
        const method = methods[(offset + step) % methods.length]
        const result = invoke(method, task)
        const text = [result.stdout, result.stderr].filter(Boolean).join('\n')
        const candidates = result.status === 0 ? candidateFiles(text, files) : []
        // `path` emits symbol labels without source paths. Do not credit inferred file locations.
        const scoreFiles = !(method === 'graph-specialized' && task.kind === 'path')
        const record = {
          id: task.id, kind: task.kind, method, round, ms: result.ms, status: result.status, error: result.error,
          bytes: Buffer.byteLength(text), candidates,
          ...(method === 'graph-specialized' && task.kind === 'path' ? pathEvidence(text) : {}),
          recall: scoreFiles ? coverage(task.expectedFiles, candidates) : null,
          recallAt10: scoreFiles ? coverage(task.expectedFiles, candidates, 10) : null,
          text,
        }
        records.push(record)
        if (round === 0) {
          const prefix = `${task.id}.${method}`
          writeFileSync(path.join(output, `${prefix}.stdout.txt`), result.stdout)
          writeFileSync(path.join(output, `${prefix}.stderr.txt`), result.stderr)
        }
      }
    }
  }
  if (collectSources(corpus).fingerprint !== source.fingerprint) throw new Error('Corpus changed while benchmarking; discard run.')
  // Tokenization happens after all timing runs and is output-text accounting, not model billing.
  const tokenized = checked(tokenizerPython, ['-c', 'import json,sys,tiktoken,importlib.metadata; e=tiktoken.get_encoding("o200k_base"); texts=json.load(sys.stdin); print(json.dumps({"version":importlib.metadata.version("tiktoken"),"counts":[len(e.encode(t,disallowed_special=())) for t in texts]}))'],
    { input: JSON.stringify(records.map((row) => row.text)) })
  const tokens = JSON.parse(tokenized.stdout)
  for (let index = 0; index < records.length; index++) {
    records[index].outputTokens = tokens.counts[index]
    delete records[index].text
  }
  const report = {
    createdAt: new Date().toISOString(),
    revisionAtStart,
    revisionAtEnd: checked('git', ['rev-parse', 'HEAD'], { cwd: root }).stdout.trim(),
    corpus: { fingerprint: source.fingerprint, files: files.length, bytes: source.files.reduce((sum, file) => sum + file.content.length, 0) },
    environment: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, node: process.version, python: pythonVersion,
      ripgrep: checked('rg', ['--version']).stdout.split('\n')[0], graphify: GRAPHIFY_VERSION, tokenizer: `tiktoken ${tokens.version} o200k_base` },
    protocol: { rounds, warmupPasses: 1, freshProcessPerCommand: true, alternatingOrder: true, elapsedIncludesWrapperChecks: true,
      knownFileRecallIsSubsetMetric: true, pathSpecializedFileRecall: 'not scored: stdout has labels without file locations', modelCalls: 0 },
    index: { coldMs: cold.ms, extractionMs: state.indexMs, noOpMs: noOp.ms, nodes: state.nodes, edges: state.edges, graphBytes },
    summary: summarize(records),
    records,
  }
  artifact('results.json', report)
  console.log(JSON.stringify({ output, ...report, records: undefined }, null, 2))
  return report
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [output, rounds = '5'] = process.argv.slice(2)
    if (!output) throw new Error('Usage: node tools/graphify-benchmark.mjs .data/benchmarks/<new-name> [rounds=5]')
    runBenchmark({ output, rounds: Number(rounds) })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
