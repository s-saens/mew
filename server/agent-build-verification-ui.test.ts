import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { defaultBranchGuidance } from '../shared/branch-guidance.ts'
import { documentationGuidanceKeys } from '../shared/agent-guidance.ts'
import { defaultAgentBuildVerificationSettings, type AgentBuildVerificationSettings } from '../shared/agent-build-verification.ts'

const root = path.resolve(import.meta.dirname, '..')

test('build verification settings autosave guidance only, preserve drafts and custom instructions, and fit desktop and mobile themes', { skip: !domBrowserExecutable(), timeout: 120_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentGuidanceButton} from '${root}/src/components/agent-guidance-settings.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
window.fixtureTheme=dark=>applyThemePalette(THEME_PRESETS.find(theme=>theme.id===(dark?'dark':'light')).palette);
window.fixtureTheme(false);
createRoot(document.getElementById('root')).render(<I18nProvider><AgentGuidanceButton workspacePath="/project" onOpenFile={()=>{}}/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:build-verification.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:build-verification.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:build-verification.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/agent-guidance-settings.tsx', 'src/components/agent-build-verification-fields.tsx', 'src/components/agent-capacity-retry-fields.tsx', 'src/components/agent-branch-guidance.tsx', 'src/components/agent-guidance-row.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/select-field.tsx', 'packages/ui/src/HoverTipLayer.tsx', 'packages/ui/src/ConfirmDialog.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) + await fs.readFile(`${root}/src/components/agent-guidance-settings.css`, 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce', hasTouch: width < 768, isMobile: width < 768 })
      page.setDefaultTimeout(4000)
      let updates = 0, failure: 503 | 409 | undefined
      let state = {
        path: '/data/agent-guidance.md', content: '# Guidance', instructions: '', revision: 'initial',
        settings: { commit: 'inherit', commitLanguage: 'en', language: 'inherit', detail: 'inherit', subagents: 'inherit', debugger: 'enabled', testing: 'required', codeQuality: 'required', ...Object.fromEntries(documentationGuidanceKeys.map(key => [key, 'required'])) },
        capacityRetry: { delaySeconds: 30, maxRetries: 20 },
        branch: { value: { ...defaultBranchGuidance }, custom: false },
        buildVerification: { value: { ...defaultAgentBuildVerificationSettings }, custom: false },
      }
      const errors: string[] = [], unexpectedRequests: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin !== 'http://mew-build-verification.test') {
          unexpectedRequests.push(request.url())
          return route.abort()
        }
        if (url.pathname === '/api/fs/agent-guidance') {
          if (request.method() === 'PUT') {
            const input = request.postDataJSON()
            assert.deepEqual(Object.keys(input).sort(), ['key', 'revision', 'value'])
            assert.equal(input.key, 'buildVerification', 'editing build preferences only updates guidance metadata')
            assert.equal(input.revision, state.revision)
            assert.deepEqual(Object.keys(input.value).sort(), Object.keys(defaultAgentBuildVerificationSettings).sort())
            updates++
            if (failure) {
              const status = failure
              failure = undefined
              return route.fulfill({ status, json: { error: status === 409 ? '지침 파일이 변경되었습니다. 다시 불러오세요.' : '일시적으로 빌드 지침을 저장할 수 없습니다.' } })
            }
            state = { ...state, revision: `saved-${updates}`, buildVerification: { value: input.value as AgentBuildVerificationSettings, custom: false } }
          }
          return route.fulfill({ json: state })
        }
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
        unexpectedRequests.push(`${request.method()} ${url.pathname}`)
        return route.abort()
      })
      await page.goto('http://mew-build-verification.test/')
      const open = page.getByRole('button', { name: '에이전트 기본 지침', exact: true })
      const dialog = page.getByRole('dialog', { name: '에이전트 기본 지침', exact: true })
      const field = (name: string) => dialog.getByRole('combobox', { name, exact: true })
      const command = dialog.getByRole('textbox', { name: '빌드 명령어', exact: true })
      const summary = dialog.locator('summary', { hasText: '빌드 세부 설정' })
      const discard = page.getByRole('dialog', { name: '저장하지 않은 지침을 버릴까요?', exact: true })
      const saved = async () => {
        await page.waitForTimeout(500)
        await dialog.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      }
      const choose = async (name: string, option: string) => {
        const trigger = field(name)
        await trigger.scrollIntoViewIfNeeded()
        if (width < 768) {
          await trigger.tap()
          await page.getByRole('option', { name: option, exact: true }).tap()
        } else {
          await trigger.click()
          await page.getByRole('option', { name: option, exact: true }).click()
        }
      }
      await open.click()
      await field('빌드 검증').waitFor()
      assert.equal(await field('빌드 검증').textContent(), '필수 실행')
      assert.equal(await dialog.getByRole('group', { name: '일반', exact: true }).getByRole('combobox', { name: '빌드 검증', exact: true }).count(), 1)
      assert.equal(await page.locator('select,datalist').count(), 0)
      await summary.click()
      assert.equal(await command.inputValue(), '')
      assert.equal(await command.getAttribute('placeholder'), '프로젝트 빌드 명령 자동 선택')
      assert.equal(await field('실행 대상').textContent(), '구현 변경 후')
      assert.equal(await field('빌드 실패 시').textContent(), '수정 후 다시 빌드')
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        await command.scrollIntoViewIfNeeded()
        for (const control of [command, field('실행 대상'), field('빌드 실패 시')]) {
          const bounds = (await control.boundingBox())!
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `build controls fit ${width}px in ${dark ? 'dark' : 'light'} theme`)
          assert.ok(bounds.height >= (width < 768 ? 36 : 32))
        }
        await field('빌드 실패 시').click()
        const bounds = (await page.getByRole('listbox', { name: '빌드 실패 시', exact: true }).boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        await page.screenshot({ path: `/tmp/mew-build-verification-${width}-${dark ? 'dark' : 'light'}.png` })
        await page.keyboard.press('Escape')
        assert.ok(await dialog.evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.defaultView!.innerWidth))
      }
      await choose('실행 대상', '모든 변경 후'); await saved()
      assert.equal(state.buildVerification.value.scope, 'all')
      await choose('빌드 실패 시', '실패 보고'); await saved()
      assert.equal(state.buildVerification.value.fixFailures, false)
      const beforeCommand = updates
      await command.fill('pnpm run build --filter app')
      await page.waitForTimeout(150)
      assert.equal(updates, beforeCommand, 'build command changes wait for the autosave debounce')
      await saved()
      assert.equal(state.buildVerification.value.command, 'pnpm run build --filter app')
      assert.deepEqual(unexpectedRequests, [], 'saving a command never requests command execution or a terminal session')
      await dialog.getByRole('button', { name: '닫기', exact: true }).click()
      await open.click()
      await field('빌드 검증').waitFor()
      await summary.click()
      assert.equal(await command.inputValue(), 'pnpm run build --filter app')
      assert.equal(await field('실행 대상').textContent(), '모든 변경 후')
      assert.equal(await field('빌드 실패 시').textContent(), '실패 보고')
      await choose('빌드 검증', '프로젝트 지침에 따름'); await saved()
      assert.deepEqual(state.buildVerification.value, { mode: 'project', command: 'pnpm run build --filter app', scope: 'all', fixFailures: false })
      for (const control of [command, field('실행 대상'), field('빌드 실패 시')]) assert.equal(await control.isDisabled(), true)
      await choose('빌드 검증', '필수 실행'); await saved()
      assert.equal(await command.isDisabled(), false)
      assert.equal(await command.inputValue(), 'pnpm run build --filter app')
      const beforeInvalid = updates
      await command.fill('npm run build <!-- mew:agent-setting:commit -->')
      await dialog.getByRole('alert').filter({ hasText: '빌드 명령' }).waitFor()
      await page.waitForTimeout(500)
      assert.equal(updates, beforeInvalid, 'invalid metadata text never reaches the API')
      await dialog.getByRole('button', { name: '닫기', exact: true }).click()
      await discard.getByRole('button', { name: '취소', exact: true }).click()
      assert.equal(await command.inputValue(), 'npm run build <!-- mew:agent-setting:commit -->')
      await dialog.getByRole('button', { name: '다시 불러오기', exact: true }).click()
      await discard.getByRole('button', { name: '취소', exact: true }).click()
      assert.equal(await command.inputValue(), 'npm run build <!-- mew:agent-setting:commit -->')
      await choose('빌드 검증', '프로젝트 지침에 따름'); await saved()
      assert.equal(state.buildVerification.value.command, 'pnpm run build --filter app', 'switching away from an invalid command restores the last saved command')
      assert.equal(await command.isDisabled(), true)
      await choose('빌드 검증', '필수 실행'); await saved()
      await command.fill('npm run build:check'); await saved()
      failure = 503
      await command.fill('npm run build:retained')
      await dialog.getByRole('alert').filter({ hasText: '일시적으로 빌드' }).waitFor()
      assert.equal(await command.inputValue(), 'npm run build:retained')
      assert.equal(state.buildVerification.value.command, 'npm run build:check')
      await command.fill('npm run build:retry'); await saved()
      assert.equal(state.buildVerification.value.command, 'npm run build:retry')
      failure = 409
      await command.fill('npm run build:conflict')
      await dialog.getByRole('alert').filter({ hasText: '파일이 변경' }).waitFor()
      assert.equal(await command.inputValue(), 'npm run build:conflict')
      assert.equal(state.buildVerification.value.command, 'npm run build:retry')
      await dialog.getByRole('button', { name: '다시 불러오기', exact: true }).click()
      await discard.getByRole('button', { name: '변경 버리기', exact: true }).click()
      assert.equal(state.buildVerification.value.command, 'npm run build:retry', 'discarding a conflict never saves the rejected draft')
      await page.waitForFunction("document.querySelector('input[placeholder=\"프로젝트 빌드 명령 자동 선택\"]')?.value === 'npm run build:retry'")
      await field('빌드 검증').and(page.locator(':enabled')).waitFor()
      if (!(await command.isVisible())) await summary.click()
      assert.equal(await command.inputValue(), 'npm run build:retry')
      state = { ...state, revision: 'custom-build', buildVerification: { ...state.buildVerification, custom: true } }
      await dialog.getByRole('button', { name: '다시 불러오기', exact: true }).click()
      await field('빌드 검증').filter({ hasText: '직접 편집한 지침' }).waitFor()
      await field('빌드 검증').click()
      assert.equal(await page.getByRole('option', { name: '직접 편집한 지침', exact: true }).getAttribute('aria-disabled'), 'true')
      await page.keyboard.press('Escape')
      assert.equal(state.buildVerification.custom, true)
      if (!(await command.isVisible())) await summary.click()
      for (const control of [command, field('실행 대상'), field('빌드 실패 시')]) assert.equal(await control.isDisabled(), true, 'custom build instructions stay intact until a mode is chosen')
      await choose('빌드 검증', '필수 실행'); await saved()
      assert.deepEqual(state.buildVerification, { value: { ...defaultAgentBuildVerificationSettings }, custom: false })
      await command.fill('npm run build:replace-custom'); await saved()
      assert.equal(state.buildVerification.value.command, 'npm run build:replace-custom')
      assert.deepEqual(unexpectedRequests, [])
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
