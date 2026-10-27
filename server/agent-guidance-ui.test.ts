import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { defaultBranchGuidance } from '../shared/branch-guidance.ts'
import { documentationGuidanceKeys, type DocumentationGuidanceKey } from '../shared/agent-guidance.ts'

const root = path.resolve(import.meta.dirname, '..')

test('compact guidance settings match the shared settings dialog, autosave all fields, preserve invalid drafts and trap focus on desktop and mobile', { skip: !domBrowserExecutable(), timeout: 120_000 }, async () => {
  const source = `import React, {useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentGuidanceButton} from '${root}/src/components/agent-guidance-settings.tsx';
import {DialogFrame} from '${root}/packages/ui/src/dialog-frame.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
window.fixtureTheme=dark=>applyThemePalette(THEME_PRESETS.find(theme=>theme.id===(dark?'dark':'light')).palette);
window.fixtureTheme(false);
function Fixture(){const [reference,setReference]=useState(false);return <I18nProvider><button onClick={()=>setReference(true)}>전체 설정 크기 기준</button>{reference&&<DialogFrame size="settings" labelledBy="reference-title" onClose={()=>setReference(false)} className="flex flex-col"><h2 id="reference-title">전체 설정 크기 기준</h2><button onClick={()=>setReference(false)}>기준 닫기</button></DialogFrame>}<AgentGuidanceButton workspacePath="/project" onOpenFile={p=>{window.opened=p}}/></I18nProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:guidance.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'fixture', resolveId(id) { if (id === 'virtual:guidance.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:guidance.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/agent-guidance-settings.tsx', 'src/components/agent-capacity-retry-fields.tsx', 'src/components/agent-branch-guidance.tsx', 'src/components/agent-guidance-row.tsx', 'packages/ui/src/dialog-frame.tsx', 'packages/ui/src/select-field.tsx', 'packages/ui/src/HoverTipLayer.tsx', 'packages/ui/src/ConfirmDialog.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) + await fs.readFile(`${root}/src/components/agent-guidance-settings.css`, 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce', hasTouch: width < 768, isMobile: width < 768 })
      page.setDefaultTimeout(4000)
      let fail = true, conflict = false, updates = 0, heldPreset = false, globalTransient = false
      let projectDenied = true, projectConflict = false, projectWrongRoot = false, projectUpdates = 0, projectTransient = false
      let releaseSave: (() => void) | undefined, releaseLoad: (() => void) | undefined
      let heldLoad = false
      const documentationSettings = Object.fromEntries(documentationGuidanceKeys.map(key => [key, 'required'])) as Record<DocumentationGuidanceKey, string>
      let state = { path: '/data/agent-guidance.md', content: '# Guidance', instructions: '', revision: 'first', capacityRetry: { delaySeconds: 30, maxRetries: 20 }, settings: { commit: 'inherit', commitLanguage: 'en', language: 'inherit', detail: 'custom', subagents: 'inherit', debugger: 'enabled', testing: 'required', ...documentationSettings }, branch: { value: { ...defaultBranchGuidance }, custom: false } }
      let projectState = { projectRoot: '/project', revision: 'project1', settings: { version: 1, enabled: true, docsDir: 'notes', entrypoints: ['AGENTS.md'], instructions: 'Existing project rule' } }
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-guidance.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/fs/agent-guidance') {
          if (fail) return route.fulfill({ status: 403, json: { error: '다시 시도하세요.' } })
          if (route.request().method() === 'GET' && !heldLoad) {
            heldLoad = true
            await new Promise<void>(resolve => { releaseLoad = resolve })
          }
          if (route.request().method() === 'PUT') {
            const input = route.request().postDataJSON()
            if (!heldPreset && input.key === 'language') {
              heldPreset = true
              await new Promise<void>(resolve => { releaseSave = resolve })
            }
            if (conflict) return route.fulfill({ status: 409, json: { error: '지침 파일이 변경되었습니다. 다시 불러오세요.' } })
            if (globalTransient && input.key === 'instructions') {
              globalTransient = false
              return route.fulfill({ status: 503, json: { error: '일시적으로 전역 지침을 저장할 수 없습니다.' } })
            }
            assert.equal(input.revision, state.revision)
            updates++
            if (input.key === 'branch') {
              assert.deepEqual(Object.keys(input.value).sort(), Object.keys(defaultBranchGuidance).sort(), 'branch writes include the entire preference object')
              state = { ...state, revision: `updated-${updates}`, branch: { value: input.value, custom: false } }
            } else if (input.key === 'capacityRetry') {
              assert.deepEqual(Object.keys(input.value).sort(), ['delaySeconds', 'maxRetries'])
              state = { ...state, revision: `updated-${updates}`, capacityRetry: input.value }
            } else if (input.key === 'instructions') state = { ...state, revision: `updated-${updates}`, instructions: input.value.trim() }
            else state = { ...state, revision: `updated-${updates}`, settings: { ...state.settings, [input.key]: input.value } }
          }
          await route.fulfill({ json: state })
          return
        }
        if (url.pathname === '/api/docs/agent-context') {
          if (projectDenied) return route.fulfill({ status: 403, json: { error: '프로젝트 지침은 소유자만 변경할 수 있습니다.' } })
          if (projectWrongRoot) return route.fulfill({ json: { ...projectState, projectRoot: '/different-project' } })
          if (route.request().method() === 'PATCH') {
            if (projectConflict) return route.fulfill({ status: 409, json: { error: '프로젝트가 변경되었습니다. 설정 창을 다시 여세요.' } })
            if (projectTransient) {
              projectTransient = false
              return route.fulfill({ status: 503, json: { error: '일시적으로 프로젝트 지침을 저장할 수 없습니다.' } })
            }
            const input = route.request().postDataJSON()
            assert.equal(input.projectRoot, '/project')
            assert.equal(input.revision, projectState.revision)
            assert.deepEqual(Object.keys(input).sort(), ['enabled', 'instructions', 'projectRoot', 'revision'])
            projectUpdates++
            projectState = { ...projectState, revision: `project-${projectUpdates}`, settings: { ...projectState.settings, instructions: input.instructions.trim(), enabled: input.enabled } }
          }
          return route.fulfill({ json: projectState })
        }
        await route.fulfill(url.pathname === '/app.js' ? { contentType: 'text/javascript', body: chunk.code } : { contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-guidance.test/')
      await page.getByRole('button', { name: '전체 설정 크기 기준', exact: true }).click()
      const referenceBounds = (await page.getByRole('dialog', { name: '전체 설정 크기 기준', exact: true }).boundingBox())!
      assert.equal(referenceBounds.width, width >= 768 ? 740 : width)
      assert.ok(Math.abs(referenceBounds.height - (width >= 768 ? 844 * 0.7 : 844)) < 1)
      await page.getByRole('button', { name: '기준 닫기', exact: true }).click()
      const button = page.getByRole('button', { name: '에이전트 기본 지침', exact: true })
      await button.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: '에이전트 기본 지침' })
      await page.getByRole('alert').filter({ hasText: '다시 시도' }).waitFor()
      fail = false
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await page.getByRole('status').filter({ hasText: '불러오는 중' }).waitFor()
      await page.keyboard.press('Tab')
      assert.equal(await page.getByRole('button', { name: '닫기', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
      releaseLoad!()
      assert.equal(await page.locator('select').count(), 0, 'settings never open an OS select menu')
      const field = (name: string) => page.getByRole('combobox', { name, exact: true })
      await field('응답 언어').waitFor()
      const guidanceBounds = (await dialog.boundingBox())!
      for (const dimension of ['x', 'y', 'width', 'height'] as const) assert.ok(Math.abs(guidanceBounds[dimension] - referenceBounds[dimension]) < 1, `guidance ${dimension} matches the shared full-settings frame at ${width}px`)
      assert.equal((await dialog.locator('header').boundingBox())!.height, 36)
      const closeBounds = (await dialog.getByRole('button', { name: '닫기', exact: true }).boundingBox())!
      assert.equal(closeBounds.width, width >= 768 ? 24 : 32)
      assert.equal(closeBounds.height, width >= 768 ? 24 : 32)
      assert.equal(await dialog.getByRole('button', { name: '닫기', exact: true }).locator('svg').getAttribute('width'), '14')
      const assertInlineFields = async (names: string[], role: 'combobox' | 'textbox' | 'spinbutton' = 'combobox') => {
        for (const name of names) {
          const label = (await dialog.locator('[data-guidance-label]').filter({ hasText: name }).boundingBox())!
          const control = (await page.getByRole(role, { name, exact: true }).boundingBox())!
          assert.ok(label.x + label.width <= control.x + 1, `${name} keeps its label beside the control at ${width}px`)
          assert.ok(Math.abs(label.y + label.height / 2 - control.y - control.height / 2) < 2, `${name} vertically aligns its label and control at ${width}px`)
          assert.ok(Math.abs(control.height - (width >= 768 ? 32 : 36)) < 1, `${name} uses a compact desktop or usable touch target`)
          assert.ok(control.x >= 0 && control.x + control.width <= width, `${name} stays inside a ${width}px viewport`)
        }
      }
      await assertInlineFields(['응답 언어', '답변 길이', '서브에이전트 위임', '디버거 활용', '테스트 작성', '브랜치 전략', 'Git 자동 처리', '커밋 방식', '커밋 언어'])
      await assertInlineFields(['재시도 간격 (초)', '최대 재시도 횟수'], 'spinbutton')
      const languageBounds = (await field('응답 언어').boundingBox())!, debuggerBounds = (await field('디버거 활용').boundingBox())!
      assert.ok(debuggerBounds.y - languageBounds.y <= (width >= 768 ? 120 : 168), 'ordinary settings use a compact, consistently spaced list')
      assert.equal(await dialog.getByRole('button', { name: /설정 저장|지침 저장/ }).count(), 0)
      await field('응답 언어').scrollIntoViewIfNeeded()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        await page.screenshot({ path: `/tmp/mew-guidance-polish-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await page.evaluate('window.fixtureTheme(false)')
      const choose = async (name: string, option: string) => {
        if (width < 768) {
          await field(name).tap()
          await page.getByRole('option', { name: option, exact: true }).tap()
        } else {
          await field(name).click()
          await page.getByRole('option', { name: option, exact: true }).click()
        }
      }
      const saved = async () => {
        await page.waitForTimeout(500)
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      }
      const globalScope = page.getByRole('button', { name: '뮤 전역 지침', exact: true })
      const projectScope = page.getByRole('button', { name: '현재 프로젝트', exact: true })
      const globalInstructions = page.getByRole('textbox', { name: '뮤 전역 지침 추가 지침', exact: true })
      const projectInstructions = page.getByRole('textbox', { name: '현재 프로젝트 추가 지침', exact: true })
      const discard = page.getByRole('dialog', { name: '저장하지 않은 지침을 버릴까요?', exact: true })
      const delay = page.getByRole('spinbutton', { name: '재시도 간격 (초)', exact: true })
      const attempts = page.getByRole('spinbutton', { name: '최대 재시도 횟수', exact: true })
      await delay.fill('45'); await attempts.fill('0'); await saved()
      assert.deepEqual(state.capacityRetry, { delaySeconds: 45, maxRetries: 0 })
      for (const [input, value] of [[delay, '0'], [delay, '3601'], [delay, '1.5'], [attempts, '-1'], [attempts, '101'], [attempts, '1.5']] as const) {
        const before = updates
        await delay.fill('45'); await attempts.fill('0'); await input.fill(value)
        await page.getByRole('alert').filter({ hasText: '간격은' }).waitFor()
        assert.equal(updates, before, 'invalid numbers never reach the API')
      }
      await delay.fill('60'); await attempts.fill('10'); await saved()
      assert.deepEqual(state.capacityRetry, { delaySeconds: 60, maxRetries: 10 })
      await page.locator('summary', { hasText: '추가 지침' }).click()
      await globalInstructions.fill('Global guidance autosaved'); await saved()
      assert.equal(state.instructions, 'Global guidance autosaved')
      globalTransient = true
      await globalInstructions.fill('Retain failed global guidance')
      await page.getByRole('alert').filter({ hasText: '일시적으로 전역' }).waitFor()
      assert.equal(await globalInstructions.inputValue(), 'Retain failed global guidance')
      await globalInstructions.fill('Retry global guidance'); await saved()
      assert.equal(state.instructions, 'Retry global guidance')
      await projectScope.click()
      await page.getByRole('alert').filter({ hasText: '소유자만 변경' }).waitFor()
      assert.equal(projectUpdates, 0)
      projectDenied = false
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await projectInstructions.waitFor()
      await projectInstructions.fill('Project guidance autosaved')
      await page.getByRole('checkbox', { name: '프로젝트 자동 안내', exact: true }).uncheck()
      await saved()
      assert.equal(projectState.settings.instructions, 'Project guidance autosaved')
      assert.equal(projectState.settings.enabled, false)
      assert.equal(projectState.settings.docsDir, 'notes')
      assert.deepEqual(projectState.settings.entrypoints, ['AGENTS.md'])
      projectTransient = true
      await projectInstructions.fill('Retain failed project guidance')
      await page.getByRole('alert').filter({ hasText: '일시적으로 프로젝트' }).waitFor()
      assert.equal(await projectInstructions.inputValue(), 'Retain failed project guidance')
      await projectInstructions.fill('Retry project guidance'); await saved()
      projectConflict = true
      await projectInstructions.fill('Conflicting project draft')
      await page.getByRole('alert').filter({ hasText: '프로젝트가 변경' }).waitFor()
      assert.equal(await projectInstructions.inputValue(), 'Conflicting project draft')
      projectConflict = false
      projectWrongRoot = true
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await discard.getByRole('button', { name: '변경 버리기', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '프로젝트가 변경' }).waitFor()
      assert.equal(await projectInstructions.inputValue(), 'Conflicting project draft')
      projectWrongRoot = false
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await discard.getByRole('button', { name: '변경 버리기', exact: true }).click()
      await page.waitForFunction("!document.querySelector('textarea[aria-label=\"현재 프로젝트 추가 지침\"]')?.disabled")
      await globalScope.click()
      const documentation = dialog.locator('details').filter({ has: page.locator('summary', { hasText: /^문서$/ }) })
      await documentation.locator('summary').click()
      const documentationFields = ['기준 문서 갱신', '결정 기록 (ADR)', '작업·검증 기록', '문서 작성 방식', '문서 description', '문서 링크 관리', '문서 검사']
      await assertInlineFields(documentationFields)
      for (const [index, key] of documentationGuidanceKeys.entries()) {
        assert.equal(await field(documentationFields[index]).textContent(), '기본 지침 적용')
        await choose(documentationFields[index], '프로젝트 지침에 따름')
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings[key], 'project')
        assert.equal(state.settings.testing, 'required')
      }
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await field('문서 검사').filter({ hasText: '프로젝트 지침에 따름' }).waitFor()
      for (const [index, key] of documentationGuidanceKeys.entries()) {
        assert.equal(await field(documentationFields[index]).textContent(), '프로젝트 지침에 따름')
        await choose(documentationFields[index], '기본 지침 적용')
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings[key], 'required')
      }
      state = { ...state, revision: 'custom-docs', settings: { ...state.settings, decisionRecords: 'custom' } }
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await field('결정 기록 (ADR)').filter({ hasText: '직접 편집한 지침' }).waitFor()
      await field('결정 기록 (ADR)').click()
      assert.equal(await page.getByRole('option', { name: '직접 편집한 지침', exact: true }).getAttribute('aria-disabled'), 'true')
      await page.getByRole('option', { name: '기본 지침 적용', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      await field('문서 검사').click()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        await page.screenshot({ path: `/tmp/mew-documentation-guidance-${width}-${dark ? 'dark' : 'light'}.png` })
        const bounds = (await page.getByRole('listbox', { name: '문서 검사' }).boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844, JSON.stringify({ width, bounds }))
      }
      await page.keyboard.press('Escape')
      await page.evaluate('window.fixtureTheme(false)')
      await documentation.locator('summary').click()
      if (width === 320) {
        await field('커밋 언어').tap()
        const commitMenu = page.getByRole('listbox', { name: '커밋 언어' })
        const commitBounds = (await commitMenu.boundingBox())!
        assert.ok(commitBounds.x >= 0 && commitBounds.x + commitBounds.width <= width)
        assert.equal(await commitMenu.getByRole('option').count(), 6)
        for (const dark of [false, true]) {
          await page.evaluate(`window.fixtureTheme(${dark})`)
          await page.screenshot({ path: `/tmp/mew-commit-language-${width}-${dark ? 'dark' : 'light'}.png` })
        }
        await page.keyboard.press('Escape')
        await field('서브에이전트 위임').tap()
        const bounds = (await page.getByRole('listbox', { name: '서브에이전트 위임' }).boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        await page.keyboard.press('Escape')
        assert.equal(await dialog.count(), 1, 'a narrow-screen dropdown closes before the settings dialog')
        await page.locator('summary', { hasText: '브랜치 세부 설정' }).click()
        await assertInlineFields(['작업 폴더', '병합 방식'])
        await assertInlineFields(['기본 브랜치', '작업 브랜치 접두사'], 'textbox')
        await page.getByRole('checkbox', { name: '통합 후 로컬 브랜치 정리', exact: true }).scrollIntoViewIfNeeded()
        for (const dark of [false, true]) {
          await page.evaluate(`window.fixtureTheme(${dark})`)
          await page.screenshot({ path: `/tmp/mew-guidance-polish-${width}-details-${dark ? 'dark' : 'light'}.png` })
        }
        assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
        await page.keyboard.press('Escape')
        assert.equal(await dialog.count(), 0)
        assert.equal(await button.evaluate(el => el === el.ownerDocument.activeElement), true)
        assert.deepEqual(errors, [])
        await page.close()
        continue
      }
      await field('응답 언어').focus()
      await page.keyboard.press('Enter')
      await page.getByRole('listbox', { name: '응답 언어' }).waitFor()
      assert.equal(await page.getByRole('listbox', { name: '응답 언어' }).evaluate(el => !!el.closest('[role="dialog"]')), true, 'selection menus stay within the shared dialog focus boundary')
      assert.equal(await page.getByRole('option').first().textContent(), 'mew 언어 설정에 따름')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await page.getByRole('status').filter({ hasText: '저장 중' }).waitFor()
      await page.keyboard.press('Tab')
      assert.equal(await page.getByRole('button', { name: '닫기', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
      releaseSave!()
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      assert.equal(state.settings.language, 'ko')
      assert.equal(await page.getByLabel('응답 언어', { exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.equal(await field('답변 길이').textContent(), '직접 편집한 지침')
      await choose('응답 언어', 'mew 언어 설정에 따름')
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      assert.equal(state.settings.language, 'mew')
      await field('응답 언어').click()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        const triggerBounds = (await field('응답 언어').boundingBox())!
        const bounds = (await page.getByRole('listbox', { name: '응답 언어' }).boundingBox())!
        assert.ok(Math.abs(bounds.x - triggerBounds.x) <= 1, `language listbox aligns horizontally with its trigger at ${width}px (${dark ? 'dark' : 'light'})`)
        assert.ok(Math.abs(bounds.y - (triggerBounds.y + triggerBounds.height + 4)) <= 1, `language listbox opens directly below its trigger at ${width}px (${dark ? 'dark' : 'light'})`)
        await page.screenshot({ path: `/tmp/mew-language-guidance-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await page.keyboard.press('Escape')
      await choose('응답 언어', '한국어')
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      const gitGroup = page.getByRole('group', { name: 'Git', exact: true })
      for (const name of ['브랜치 전략', 'Git 자동 처리', '커밋 방식', '커밋 언어']) assert.equal(await gitGroup.getByRole('combobox', { name, exact: true }).count(), 1)
      assert.equal(await gitGroup.getByRole('combobox', { name: '응답 언어', exact: true }).count(), 0)
      assert.equal(await field('Git 자동 처리').textContent(), '로컬 병합까지 자동 (권장)')
      assert.equal(await field('커밋 방식').isDisabled(), true)
      assert.equal(await field('커밋 언어').textContent(), 'English')
      assert.equal(await field('커밋 언어').isDisabled(), false, 'automation keeps commit language configurable')
      await field('커밋 언어').click()
      assert.deepEqual(await page.getByRole('listbox', { name: '커밋 언어' }).getByRole('option').allTextContents(), ['English', '한국어', '日本語', '简体中文', 'mew 언어 설정에 따름', '에이전트 응답 설정 따르기'])
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        await page.screenshot({ path: `/tmp/mew-commit-language-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await page.keyboard.press('Escape')
      for (const [option, value] of [['한국어', 'ko'], ['日本語', 'ja'], ['简体中文', 'zh'], ['mew 언어 설정에 따름', 'mew'], ['에이전트 응답 설정 따르기', 'agent'], ['English', 'en']]) {
        await choose('커밋 언어', option)
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings.commitLanguage, value)
        assert.equal(state.settings.language, 'ko', 'commit language changes preserve the response language')
      }
      await gitGroup.scrollIntoViewIfNeeded()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        await page.screenshot({ path: `/tmp/mew-git-group-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await choose('Git 자동 처리', '기존 커밋 설정 사용')
      await saved()
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      await choose('커밋 방식', '매 변경 완료 후 커밋')
      await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
      assert.equal(await field('서브에이전트 위임').textContent(), '별도 지정 안 함')
      for (const [option, value] of [['필요할 때 자동 위임', 'automatic'], ['요청할 때만 위임', 'explicit'], ['사용 안 함', 'never'], ['별도 지정 안 함', 'inherit'], ['필요할 때 자동 위임', 'automatic']]) {
        await choose('서브에이전트 위임', option)
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings.subagents, value)
        assert.equal(await field('서브에이전트 위임').textContent(), option)
        assert.equal(state.settings.language, 'ko')
        assert.equal(state.settings.detail, 'custom')
      }
      assert.equal(await field('테스트 작성').textContent(), '필수 작성')
      for (const [option, value] of [['프로젝트 지침에 따름', 'project'], ['필수 작성', 'required']]) {
        await choose('테스트 작성', option)
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings.testing, value)
      }
      assert.equal(await field('디버거 활용').textContent(), '활성화')
      for (const [option, value] of [['비활성화', 'disabled'], ['활성화', 'enabled']]) {
        await choose('디버거 활용', option)
        await page.getByRole('status').filter({ hasText: '저장했습니다.' }).waitFor()
        assert.equal(state.settings.debugger, value)
        assert.equal(state.settings.language, 'ko')
        assert.equal(state.settings.detail, 'custom')
      }
      await field('디버거 활용').click()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        const triggerBounds = (await field('디버거 활용').boundingBox())!
        const bounds = (await page.getByRole('listbox', { name: '디버거 활용' }).boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        assert.ok(Math.abs(bounds.x - triggerBounds.x) <= 1 && Math.abs(bounds.width - triggerBounds.width) <= 1)
        assert.ok(Math.abs(bounds.y - (triggerBounds.y + triggerBounds.height + 4)) <= 1 || Math.abs(bounds.y + bounds.height - (triggerBounds.y - 4)) <= 1)
        await page.screenshot({ path: `/tmp/mew-debugger-guidance-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await page.keyboard.press('Escape')
      await field('서브에이전트 위임').click()
      for (const dark of [false, true]) {
        await page.evaluate(`window.fixtureTheme(${dark})`)
        const triggerBounds = (await field('서브에이전트 위임').boundingBox())!
        const bounds = (await page.getByRole('listbox', { name: '서브에이전트 위임' }).boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        assert.ok(Math.abs(bounds.x - triggerBounds.x) <= 1 && Math.abs(bounds.width - triggerBounds.width) <= 1)
        assert.ok(Math.abs(bounds.y - (triggerBounds.y + triggerBounds.height + 4)) <= 1 || Math.abs(bounds.y + bounds.height - (triggerBounds.y - 4)) <= 1)
        await page.screenshot({ path: `/tmp/mew-subagent-guidance-${width}-${dark ? 'dark' : 'light'}.png` })
      }
      await page.keyboard.press('Escape')
      await page.evaluate('window.fixtureTheme(false)')
      const details = page.locator('details').filter({ has: page.locator('summary', { hasText: '브랜치 세부 설정' }) })
      const base = page.getByRole('textbox', { name: '기본 브랜치', exact: true })
      const development = page.getByRole('textbox', { name: '개발 브랜치', exact: true })
      const prefix = page.getByRole('textbox', { name: '작업 브랜치 접두사', exact: true })
      const cleanup = page.getByRole('checkbox', { name: '통합 후 로컬 브랜치 정리', exact: true })
      await choose('브랜치 전략', 'Git Flow'); await saved()
      await details.locator('summary').click()
      await base.fill('release/2026.10'); await development.fill('integration/next'); await prefix.fill('task/'); await saved()
      await choose('작업 폴더', '항상 worktree'); await saved()
      await choose('병합 방식', 'Merge commit'); await saved()
      await cleanup.check(); await saved()
      assert.deepEqual(state.branch.value, { strategy: 'git-flow', baseBranch: 'release/2026.10', developmentBranch: 'integration/next', branchPrefix: 'task/', worktree: 'always', mergeMethod: 'merge', cleanup: true, workflow: 'manual' })
      const beforeInvalid = updates
      await base.fill('bad..branch')
      await page.getByRole('alert').filter({ hasText: '브랜치 이름이나 접두사' }).waitFor()
      assert.equal(updates, beforeInvalid)
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await discard.getByRole('button', { name: '취소', exact: true }).click()
      assert.equal(await base.inputValue(), 'bad..branch', 'closing preserves unsaved invalid branch input')
      const lastValid = { ...state.branch.value }
      await choose('브랜치 전략', '프로젝트 지침에 따름'); await saved()
      assert.deepEqual(state.branch.value, { ...lastValid, strategy: 'inherit' })
      state = { ...state, revision: 'custom-branch', branch: { ...state.branch, custom: true } }
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await field('브랜치 전략').filter({ hasText: '직접 편집한 지침' }).waitFor()
      await choose('브랜치 전략', 'Git Flow'); await saved()
      assert.deepEqual(state.branch, { value: { ...defaultBranchGuidance, strategy: 'git-flow' }, custom: false })
      for (const [option, value] of [['기존 커밋 설정 사용', 'manual'], ['로컬 병합까지 자동 (권장)', 'local'], ['원격 반영까지 자동', 'remote'], ['기존 커밋 설정 사용', 'manual']]) {
        await choose('Git 자동 처리', option); await saved()
        assert.equal(state.branch.value.workflow, value)
      }
      await details.locator('summary').click()
      conflict = true
      await base.fill('release/conflict')
      await page.getByRole('alert').filter({ hasText: '파일이 변경' }).waitFor()
      assert.equal(await base.inputValue(), 'release/conflict')
      conflict = false
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await discard.getByRole('button', { name: '변경 버리기', exact: true }).click()
      await field('브랜치 전략').and(page.locator(':enabled')).waitFor()
      conflict = true
      await choose('응답 언어', 'English')
      await page.getByRole('alert').filter({ hasText: '파일이 변경' }).waitFor()
      assert.equal(await field('응답 언어').textContent(), '한국어')
      assert.equal(await page.getByLabel('응답 언어', { exact: true }).isDisabled(), true)
      conflict = false
      await page.getByRole('button', { name: '다시 불러오기' }).click()
      await page.waitForFunction("!document.querySelector('[role=combobox]')?.disabled")
      const close = page.getByRole('button', { name: '닫기', exact: true })
      await close.focus()
      await page.keyboard.press('Shift+Tab')
      assert.equal(await page.getByRole('button', { name: '다시 불러오기' }).evaluate(el => el === el.ownerDocument.activeElement), true)
      await page.keyboard.press('Tab')
      assert.equal(await close.evaluate(el => el === el.ownerDocument.activeElement), true)
      await field('답변 길이').click()
      assert.equal(await page.getByRole('option', { name: '직접 편집한 지침' }).getAttribute('aria-disabled'), 'true')
      const menu = page.getByRole('listbox')
      const box = (await menu.boundingBox())!
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844)
      await page.screenshot({ path: `/tmp/mew-agent-guidance-${width}.png` })
      await page.keyboard.press('Escape')
      assert.equal(await menu.count(), 0)
      assert.equal(await dialog.count(), 1, 'Esc closes the list before its settings dialog')
      assert.equal(await field('답변 길이').evaluate(el => el === el.ownerDocument.activeElement), true)
      await field('응답 언어').click()
      await page.getByText('모든 프로젝트에 공통으로 적용됩니다.', { exact: false }).click()
      assert.equal(await menu.count(), 0, 'outside click dismisses the list')
      await page.getByRole('button', { name: '파일 보기' }).click()
      await page.waitForFunction('window.opened === "/data/agent-guidance.md"')
      assert.equal(await dialog.count(), 0)
      await button.click()
      await page.getByLabel('응답 언어', { exact: true }).waitFor()
      assert.equal(await field('응답 언어').textContent(), '한국어')
      assert.equal(await field('서브에이전트 위임').textContent(), '필요할 때 자동 위임')
      assert.equal(await field('테스트 작성').textContent(), '필수 작성')
      assert.equal(await field('디버거 활용').textContent(), '활성화')
      await page.keyboard.press('Escape')
      assert.equal(await dialog.count(), 0)
      assert.equal(await button.evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
