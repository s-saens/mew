import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import type { SkillLibraryInventory, SkillLibraryItem, SkillLibraryMutation } from '../shared/skill-library.ts'

const root = path.resolve(import.meta.dirname, '..')
test('skill library keeps one effective row, protects drafts, imports external copies and restores defaults on desktop/mobile', { timeout: 60000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentHarnessButtons} from '${root}/src/components/agent-harness-modal.tsx';
createRoot(document.getElementById('root')).render(<AgentHarnessButtons cwd="/project"/>);`
  const bundle = await build({ input: 'virtual:skill-library.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'skill-library-fixture', resolveId(id) { if (id === 'virtual:skill-library.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:skill-library.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/skill-library-manager.tsx', 'src/components/agent-harness-modal.tsx', 'packages/ui/src/select-field.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  try {
    await fs.mkdir('/tmp/mew-skill-library-review', { recursive: true })
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', hasTouch: width < 768, isMobile: width < 768, reducedMotion: 'reduce' })
      page.setDefaultTimeout(5000)
      const errors: string[] = [], mutations: SkillLibraryMutation[] = []
      page.on('pageerror', error => errors.push(error.message))
      const makeItem = (name: string, overrides: Partial<SkillLibraryItem> = {}): SkillLibraryItem => ({ id: name, name, description: `${name} 지침`, path: `/library/skills/${name}/SKILL.md`, scope: 'common', enabled: true, enabledScope: 'common', commonEnabled: true, source: 'managed', editable: true, revision: 'revision', origins: [], ...overrides })
      const inventory: SkillLibraryInventory = {
        items: [makeItem('writing', { origins: [{ id: 'managed-writing', label: 'Mew', path: '/library/skills/writing/SKILL.md', agent: 'mew' }, { id: 'native-writing', label: 'Codex', path: '/home/test/.codex/skills/writing/SKILL.md', agent: 'codex' }, { id: 'shared-writing', label: '공통', path: '/home/test/.agents/skills/writing/SKILL.md', agent: 'shared' }] }), makeItem('deploy', { scope: 'project', enabledScope: 'project', path: '/project/.mew/skills/deploy/SKILL.md' }), makeItem('commit', { source: 'builtin', editable: false })],
        candidates: [{ id: 'external-frontend', name: 'frontend', description: '외부 UI 지침', path: '/home/test/.claude/skills/frontend/SKILL.md', agent: 'claude', scope: 'common', label: 'Claude', revision: 'external-revision', importable: true }],
        defaults: [{ name: 'commit', description: '커밋 지침', installed: true }], warnings: [],
      }
      const contents = new Map(inventory.items.map(item => [item.id, `---\nname: ${item.name}\ndescription: ${item.description}\n---\n\n# Instructions\n`]))
      let failSave = false
      await page.route('http://mew-skills.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (url.pathname === '/api/agent/skill-library/detail') {
          const id = url.searchParams.get('id')!, item = inventory.items.find(item => item.id === id), candidate = inventory.candidates.find(item => item.id === id)
          return route.fulfill({ json: { item, candidate, revision: item?.revision ?? candidate?.revision, content: contents.get(id) ?? '# External instructions\n', files: ['SKILL.md', 'scripts/check.sh'] } })
        }
        if (url.pathname === '/api/agent/skill-library') {
          if (route.request().method() === 'POST') {
            const input = route.request().postDataJSON() as SkillLibraryMutation
            mutations.push(input)
            if (input.action === 'save' && failSave) return route.fulfill({ status: 409, json: { error: '다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요.' } })
            const item = inventory.items.find(item => item.id === input.id)
            if (input.action === 'toggle' && item) { item.enabled = input.enabled!; item.enabledScope = input.scope!; if (input.scope === 'common') item.commonEnabled = input.enabled }
            if (input.action === 'reset' && item) { item.enabled = item.commonEnabled!; item.enabledScope = 'common' }
            if (input.action === 'save') contents.set(input.id!, input.content!)
            if (input.action === 'delete') {
              inventory.items = inventory.items.filter(item => item.id !== input.id)
              const defaultItem = inventory.defaults.find(value => value.name === item?.name)
              if (defaultItem) defaultItem.installed = false
            }
            if (input.action === 'import') {
              const original = inventory.candidates.find(item => item.id === input.id)!
              inventory.items.push(makeItem(original.name, { scope: input.scope!, enabledScope: input.scope!, origins: [{ id: original.id, path: original.path, label: original.label, agent: original.agent }] }))
            }
            if (input.action === 'restore') { inventory.defaults.find(item => item.name === input.name)!.installed = true; inventory.items.push(makeItem(input.name!, { source: 'builtin', editable: false })) }
            if (input.action === 'create') { const item = makeItem(input.name!, { scope: input.scope!, enabledScope: input.scope! }); inventory.items.push(item); contents.set(item.id, input.content!) }
            return route.fulfill({ json: { ok: true } })
          }
          return route.fulfill({ json: inventory })
        }
        if (url.pathname === '/api/agent/harness') return route.fulfill({ json: { scopes: [], agents: [], items: [], locations: [], warnings: [] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width >= 768 ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      const choose = async (label: string, option: string) => {
        await page.getByRole('combobox', { name: label, exact: true }).click()
        const menu = page.getByRole('listbox', { name: label, exact: true })
        const bounds = (await menu.boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        await menu.getByRole('option', { name: option, exact: true }).click()
      }
      const back = async () => { if (width < 768) await page.getByRole('button', { name: '목록으로', exact: true }).click() }
      await page.goto('http://mew-skills.test/')
      const opener = page.getByRole('button', { name: 'Skills 관리', exact: true })
      await opener.click()
      await page.getByRole('button', { name: 'writing', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'writing', exact: true }).count(), 1)
      assert.equal(await page.locator('select, datalist').count(), 0)
      assert.equal(await page.getByRole('combobox').count(), 0, 'ordinary skill list needs no runtime or directory filter')
      if (width >= 768) assert.equal(await page.getByLabel('스킬 검색').evaluate(el => el === el.ownerDocument.activeElement), true)
      const placeholderContrast = await page.getByLabel('스킬 검색').evaluate(el => {
        const view = el.ownerDocument.defaultView!
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        const foreground = luminance(view.getComputedStyle(el, '::placeholder').color), background = luminance(view.getComputedStyle(el).backgroundColor)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
      assert.ok(placeholderContrast >= 4.5, `placeholder contrast ${placeholderContrast}`)
      const writingSwitch = page.getByRole('switch', { name: 'writing 켜짐', exact: true })
      await writingSwitch.click()
      await page.getByRole('switch', { name: 'writing 켜짐', exact: true, checked: false }).waitFor()
      assert.equal(mutations.at(-1)?.scope, 'common')
      await page.getByRole('button', { name: 'writing', exact: true }).click()
      await page.getByLabel('스킬 지침').waitFor()
      if (width < 768) assert.equal(await page.getByRole('heading', { name: 'writing', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
      await choose('설정 적용 범위', '이 프로젝트')
      await page.getByRole('switch', { name: 'writing 켜짐', exact: true }).last().click()
      await page.getByRole('button', { name: '공통 설정 사용', exact: true }).waitFor()
      assert.equal(mutations.at(-1)?.scope, 'project')
      await choose('설정 적용 범위', '모든 프로젝트')
      assert.equal(await page.getByRole('switch', { name: 'writing 켜짐', exact: true }).last().getAttribute('aria-checked'), 'false', 'common and project states remain distinct')
      await choose('설정 적용 범위', '이 프로젝트')
      assert.equal(await page.getByRole('switch', { name: 'writing 켜짐', exact: true }).last().getAttribute('aria-checked'), 'true')
      await page.getByRole('button', { name: '공통 설정 사용', exact: true }).click()
      await page.getByRole('combobox', { name: '설정 적용 범위', exact: true }).filter({ hasText: '모든 프로젝트' }).waitFor()
      await page.getByText('출처', { exact: true }).click()
      assert.match(await page.locator('details').innerText(), /\/home\/test\/\.codex\/skills\/writing\/SKILL.md/)
      assert.match(await page.locator('details').innerText(), /\/home\/test\/\.agents\/skills\/writing\/SKILL.md/)
      assert.equal((await page.locator('details').innerText()).split('/library/skills/writing/SKILL.md').length - 1, 1, 'effective source appears once')
      await page.screenshot({ path: `/tmp/mew-skill-library-review/sources-${width}.png` })
      await page.getByRole('button', { name: '지침 수정', exact: true }).click()
      const editor = page.getByRole('textbox', { name: '스킬 지침', exact: true })
      await editor.fill(contents.get('writing') + '\nKeep this draft.\n')
      await page.getByRole('button', { name: 'MCP', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
      assert.match(await editor.inputValue(), /Keep this draft/)
      await page.keyboard.press('Escape')
      await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
      failSave = true
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.match(await editor.inputValue(), /Keep this draft/)
      failSave = false
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      await back()
      await page.getByRole('button', { name: '외부에서 발견', exact: true }).click()
      await page.getByRole('button', { name: 'frontend Claude', exact: true }).click()
      await page.getByLabel('스킬 지침').waitFor()
      assert.equal(await page.getByRole('button', { name: '삭제', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: '지침 수정', exact: true }).count(), 0)
      await choose('저장 범위', '이 프로젝트')
      await page.getByRole('button', { name: '가져오기', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '가져왔습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.action, 'import')
      assert.equal(mutations.at(-1)?.scope, 'project')
      assert.equal(inventory.candidates.length, 1, 'import retains the external original')
      await page.getByRole('button', { name: '내 스킬', exact: true }).click()
      await page.getByRole('button', { name: 'commit', exact: true }).click()
      await page.getByLabel('스킬 지침').waitFor()
      assert.equal(await page.getByRole('button', { name: '지침 수정', exact: true }).isEnabled(), false)
      await page.getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
      await page.getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '제거했습니다' }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'commit', exact: true }).count(), 0)
      await page.getByRole('button', { name: '기본 제공 스킬', exact: true }).click()
      await page.getByRole('button', { name: 'commit 복원', exact: true }).click()
      await page.getByText('설치됨', { exact: true }).waitFor()
      assert.equal(mutations.at(-1)?.action, 'restore')
      await page.getByRole('button', { name: '스킬 추가', exact: true }).click()
      await page.getByLabel('이름', { exact: true }).fill('my-check')
      await page.getByRole('combobox', { name: '저장 범위', exact: true }).click()
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('alertdialog').count(), 0, 'Escape dismisses the selector before protecting the draft')
      assert.equal(await page.getByLabel('이름', { exact: true }).inputValue(), 'my-check')
      await choose('저장 범위', '이 프로젝트')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.scope, 'project')
      assert.match(mutations.at(-1)?.content ?? '', /name: my-check/)
      await page.getByRole('button', { name: 'my-check', exact: true }).waitFor()
      await page.screenshot({ path: `/tmp/mew-skill-library-review/library-${width}.png` })
      assert.equal(await page.getByRole('dialog').evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.defaultView!.innerWidth), true)
      await page.getByRole('button', { name: 'MCP', exact: true }).click()
      await page.getByLabel('확장 검색').waitFor()
      await page.getByRole('button', { name: 'Skills', exact: true }).click()
      await page.getByRole('button', { name: 'my-check', exact: true }).waitFor()
      await page.getByRole('button', { name: '닫기', exact: true }).focus()
      await page.keyboard.press('Shift+Tab')
      assert.equal(await page.getByRole('dialog').evaluate(el => el.contains(el.ownerDocument.activeElement)), true)
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(await opener.evaluate(el => el === el.ownerDocument.activeElement), true)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
