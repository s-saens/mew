import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import type { HarnessInventory, HarnessMutation } from '../shared/agent-harness.ts'

const root = path.resolve(import.meta.dirname, '..')
test('harness popup supports scope filtering, protected drafts, editing, moves and deletion on desktop/mobile', { skip: !domBrowserExecutable(), timeout: 45000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentHarnessButtons} from '${root}/src/components/agent-harness-modal.tsx';
createRoot(document.getElementById('root')).render(<div className="flex"><button aria-label="세션 정보">i</button><AgentHarnessButtons cwd="/project"/></div>);`
  const bundle = await build({ input: 'virtual:harness.tsx', write: false, platform: 'browser', onLog(level, log, defaultHandler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'harness-fixture', resolveId(id) { if (id === 'virtual:harness.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:harness.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/agent-harness-modal.tsx', 'packages/ui/src/select-field.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', hasTouch: width < 768, isMobile: width < 768 })
      page.setDefaultTimeout(5000)
      const field = (name: string) => page.getByRole('combobox', { name, exact: true })
      const choose = async (name: string, option: string) => {
        const trigger = field(name)
        if (width < 768) await trigger.tap()
        else await trigger.click()
        const menu = page.getByRole('listbox', { name, exact: true })
        const bounds = (await menu.boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844)
        const item = menu.getByRole('option', { name: option, exact: true })
        if (width < 768) await item.tap()
        else await item.click()
        assert.equal(await menu.count(), 0)
      }
      const errors: string[] = [], mutations: HarnessMutation[] = []
      page.on('pageerror', error => errors.push(error.message))
      const inventory: HarnessInventory = {
        scopes: [{ id: 'global', label: '전역', path: '/home/test', global: true }, { id: '/project', label: 'project', path: '/project', global: false }, { id: '/project/apps/web', label: 'apps/web', path: '/project/apps/web', global: false }],
        agents: [{ id: 'shared', label: '공통' }, { id: 'codex', label: 'Codex' }, { id: 'claude', label: 'Claude' }],
        locations: [
          { id: 'global', kind: 'skills', agent: 'shared', scope: 'global', label: '공통', path: '/home/test/.agents/skills', writable: true },
          { id: 'global-codex', kind: 'skills', agent: 'codex', scope: 'global', label: 'Codex', path: '/home/test/.codex/skills', writable: true },
          { id: 'local', kind: 'skills', agent: 'codex', scope: '/project', label: 'Codex', path: '/project/.codex/skills', writable: true },
          { id: 'child', kind: 'skills', agent: 'claude', scope: '/project/apps/web', label: 'Claude', path: '/project/apps/web/.claude/skills', writable: true },
        ],
        items: [
          { id: 'shared', location: 'global', name: 'writing', description: '공통 문서 작성 지침', path: '/home/test/.agents/skills/writing/SKILL.md', writable: true },
          { id: 'deploy', location: 'local', name: 'deploy', description: '프로젝트 배포 전 확인할 사항', path: '/project/.codex/skills/deploy/SKILL.md', writable: true },
          { id: 'child', location: 'child', name: 'frontend', description: '웹 프로젝트 UI 개발 지침', path: '/project/apps/web/.claude/skills/frontend/SKILL.md', writable: true },
          { id: 'system', location: 'global-codex', name: 'system-skill', description: '기본 제공 스킬', path: '/home/test/.codex/skills/.system/system-skill/SKILL.md', writable: false, reason: '시스템 스킬' },
        ], warnings: [],
      }
      let detailText = '---\nname: deploy\ndescription: 배포 지침\n---\n\n# 배포\n\n테스트를 통과한 변경사항을 반영합니다.\n'
      let failSave = false
      await page.route('http://mew-harness.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (url.pathname === '/api/agent/harness/detail') return route.fulfill({ json: { item: inventory.items.find(item => item.id === url.searchParams.get('id')), content: url.searchParams.get('kind') === 'mcp' ? '{"command":"node","args":["server.js"]}' : detailText, revision: 'revision', files: url.searchParams.get('kind') === 'mcp' ? [] : ['SKILL.md', 'scripts/check.sh'] } })
        if (url.pathname === '/api/agent/harness') {
          if (route.request().method() === 'POST') {
            const input = route.request().postDataJSON() as HarnessMutation
            mutations.push(input)
            if (failSave) return route.fulfill({ status: 409, json: { error: '다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요' } })
            if (input.action === 'save') detailText = input.content!
            if (input.action === 'move') inventory.items = inventory.items.map(item => item.id === input.id ? { ...item, location: input.target! } : item)
            if (input.action === 'delete') inventory.items = inventory.items.filter(item => item.id !== input.id)
            return route.fulfill({ json: { ok: true } })
          }
          return route.fulfill({ json: inventory })
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width === 390 ? '' : 'dark'}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      await page.goto('http://mew-harness.test/')
      const opener = page.getByRole('button', { name: 'Skills 관리', exact: true })
      await opener.click()
      await page.getByRole('button', { name: 'deploy Codex', exact: true }).waitFor()
      if (width >= 768) assert.ok(await page.evaluate('document.activeElement?.getAttribute("aria-label") === "확장 검색"'))
      assert.equal(await page.locator('select, datalist').count(), 0)
      await field('에이전트').focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('End')
      assert.equal(await field('에이전트').innerText(), '모든 에이전트', 'navigation does not apply the filter')
      await page.keyboard.press('Enter')
      await page.getByRole('button', { name: 'frontend Claude', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'deploy Codex', exact: true }).count(), 0)
      await choose('에이전트', '모든 에이전트')
      await field('스코프').click()
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await page.getByRole('dialog').count(), 1)
      assert.ok(await field('스코프').evaluate(el => el === el.ownerDocument.activeElement))
      const deployRow = page.getByRole('button', { name: 'deploy Codex', exact: true })
      assert.equal(await deployRow.innerText(), 'deploy\nCodex')
      assert.ok((await deployRow.boundingBox())!.height <= 32)
      assert.doesNotMatch(await page.getByLabel('확장 목록').innerText(), /프로젝트 배포 전 확인할 사항/)
      await page.getByRole('button', { name: '전역 접기', exact: true }).click()
      const expandGlobal = page.getByRole('button', { name: '전역 펼치기', exact: true })
      assert.equal(await expandGlobal.getAttribute('aria-expanded'), 'false')
      assert.equal(await page.getByRole('button', { name: 'writing Global', exact: true }).isVisible(), false)
      assert.equal(await deployRow.isVisible(), true)
      await expandGlobal.press('Enter')
      assert.equal(await page.getByRole('button', { name: 'writing Global', exact: true }).isVisible(), true)
      await choose('스코프', 'apps/web')
      assert.equal(await page.getByRole('button', { name: 'deploy Codex', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'frontend Claude', exact: true }).waitFor()
      await choose('스코프', '모든 스코프')
      await page.getByRole('button', { name: 'system-skill Codex', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      assert.ok(await page.evaluate('document.querySelector("[role=dialog]")?.contains(document.activeElement) && document.activeElement?.getClientRects().length > 0'))
      assert.equal(await page.getByRole('button', { name: '삭제', exact: true }).isEnabled(), false)
      if (width < 768) {
        await page.getByRole('button', { name: '목록으로' }).click()
        if (width >= 768) assert.ok(await page.evaluate('document.activeElement?.getAttribute("aria-label") === "확장 검색"'))
      }
      await page.getByRole('button', { name: 'deploy Codex', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      assert.equal(await page.getByLabel('확장 설명').innerText(), '프로젝트 배포 전 확인할 사항')
      await fs.mkdir('/tmp/mew-harness-review', { recursive: true })
      await page.screenshot({ path: `/tmp/mew-harness-review/harness-${width}.png` })
      await page.getByRole('button', { name: '수정', exact: true }).click()
      const editor = page.getByLabel('스킬 내용')
      await editor.fill(detailText + '\n추가 지침')
      if (width >= 768) {
        await choose('스코프', '전역')
        await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
        assert.equal(await field('스코프').innerText(), '모든 스코프')
        assert.match(await editor.inputValue(), /추가 지침/)
        await page.getByRole('button', { name: '현재 프로젝트 · project 접기', exact: true }).click()
        assert.equal(await page.getByRole('alertdialog').count(), 0)
        assert.match(await editor.inputValue(), /추가 지침/)
        await page.getByRole('button', { name: '현재 프로젝트 · project 펼치기', exact: true }).click()
      }
      await page.keyboard.press('Escape')
      await page.getByRole('alertdialog').waitFor()
      await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
      assert.match(await editor.inputValue(), /추가 지침/)
      failSave = true
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.match(await editor.inputValue(), /추가 지침/)
      failSave = false
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      await page.getByRole('button', { name: 'deploy Codex', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      await page.getByRole('button', { name: '이동', exact: true }).click()
      assert.equal(await page.locator('select, datalist').count(), 0)
      await choose('대상 위치', '전역 · Codex')
      await page.getByRole('button', { name: '이동 확인', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '이동', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '이동했습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.target, 'global-codex')
      await page.getByRole('button', { name: 'deploy Codex', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      await page.getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '취소', exact: true }).click()
      assert.notEqual(mutations.at(-1)?.action, 'delete')
      await page.getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '삭제했습니다' }).waitFor()
      await page.getByRole('button', { name: 'MCP', exact: true }).click()
      assert.equal(await page.getByRole('button', { name: 'MCP', exact: true }).getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: '전역 접기', exact: true }).click()
      assert.equal(await page.getByRole('button', { name: 'writing Global', exact: true }).isVisible(), false)
      await page.getByRole('button', { name: 'frontend Claude', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      await page.getByRole('button', { name: '수정', exact: true }).click()
      await page.getByLabel('MCP 설정 JSON').fill('{"command":"node","args":["updated.js"]}')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.kind, 'mcp')
      assert.match(mutations.at(-1)!.content!, /updated.js/)
      await page.getByRole('button', { name: '추가', exact: true }).click()
      await page.getByLabel('이름', { exact: true }).fill('new-tool')
      assert.equal(await page.locator('select, datalist').count(), 0)
      await field('대상 위치').click()
      await page.getByRole('listbox', { name: '대상 위치' }).waitFor()
      await page.screenshot({ path: `/tmp/mew-harness-review/dropdown-${width}.png` })
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('alertdialog').count(), 0, 'Escape closes the dropdown before guarding the draft')
      assert.equal(await page.getByLabel('이름', { exact: true }).inputValue(), 'new-tool')
      await choose('대상 위치', '전역 · Codex')
      await page.getByLabel('MCP 설정 JSON').fill('{"command":"node","args":["new.js"]}')
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.action, 'create')
      assert.equal(mutations.at(-1)?.name, 'new-tool')
      await page.getByRole('button', { name: '닫기', exact: true }).focus()
      await page.keyboard.press('Shift+Tab')
      assert.ok(await page.evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"))
      assert.ok(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.ok(await page.evaluate('document.activeElement?.getAttribute("aria-label") === "Skills 관리"'))
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})

test('Mew shared MCP defaults, credential-free import and connection lifecycle work on desktop/mobile', { skip: !domBrowserExecutable(), timeout: 60000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentHarnessButtons} from '${root}/src/components/agent-harness-modal.tsx';
createRoot(document.getElementById('root')).render(<AgentHarnessButtons cwd="/project"/>);`
  const bundle = await build({ input: 'virtual:shared-harness.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'shared-harness-fixture',
    resolveId(id) {
      if (id === 'virtual:shared-harness.tsx') return id
      if (id.endsWith('LoginDesktopViewer')) return 'virtual:login-viewer.tsx'
      if (id.endsWith('.css')) return 'virtual:style'
    },
    load(id) {
      if (id === 'virtual:shared-harness.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:login-viewer.tsx') return `import React from '${root}/node_modules/react/index.js'; export function LoginDesktopViewer({streamUrl,reopen}) { return <div role="region" aria-label="MCP 로그인 화면" data-stream-url={streamUrl} className="h-full w-full bg-surface-raised">Cloudflare 로그인<button onClick={() => void reopen()}>로그인 화면 다시 열기</button></div> }`
    },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const files = ['src/components/agent-harness-modal.tsx', 'src/components/shared-mcp-connection.tsx', 'packages/ui/src/select-field.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', hasTouch: width < 768, isMobile: width < 768 })
      page.setDefaultTimeout(5000)
      const errors: string[] = [], mutations: HarnessMutation[] = [], connectionActions: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      let status: 'disconnected' | 'needs_auth' | 'connected' = 'disconnected', authenticate = false, failConnect = false, failImport = true, polls = 0
      const inventory: HarnessInventory = {
        canManageSharedMcp: true,
        scopes: [{ id: 'mew', label: 'Mew', path: 'Mew installation', global: true }, { id: 'global', label: '전역', path: '/home/test', global: true }],
        agents: [{ id: 'mew', label: 'Mew' }, { id: 'claude', label: 'Claude' }],
        locations: [{ id: 'mew-mcp', kind: 'mcp', agent: 'mew', scope: 'mew', label: 'Mew', path: 'Mew account MCP', writable: true }, { id: 'claude-mcp', kind: 'mcp', agent: 'claude', scope: 'global', label: 'Claude', path: '/home/test/.claude.json', writable: true }],
        items: [{ id: 'native', location: 'claude-mcp', name: 'cloudflare', description: '기존 Claude MCP', path: '/home/test/.claude/plugins/cloudflare/.mcp.json', writable: false, reason: '플러그인 설정' }], warnings: [],
      }
      let detailRequests = 0, ownsJob: boolean | undefined
      const connection = () => ({ name: 'shared-cloud', status, ...(status === 'needs_auth' && ownsJob !== undefined ? { ownsJob, ...(ownsJob ? { streamUrl: '/api/agent/mcp/login-desktop/job/stream' } : {}) } : {}) })
      await page.route('http://mew-shared-mcp.test/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (url.pathname === '/api/agent/harness/detail') { detailRequests++; return route.fulfill({ json: { item: inventory.items.find(item => item.id === url.searchParams.get('id')), content: '{"type":"http","url":"https://mcp.example.com/mcp"}', revision: 'revision', files: [] } }) }
        if (url.pathname === '/api/agent/harness') {
          if (route.request().method() === 'POST') {
            const input = route.request().postDataJSON() as HarnessMutation
            mutations.push(input)
            if (input.action === 'import' && failImport) { failImport = false; return route.fulfill({ status: 409, json: { error: '같은 이름이 있습니다. 이름을 확인하세요.' } }) }
            inventory.items.push({ id: input.action === 'import' ? 'imported' : 'created', location: 'mew-mcp', name: input.action === 'import' ? 'cloudflare' : input.name!, description: '', path: 'Mew account MCP', writable: true })
            return route.fulfill({ json: { ok: true } })
          }
          return route.fulfill({ json: inventory })
        }
        if (url.pathname === '/api/agent/mcp/status') { polls++; if (authenticate) status = 'connected'; return route.fulfill({ json: connection() }) }
        if (url.pathname.startsWith('/api/agent/mcp/')) {
          const action = url.pathname.split('/').at(-1)!
          connectionActions.push(action)
          assert.deepEqual(route.request().postDataJSON(), { name: 'shared-cloud' })
          if (action === 'connect' && failConnect) { failConnect = false; return route.fulfill({ status: 502, json: { error: '연결 서버가 응답하지 않습니다.' } }) }
          status = action === 'connect' ? 'needs_auth' : 'disconnected'
          ownsJob = action === 'connect' ? true : undefined
          return route.fulfill({ json: connection() })
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width === 390 ? '' : 'dark'}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
      })
      const opener = page.getByRole('button', { name: 'MCP 관리', exact: true })
      await page.goto('http://mew-shared-mcp.test/')
      await opener.click()
      await page.getByRole('button', { name: 'cloudflare Claude', exact: true }).click()
      await page.getByRole('button', { name: 'Mew에 가져오기', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: '수정', exact: true }).isEnabled(), false)
      await page.getByRole('button', { name: 'Mew에 가져오기', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '같은 이름' }).waitFor()
      await page.getByRole('button', { name: 'Mew에 가져오기', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Mew 공통으로 가져왔습니다' }).waitFor()
      assert.deepEqual(mutations.at(-1), { cwd: '/project', kind: 'mcp', action: 'import', id: 'native', revision: 'revision', target: 'mew-mcp' })
      assert.equal(await page.getByRole('button', { name: 'cloudflare Claude', exact: true }).count(), 1, 'import leaves the native entry intact')
      await page.getByRole('button', { name: 'cloudflare Mew 공통', exact: true }).waitFor()
      await page.getByRole('button', { name: '추가', exact: true }).click()
      assert.equal(await page.getByRole('combobox', { name: '대상 위치', exact: true }).innerText(), 'Mew 공통')
      await page.getByRole('textbox', { name: '이름', exact: true }).fill('shared-cloud')
      await page.getByRole('textbox', { name: '서버 URL', exact: true }).fill('https://mcp.example.com/mcp')
      assert.equal(await page.getByRole('textbox', { name: 'MCP 설정 JSON', exact: true }).count(), 0)
      await page.getByRole('button', { name: '저장', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
      assert.equal(mutations.at(-1)?.target, 'mew-mcp')
      assert.deepEqual(JSON.parse(mutations.at(-1)!.content!), { type: 'http', url: 'https://mcp.example.com/mcp' })
      const sharedRow = () => page.getByRole('button', { name: 'shared-cloud Mew 공통', exact: true })
      status = 'needs_auth'
      await sharedRow().click()
      const state = () => page.getByRole('region', { name: 'MCP 연결 상태', exact: true })
      await state().getByRole('status').filter({ hasText: '로그인 필요' }).waitFor()
      assert.equal(await state().getByRole('button', { name: '로그인', exact: true }).isEnabled(), true, 'saved authentication requirements offer a way to start login')
      assert.equal(await state().getByRole('button', { name: '연결 취소', exact: true }).count(), 0, 'saved authentication requirements are not active authorization jobs')
      const savedAuthPolls = polls
      await new Promise(resolve => setTimeout(resolve, 1700))
      assert.equal(polls, savedAuthPolls, 'saved authentication requirements are not polled')
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      assert.deepEqual(connectionActions, [], 'closing saved authentication requirements does not cancel a job')
      await opener.click(); await sharedRow().click()
      await state().getByRole('status').filter({ hasText: '로그인 필요' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '이동', exact: true }).count(), 0)
      await state().getByRole('button', { name: '로그인', exact: true }).click()
      const viewer = page.getByRole('region', { name: 'MCP 로그인 화면', exact: true })
      await viewer.waitFor()
      assert.equal(await viewer.getAttribute('data-stream-url'), '/api/agent/mcp/login-desktop/job/stream')
      const box = (await viewer.boundingBox())!
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844)
      assert.equal(await page.locator('select, datalist').count(), 0)
      await fs.mkdir('/tmp/mew-harness-review', { recursive: true })
      await page.screenshot({ path: `/tmp/mew-harness-review/shared-mcp-${width}.png` })
      await viewer.getByRole('button', { name: '로그인 화면 다시 열기' }).click()
      authenticate = true
      await state().getByRole('status').filter({ hasText: /^연결됨$/ }).waitFor()
      assert.equal(await viewer.count(), 0)
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      assert.deepEqual(connectionActions, ['connect', 'connect'], 'reopening the login view keeps polling and closing an authenticated connection preserves authorization')
      await opener.click(); await sharedRow().click()
      await page.getByRole('button', { name: '연결 해제', exact: true }).click()
      authenticate = false
      await state().getByRole('status').filter({ hasText: '연결 안 됨' }).waitFor()
      failConnect = true
      await page.getByRole('button', { name: '연결', exact: true }).click()
      await state().getByRole('alert').filter({ hasText: '연결 서버가 응답하지 않습니다' }).waitFor()
      await state().getByRole('button', { name: '다시 연결', exact: true }).click()
      await viewer.waitFor()
      await page.getByRole('button', { name: '연결 취소', exact: true }).click()
      await state().getByRole('status').filter({ hasText: '연결 안 됨' }).waitFor()
      assert.equal(await viewer.count(), 0)
      await page.getByRole('button', { name: '연결', exact: true }).click(); await viewer.waitFor()
      const previousCancels = connectionActions.filter(action => action === 'cancel').length
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await page.waitForFunction(`document.querySelector('[role=dialog]') === null`)
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(connectionActions.filter(action => action === 'cancel').length, previousCancels + 1, 'closing pending authentication cancels its host browser job')
      const closedPolls = polls
      await new Promise(resolve => setTimeout(resolve, 1700))
      assert.equal(polls, closedPolls, 'polling stops when the manager closes')
      status = 'needs_auth'; ownsJob = false
      const observerActions = connectionActions.length
      await opener.click(); await sharedRow().click()
      await state().getByRole('status').filter({ hasText: '로그인 필요' }).waitFor()
      assert.equal(await state().getByRole('button', { name: '연결 취소', exact: true }).count(), 1, 'another owner may explicitly cancel a shared connection')
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(connectionActions.length, observerActions, 'closing an owner observer preserves the initiating owner authentication job')
      inventory.canManageSharedMcp = false
      inventory.locations.find(location => location.id === 'mew-mcp')!.writable = false
      inventory.items = inventory.items.map(item => item.location === 'mew-mcp' ? { ...item, writable: false, reason: '소유자만 관리할 수 있습니다.' } : item)
      status = 'needs_auth'
      const readonlyDetails = detailRequests, readonlyActions = connectionActions.length, readonlyMutations = mutations.length
      await opener.click(); await sharedRow().click()
      await state().getByRole('status').filter({ hasText: '로그인 필요' }).waitFor()
      assert.equal(await page.getByRole('region', { name: 'MCP 로그인 화면', exact: true }).count(), 0, 'members never open the shared owner authorization screen')
      assert.equal(await page.getByLabel('확장 내용').count(), 0)
      for (const action of ['수정', '삭제', '연결', '연결 해제', '연결 취소']) assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), 0)
      assert.match(await page.getByRole('dialog').innerText(), /소유자만 관리할 수 있습니다/)
      if (width < 768) await page.getByRole('button', { name: '목록으로', exact: true }).click()
      await page.getByRole('button', { name: 'cloudflare Claude', exact: true }).click()
      await page.getByLabel('확장 내용').waitFor()
      assert.equal(await page.getByRole('button', { name: 'Mew에 가져오기', exact: true }).count(), 0)
      if (width < 768) await page.getByRole('button', { name: '목록으로', exact: true }).click()
      await page.getByRole('button', { name: '추가', exact: true }).click()
      await page.getByRole('combobox', { name: '대상 위치', exact: true }).click()
      assert.equal(await page.getByRole('option', { name: 'Mew 공통', exact: true }).count(), 0, 'members cannot create in the shared installation location')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: '취소', exact: true }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '변경 버리기', exact: true }).click()
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      assert.equal(detailRequests, readonlyDetails + 1, 'only native MCP details are fetched for members')
      assert.equal(connectionActions.length, readonlyActions, 'viewing and leaving shared pending authentication never cancels the owner job')
      assert.equal(mutations.length, readonlyMutations)
      assert.deepEqual(errors, [])
      assert.ok(await opener.evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.defaultView!.innerWidth))
      await page.close()
    }
  } finally { await browser.close() }
})
