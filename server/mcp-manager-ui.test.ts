import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import type { HarnessInventory, HarnessMutation } from '../shared/agent-harness.ts'
import type { McpManagedServer, McpManagementInventory, McpManagementMutation } from '../shared/mcp-management.ts'

const root = path.resolve(import.meta.dirname, '..')
function contrast(foreground: string, background: string) {
  const luminance = (color: string) => color.match(/\d+/g)!.slice(0, 3).map(value => { const channel = Number(value) / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
test('grouped MCP manager preserves member choices, protects drafts and keeps native originals on desktop/mobile', { timeout: 90000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentHarnessButtons} from '${root}/src/components/agent-harness-modal.tsx';
createRoot(document.getElementById('root')).render(<AgentHarnessButtons cwd="/project"/>);`
  const bundle = await build({ input: 'virtual:mcp-manager.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'mcp-manager-fixture',
    resolveId(id) { if (id === 'virtual:mcp-manager.tsx') return id; if (id.endsWith('LoginDesktopViewer')) return 'virtual:login.tsx'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:mcp-manager.tsx') return source; if (id === 'virtual:style') return ''; if (id === 'virtual:login.tsx') return `import React from '${root}/node_modules/react/index.js'; export function LoginDesktopViewer() { return <div role="region" aria-label="MCP 로그인 화면">Login</div> }` },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/mcp-manager.tsx', 'src/components/mcp-manager-fields.tsx', 'src/components/agent-harness-modal.tsx', 'src/components/shared-mcp-connection.tsx', 'packages/ui/src/select-field.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  await fs.mkdir('/tmp/mew-mcp-manager-review', { recursive: true })
  for (const width of [1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ko-KR', hasTouch: width < 768, isMobile: width < 768, reducedMotion: 'reduce' })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], mutations: McpManagementMutation[] = [], nativeMutations: HarnessMutation[] = [], connectionActions: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const usage = (enabled = true) => ({ common: enabled, project: null, enabled })
    const makeServer = (name: string, groupId: string | null, enabled = true): McpManagedServer => ({ name, endpoint: groupId === 'cloudflare' ? `https://${name}.mcp.cloudflare.com/mcp` : 'https://example.com/mcp', transport: 'http', groupId, inferredGroup: !!groupId, usage: usage(enabled), effectiveEnabled: enabled, connection: { status: name === 'bindings' ? 'needs_auth' : name === 'builds' ? 'error' : 'connected' } })
    const inventory: McpManagementInventory = {
      canManage: true, revision: { registry: 'registry', common: 'common', project: 'project' }, projectRoot: '/project',
      groups: [{ id: 'cloudflare', name: 'Cloudflare', suggested: true, usage: usage(), members: ['bindings', 'builds'], enabledCount: 1 }],
      servers: [makeServer('bindings', 'cloudflare'), makeServer('builds', 'cloudflare', false), makeServer('search', null)],
      cloudflare: { url: 'https://mcp.cloudflare.com/mcp', existingUnified: null, suggestedName: 'cloudflare-api', candidates: [{ name: 'bindings', endpoint: 'https://bindings.mcp.cloudflare.com/mcp', unified: false, effectiveEnabled: true }, { name: 'builds', endpoint: 'https://builds.mcp.cloudflare.com/mcp', unified: false, effectiveEnabled: false }] },
    }
    const harness: HarnessInventory = {
      canManageSharedMcp: true,
      scopes: [{ id: 'mew', label: 'Mew', path: 'Mew installation', global: true }, { id: 'global', label: '전역', path: '/home/test', global: true }],
      agents: [{ id: 'mew', label: 'Mew' }, { id: 'claude', label: 'Claude' }],
      locations: [{ id: 'mew-mcp', kind: 'mcp', agent: 'mew', scope: 'mew', label: 'Mew', path: 'Mew account MCP', writable: true }, { id: 'native', kind: 'mcp', agent: 'claude', scope: 'global', label: 'Claude', path: '/home/test/.claude.json', writable: true }],
      items: [{ id: 'external-cloud', location: 'native', name: 'cloudflare-native', description: 'External Cloudflare MCP', path: '/home/test/.claude.json', writable: true }], warnings: [],
    }
    let nativeScans = 0
    let failCreate = false, connectionStatus: 'connected' | 'needs_auth' | 'disconnected' = 'needs_auth'
    function recalculate() {
      for (const group of inventory.groups) {
        group.members = inventory.servers.filter(server => server.groupId === group.id).map(server => server.name)
        group.usage.enabled = group.usage.project ?? group.usage.common
      }
      for (const server of inventory.servers) { server.usage.enabled = server.usage.project ?? server.usage.common; server.effectiveEnabled = server.usage.enabled && (inventory.groups.find(group => group.id === server.groupId)?.usage.enabled ?? true) }
      for (const group of inventory.groups) group.enabledCount = inventory.servers.filter(server => server.groupId === group.id && server.effectiveEnabled).length
    }
    await page.route('http://mew-mcp-manager.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (url.pathname === '/api/agent/mcp-management') {
        if (route.request().method() === 'POST') {
          const value = route.request().postDataJSON() as McpManagementMutation
          mutations.push(value)
          if (value.action === 'create-server') {
            if (failCreate) { failCreate = false; return route.fulfill({ status: 409, json: { error: '이름이 이미 있습니다. 다른 이름을 입력하세요.' } }) }
            inventory.servers.push(makeServer(value.name, null))
          }
          if (value.action === 'usage') {
            const target = value.target === 'group' ? inventory.groups.find(group => group.id === value.id)! : inventory.servers.find(server => server.name === value.id)!
            if (value.scope === 'common') target.usage.common = value.enabled!; else target.usage.project = value.enabled
          }
          if (value.action === 'create-group') inventory.groups.push({ id: 'group-created', name: value.name, suggested: false, usage: usage(), members: value.members ?? [], enabledCount: 0 })
          if (value.action === 'rename-group') inventory.groups.find(group => group.id === value.id)!.name = value.name
          if (value.action === 'remove-group') { inventory.groups = inventory.groups.filter(group => group.id !== value.id); inventory.servers.filter(server => server.groupId === value.id).forEach(server => { server.groupId = null }) }
          if (value.action === 'assign') inventory.servers.filter(server => value.names.includes(server.name)).forEach(server => { server.groupId = value.groupId })
          if (value.action === 'consolidate-cloudflare') {
            if (!inventory.cloudflare.existingUnified) { inventory.servers.push(makeServer(value.name, 'cloudflare')); inventory.cloudflare.existingUnified = value.name }
            inventory.servers.filter(server => value.disable.includes(server.name)).forEach(server => { if (value.scope === 'common') server.usage.common = false; else server.usage.project = false })
          }
          recalculate()
          return route.fulfill({ json: { ok: true } })
        }
        return route.fulfill({ json: inventory })
      }
      if (url.pathname === '/api/agent/harness/detail') return route.fulfill({ json: { item: harness.items.find(item => item.id === url.searchParams.get('id')), revision: 'native-revision', content: '{"type":"http","url":"https://bindings.mcp.cloudflare.com/mcp"}', files: [] } })
      if (url.pathname === '/api/agent/harness') {
        if (route.request().method() === 'POST') {
          const value = route.request().postDataJSON() as HarnessMutation
          nativeMutations.push(value)
          if (failCreate) { failCreate = false; return route.fulfill({ status: 409, json: { error: '이름이 이미 있습니다. 다른 이름을 입력하세요.' } }) }
          inventory.servers.push(makeServer(value.name ?? 'cloudflare-native', null))
          return route.fulfill({ json: { ok: true } })
        }
        nativeScans++
        return route.fulfill({ json: harness })
      }
      if (url.pathname === '/api/agent/mcp/status') return route.fulfill({ json: { name: url.searchParams.get('name'), status: connectionStatus } })
      if (url.pathname.startsWith('/api/agent/mcp/')) {
        const action = url.pathname.split('/').at(-1)!
        connectionActions.push(action)
        connectionStatus = action === 'connect' ? 'connected' : 'disconnected'
        const connected = inventory.servers.find(server => server.name === route.request().postDataJSON().name)
        if (connected) connected.connection = { status: connectionStatus }
        return route.fulfill({ json: { name: route.request().postDataJSON().name, status: connectionStatus } })
      }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${width >= 768 ? 'dark' : ''}" lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    const choose = async (name: string, label: string) => { await page.getByRole('combobox', { name, exact: true }).click(); const list = page.getByRole('listbox', { name, exact: true }); const bounds = (await list.boundingBox())!; assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844); await list.getByRole('option', { name: label, exact: true }).click() }
    const back = async () => { if (width < 768) await page.getByRole('button', { name: '목록으로', exact: true }).click() }
    const opener = page.getByRole('button', { name: 'MCP 관리', exact: true })
    await page.goto('http://mew-mcp-manager.test/')
    await opener.click()
    await page.getByRole('button', { name: 'Cloudflare 펼치기', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'bindings', exact: true }).isVisible(), false)
    assert.match(await page.getByRole('region', { name: 'Cloudflare', exact: true }).innerText(), /1\/2 사용/)
    await page.getByRole('button', { name: 'Cloudflare 펼치기', exact: true }).click()
    await page.getByRole('button', { name: 'bindings', exact: true }).waitFor()
    assert.match(await page.getByRole('button', { name: 'bindings', exact: true }).innerText(), /로그인 필요/)
    assert.match(await page.getByRole('button', { name: 'builds', exact: true }).innerText(), /연결 오류/)
    for (const text of ['준비됨', '연결 오류']) {
      const colors = await page.getByText(text, { exact: true }).evaluate(el => { const view = el.ownerDocument.defaultView!; return { foreground: view.getComputedStyle(el).color, background: view.getComputedStyle(el.closest('[role=dialog]')!).backgroundColor } })
      assert.ok(contrast(colors.foreground, colors.background) >= 4.5, `${text} has readable contrast in the active theme`)
    }
    if (process.env.MEW_MCP_MANAGER_CAPTURE === '1') await page.screenshot({ path: `/tmp/mew-mcp-manager-review/manager-${width}.png` })
    await page.getByRole('switch', { name: 'Cloudflare 묶음 사용', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
    assert.equal(await page.getByRole('switch', { name: 'Cloudflare 묶음 사용', exact: true }).getAttribute('aria-checked'), 'false')
    assert.equal(await page.getByRole('switch', { name: 'bindings 사용', exact: true }).getAttribute('aria-checked'), 'true')
    assert.equal(await page.getByRole('switch', { name: 'builds 사용', exact: true }).getAttribute('aria-checked'), 'false')
    assert.deepEqual(connectionActions, [], 'usage changes do not revoke authorization')
    await page.getByRole('switch', { name: 'Cloudflare 묶음 사용', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
    assert.equal(mutations.at(-1)?.action, 'usage')
    await page.getByRole('button', { name: 'Cloudflare 묶음 관리', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '묶음 이름 변경', exact: true }).count(), 0, 'suggested groups do not offer unsupported mutations')
    assert.equal(await page.getByRole('button', { name: '묶음 해제', exact: true }).count(), 0)
    await page.getByRole('button', { name: '공통 설정 사용', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
    assert.equal((mutations.at(-1) as { enabled: boolean | null }).enabled, null)
    await back()
    await choose('설정 적용 범위', '모든 프로젝트')
    await page.getByRole('button', { name: '연결 추가', exact: true }).click()
    await page.getByRole('textbox', { name: '연결 이름', exact: true }).fill('new-connection')
    await page.getByRole('textbox', { name: '서버 URL', exact: true }).fill('https://example.com/mcp')
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    await page.getByRole('alertdialog').waitFor()
    await page.getByRole('button', { name: '계속 편집', exact: true }).click()
    assert.equal(await page.getByRole('textbox', { name: '연결 이름', exact: true }).inputValue(), 'new-connection')
    failCreate = true
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '이름이 이미' }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: '연결 이름', exact: true }).inputValue(), 'new-connection')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.getByRole('heading', { name: 'new-connection', exact: true }).waitFor()
    await page.getByRole('region', { name: 'MCP 연결 상태', exact: true }).getByRole('button', { name: '로그인', exact: true }).click()
    await page.getByRole('button', { name: '로그아웃', exact: true }).waitFor()
    assert.deepEqual(JSON.parse((mutations.findLast(value => value.action === 'create-server') as { content: string }).content), { type: 'http', url: 'https://example.com/mcp' })
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '연결 안 됨' }).waitFor()
    assert.deepEqual(connectionActions, ['connect', 'disconnect'])
    await back()
    await page.getByRole('button', { name: '묶음 만들기', exact: true }).click()
    await page.getByRole('textbox', { name: '묶음 이름', exact: true }).fill('Development')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.getByRole('button', { name: 'Development 펼치기', exact: true }).waitFor()
    await page.getByRole('button', { name: 'search', exact: true }).click()
    await choose('묶음', 'Development')
    await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
    assert.equal(inventory.servers.find(server => server.name === 'search')!.groupId, 'group-created')
    await back()
    await page.getByRole('button', { name: 'Development 묶음 관리', exact: true }).click()
    await page.getByRole('button', { name: '묶음 이름 변경', exact: true }).click()
    await page.getByRole('textbox', { name: '묶음 이름', exact: true }).fill('Work')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.getByRole('heading', { name: 'Work', exact: true }).waitFor()
    await page.getByRole('button', { name: '묶음 해제', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '묶음 해제', exact: true }).click()
    await page.getByRole('button', { name: 'search', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Cloudflare API 추가', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: 'bindings', exact: false }).isChecked(), false, 'consolidation does not preselect destructive usage changes')
    assert.equal(await page.getByRole('checkbox', { name: 'bindings', exact: false }).isEnabled(), false, 'dedicated connections stay on until the unified API is ready')
    await page.getByRole('button', { name: '추가 후 연결', exact: true }).click()
    await page.getByRole('heading', { name: 'cloudflare-api', exact: true }).waitFor()
    await page.getByRole('region', { name: 'MCP 연결 상태', exact: true }).getByRole('button', { name: '연결', exact: true }).click()
    await page.getByRole('button', { name: '로그아웃', exact: true }).waitFor()
    await back()
    await page.getByRole('button', { name: 'Cloudflare API 추가', exact: true }).click()
    await page.getByRole('checkbox', { name: 'bindings', exact: false }).check()
    await page.getByRole('button', { name: '선택 적용', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '저장했습니다' }).waitFor()
    assert.deepEqual(mutations.at(-1), { action: 'consolidate-cloudflare', name: 'cloudflare-api', disable: ['bindings'], scope: 'common', cwd: '/project', revision: inventory.revision })
    assert.equal(inventory.servers.some(server => server.name === 'bindings'), true)
    assert.equal(harness.items.some(item => item.id === 'external-cloud'), true)
    assert.equal(nativeScans, 0, 'the managed list never scans native runtime folders')
    await page.getByRole('button', { name: '외부 연결·고급 설정', exact: true }).click()
    assert.equal(await page.getByRole('dialog').count(), 1, 'the source editor replaces the manager rather than nesting dialogs')
    const closeBounds = (await page.getByRole('button', { name: '닫기', exact: true }).boundingBox())!
    assert.ok(closeBounds.x >= 0 && closeBounds.x + closeBounds.width <= width, 'the source view header remains usable on mobile')
    await page.getByRole('button', { name: 'cloudflare-native Claude', exact: true }).click()
    await page.getByRole('button', { name: 'Mew에 가져오기', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Mew 공통으로 가져왔습니다' }).waitFor()
    assert.equal(nativeMutations.at(-1)?.action, 'import')
    assert.equal(harness.items.some(item => item.id === 'external-cloud'), true)
    const listButtons = page.getByRole('button', { name: '목록으로', exact: true })
    await listButtons.first().click()
    await page.getByRole('button', { name: 'Cloudflare 펼치기', exact: true }).waitFor()
    assert.equal(await page.locator('select, datalist').count(), 0)
    assert.equal(await page.getByRole('dialog').getByText(/Bearer|api_key|secret=/i).count(), 0)
    assert.ok(await page.getByRole('dialog').evaluate(el => el.ownerDocument.documentElement.scrollWidth <= el.ownerDocument.defaultView!.innerWidth))
    await page.getByRole('button', { name: '닫기', exact: true }).focus()
    await page.keyboard.press('Shift+Tab')
    assert.ok(await opener.evaluate(el => !!el.ownerDocument.querySelector('[role=dialog]')?.contains(el.ownerDocument.activeElement)))
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.ok(await opener.evaluate(el => el.ownerDocument.activeElement === el))
    inventory.canManage = false
    await opener.click()
    await page.getByRole('button', { name: 'Cloudflare 펼치기', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '연결 추가', exact: true }).isEnabled(), false)
    assert.equal(await page.getByRole('button', { name: '묶음 만들기', exact: true }).isEnabled(), false)
    assert.equal(await page.getByRole('switch', { name: 'search 사용', exact: true }).isEnabled(), true, 'members may set project usage')
    await choose('설정 적용 범위', '모든 프로젝트')
    assert.equal(await page.getByRole('switch', { name: 'search 사용', exact: true }).isEnabled(), false, 'members cannot change shared use')
    await page.getByRole('button', { name: 'search', exact: true }).click()
    await page.getByRole('region', { name: 'MCP 연결 상태', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '로그아웃', exact: true }).count(), 0)
    assert.equal(await page.getByRole('combobox', { name: '묶음', exact: true }).isEnabled(), false)
    await page.getByRole('button', { name: '닫기', exact: true }).click()
    assert.deepEqual(errors, [])
    await page.close()
  }
})
