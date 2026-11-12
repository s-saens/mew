import fs from 'node:fs'
import path from 'node:path'
import type { ProjectAction } from '../shared/project-actions.ts'

export interface DiscoveredProjectActions { actions: ProjectAction[]; warnings: string[] }

function regularFile(root: string, relative: string): boolean {
  try { return fs.lstatSync(path.join(root, relative)).isFile() } catch { return false }
}

function packageActions(root: string, result: DiscoveredProjectActions): void {
  if (!regularFile(root, 'package.json')) return
  try {
    const file = path.join(root, 'package.json')
    if (fs.statSync(file).size > 1_048_576) throw new Error('package.json is too large')
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, unknown>; packageManager?: unknown }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid package.json')
    const manager = (['pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'yarn.lock', 'package-lock.json', 'npm-shrinkwrap.json'] as const)
      .find(file => regularFile(root, file))
    const declared = typeof manifest.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)(?:@|$)/.exec(manifest.packageManager)?.[1] : undefined
    const runner = manager?.startsWith('pnpm') ? 'pnpm' : manager?.startsWith('bun') ? 'bun' : manager === 'yarn.lock' ? 'yarn' : manager ? 'npm' : declared ?? 'npm'
    for (const script of ['build', 'build:debug', 'build:release', 'deploy'] as const) {
      if (typeof manifest.scripts?.[script] !== 'string' || !manifest.scripts[script].trim()) continue
      const kind = script === 'deploy' ? 'deploy' : 'build'
      const variant = script === 'build:debug' ? 'debug' : script === 'build:release' ? 'release' : 'custom'
      const name = script === 'build:debug' ? 'Debug build' : script === 'build:release' ? 'Release build' : kind === 'deploy' ? 'Deploy' : 'Build'
      result.actions.push({ id: `npm:${script}`, name, kind, command: `${runner} run ${script}`, ...(kind === 'build' ? { variant } : {}) })
    }
  } catch { result.warnings.push('package.json을 읽을 수 없습니다. 에이전트로 빌드 설정을 확인하세요.') }
}

function androidActions(root: string, result: DiscoveredProjectActions): void {
  for (const prefix of ['', 'android/']) {
    const wrapper = `${prefix}${process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'}`
    if (!regularFile(root, wrapper)) continue
    let directories = ['']
    try {
      directories = directories.concat(fs.readdirSync(path.join(root, prefix), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', 'build'].includes(entry.name))
        .slice(0, 50).map(entry => `${entry.name}/`))
    } catch { continue }
    const android = directories.some(directory => ['build.gradle', 'build.gradle.kts'].some(name => {
      const relative = `${prefix}${directory}${name}`
      if (!regularFile(root, relative)) return false
      try { return fs.statSync(path.join(root, relative)).size <= 1_048_576 && /com\.android\.application/.test(fs.readFileSync(path.join(root, relative), 'utf8')) }
      catch { return false }
    }))
    if (!android) continue
    for (const variant of ['debug', 'release'] as const) {
      const task = variant === 'debug' ? 'assembleDebug' : 'assembleRelease'
      const command = prefix ? `cd android && ${process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew'} ${task}` : `${process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew'} ${task}`
      result.actions.push({ id: `android:${prefix ? 'nested:' : ''}${variant}`, name: variant === 'debug' ? 'Android debug build' : 'Android release build', kind: 'build', variant, command,
        artifacts: [`${prefix}**/build/outputs/apk/${variant}/*.apk`] })
    }
  }
}

function flutterActions(root: string, result: DiscoveredProjectActions): boolean {
  if (!regularFile(root, 'pubspec.yaml')) return false
  const gradle = ['android/app/build.gradle', 'android/app/build.gradle.kts'].find(file => regularFile(root, file))
  if (!gradle) return false
  try {
    const file = path.join(root, gradle)
    if (fs.statSync(file).size > 1_048_576 || !/com\.android\.application/.test(fs.readFileSync(file, 'utf8'))) return false
  } catch { return false }
  for (const variant of ['debug', 'release'] as const) {
    result.actions.push({ id: `flutter:${variant}`, name: variant === 'debug' ? 'Flutter debug APK' : 'Flutter release APK', kind: 'build', variant,
      command: `flutter build apk --${variant}`, artifacts: [`build/app/outputs/flutter-apk/*${variant}*.apk`] })
  }
  return true
}

/** Read-only inference: scripts and known Android tasks are never executed here. */
export function discoverProjectActions(root: string): DiscoveredProjectActions {
  const result: DiscoveredProjectActions = { actions: [], warnings: [] }
  packageActions(root, result)
  if (!flutterActions(root, result)) androidActions(root, result)
  if (!result.actions.length && !result.warnings.length) result.warnings.push('자동으로 구성할 빌드·배포 설정을 찾지 못했습니다. 에이전트로 구성하거나 직접 추가하세요.')
  return result
}

/** Defaults apply only to recognized package builds whose saved command still matches discovery. */
export function automaticArtifactPatterns(root: string, action: ProjectAction): string[] {
  if (action.kind !== 'build' || action.artifacts?.length) return []
  const discovered = discoverProjectActions(root).actions.find(candidate => candidate.kind === 'build'
    && /^npm:build(?::(?:debug|release))?$/.test(candidate.id) && candidate.command === action.command)
  if (!discovered) return []
  try {
    const file = path.join(root, 'package.json')
    if (!regularFile(root, 'package.json') || fs.statSync(file).size > 1_048_576) return []
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, unknown> }
    const script = manifest.scripts?.[discovered.id.slice(4)]
    if (typeof script !== 'string') return []
    // Custom output flags can relocate a build; never report an unrelated default directory.
    if (/\b(?:vite|react-scripts)\s+build\b/.test(script) && !/--(?:outDir|out-dir|output-path)\b/.test(script)) {
      return [/\breact-scripts\s+build\b/.test(script) ? 'build/**/*' : 'dist/**/*']
    }
  } catch { /* Discovery is optional and never blocks a run. */ }
  return []
}
