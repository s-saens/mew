import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('explorer search filters file and document trees with contextual content previews', { skip: !domBrowserExecutable(), timeout: 90_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const workspaceExports = new Map<string, string>()
  for (const name of ['editor', 'ui', 'mobile-keys', 'shortcuts', 'tmux-term']) {
    const directory = path.join(root, 'packages', name)
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    for (const [entry, target] of Object.entries(pkg.exports as Record<string, string>)) {
      workspaceExports.set('@mew/' + name + (entry === '.' ? '' : entry.slice(1)), path.resolve(directory, target))
    }
  }
  const query = '사이드바'
  const contextTexts = ['세 줄 위 문맥', '두 줄 위 문맥', '한 줄 위 문맥', '<script>사이드바</script>', '한 줄 아래 문맥', '두 줄 아래 문맥', '세 줄 아래 문맥']
  const context = contextTexts.map((text, index) => ({
    line: index + 4, text, ...(index === 3 ? { matchStart: text.indexOf(query), matchEnd: text.indexOf(query) + query.length } : {}),
  }))
  const firstMatch = { line: 7, column: 700, text: contextTexts[3], matchStart: 8, matchEnd: 8 + query.length, context }
  const secondText = '다음 사이드바 위치'
  const secondMatch = {
    line: 37, column: 1204, text: secondText, matchStart: 3, matchEnd: 3 + query.length,
    context: Array.from({ length: 7 }, (_, index) => ({ line: index + 34, text: index === 3 ? secondText : '두 번째 매치 주변 문맥 ' + index, ...(index === 3 ? { matchStart: 3, matchEnd: 3 + query.length } : {}) })),
  }
  const paths = ['a1/b1/c1.md', 'a1/b2/c3.md']
  const initialTree = [{
    type: 'dir', name: 'a1', path: 'a1', children: [
      { type: 'dir', name: 'b1', path: 'a1/b1', children: [{ type: 'file', name: 'c1.md', path: paths[0] }] },
      { type: 'dir', name: 'b2', path: 'a1/b2', children: [{ type: 'file', name: 'c3.md', path: paths[1] }] },
      { type: 'file', name: 'b3.md', path: 'a1/b3.md' },
    ],
  }, ...Array.from({ length: 40 }, (_, index) => ({ type: 'file', name: 'unrelated-' + index + '.md', path: 'unrelated-' + index + '.md' }))]
  const source = [
    'import React,{useState} from ' + JSON.stringify(import.meta.resolve('react')) + ';',
    'import {createRoot} from ' + JSON.stringify(import.meta.resolve('react-dom/client')) + ';',
    'import {SearchPanel} from ' + JSON.stringify(path.join(root, 'src/components/SearchPanel.tsx')) + ';',
    'import {TabBar} from ' + JSON.stringify(path.join(root, 'src/components/TabBar.tsx')) + ';',
    'import {FileTree} from ' + JSON.stringify(path.join(root, 'src/components/FileTree.tsx')) + ';',
    'import {I18nProvider} from ' + JSON.stringify(path.join(root, 'src/i18n.tsx')) + ';',
    'import {applyThemePalette,THEME_PRESETS} from ' + JSON.stringify(path.join(root, 'src/utils/theme-color.ts')) + ';',
    'localStorage.setItem("mew:locale","ko");',
    'const params=new URLSearchParams(location.search),initialDocs=params.get("docs")==="1",tree=' + JSON.stringify(initialTree) + ';',
    'applyThemePalette(THEME_PRESETS.find(p=>p.id===params.get("theme")).palette);',
    'const noop=()=>{}, scopes=[];',
    'const readDir=(nodes,path)=>{for(const node of nodes){if(node.path===path)return node.children??[];const found=node.children&&readDir(node.children,path);if(found)return found}return null};',
    'const loadChildren=path=>window.deferPageLoad&&path==="a1"?new Promise(resolve=>{window.resolvePageLoad=resolve;window.pageLoadPending=true}):Promise.resolve(readDir(tree,path)??[]);',
    'function Fixture(){const [mode,setMode]=useState("files"),[docs,setDocs]=useState(initialDocs),[selectedPath,setSelectedPath]=useState(null);window.setDocs=setDocs;return <I18nProvider><main className="h-full bg-surface-deep" style={{width:240,maxWidth:"100vw"}}><SearchPanel focusSignal={0} readOnly project=".workspace" scope={docs?"docs":"root"} scopes={scopes} mode={mode} onModeChange={setMode} onOpenResult={(...args)=>{window.openedResult=args;setSelectedPath(args[0])}} onReplaced={noop} onClose={()=>window.explorerCloseCount=(window.explorerCloseCount??0)+1} registerSearchCancel={fn=>window.cancelSearch=fn}>{search=><FileTree project=".workspace" tree={tree} search={search} loadChildren={loadChildren} documentPages={docs} selectedPath={selectedPath} readOnly newFileSignal={{n:0,parentPath:null}} revealSignal={0} presence={{}} onSelect={path=>{window.openedFile=path;setSelectedPath(path)}} onFileCreated={noop} onFolderCreated={noop} onRenamed={noop} onDeleted={noop} onNotice={noop}/>}</SearchPanel></main></I18nProvider>}',
    'createRoot(document.getElementById("root")).render(<I18nProvider><Fixture/><aside id="reference-tab-bar" style={{position:"fixed",left:260,top:0,width:120}}><TabBar tabs={[]} activePath={null} presence={{}} onActivate={noop} onPin={noop} onClose={noop} onReorder={noop}/></aside></I18nProvider>);',
  ].join('\n')
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    input: 'virtual:search-panel.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, defaultHandler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'search-panel-fixture',
      resolveId(id) { if (id === 'virtual:search-panel.tsx') return id; return workspaceExports.get(id) },
      async load(id) {
        if (id === 'virtual:search-panel.tsx') return source
        if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
        if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(chunk.type === 'chunk')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const docs of [false, true]) {
      for (const { width, theme } of [{ width: 1100, theme: 'midnight' }, { width: 390, theme: 'rose' }]) {
        const page = await browser.newPage({ viewport: { width, height: 640 }, hasTouch: width < 768, isMobile: width < 768 })
        page.setDefaultTimeout(5000)
        const errors: string[] = []
        const requests: URL[] = []
        const delayed = new Map<string, () => Promise<void>>()
        const delayWaiters = new Map<string, () => void>()
        const delayKey = (route: string, query: string, scope = 'root') => [route, query, scope].join('|')
        const waitForDelayed = (key: string) => new Promise<void>(resolve => delayWaiters.set(key, resolve))
        page.on('pageerror', error => errors.push(error.message))
        await page.route('http://mew-search-panel.test/**', route => {
          const url = new URL(route.request().url())
          if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
          if (url.pathname === '/api/search/files') {
            requests.push(url)
            const responseDocs = url.searchParams.get('scopes') === 'docs'
            const q = url.searchParams.get('q')!
            const results = (q === 'c*.md' ? paths : q.startsWith('slow-') ? ['a1/b3.md'] : []).map(path => ({
              path, project: responseDocs ? 'docs' : '.workspace', scope: { id: responseDocs ? 'docs' : 'root', label: responseDocs ? 'Documents' : 'fixture', icon: 'i:folder' },
            }))
            const respond = () => route.fulfill({ json: { state: 'ready', version: 1, results } })
            if (q === 'slow-clear' || q === 'slow-mode') {
              const key = delayKey(url.pathname, q, url.searchParams.get('scopes')!)
              delayed.set(key, respond)
              delayWaiters.get(key)?.()
              return
            }
            return respond()
          }
          if (url.pathname === '/api/search/stream') {
            requests.push(url)
            const responseDocs = url.searchParams.get('scopes') === 'docs'
            const q = url.searchParams.get('q')!
            const stale = q === 'slow-scope' && !responseDocs
            const results = (stale ? ['a1/b3.md'] : paths).map(path => ({ path, matches: path === paths[0] ? [firstMatch, secondMatch] : [firstMatch], project: { id: responseDocs ? 'docs' : '.workspace', label: 'fixture', kind: responseDocs ? 'docs' : 'root' } }))
            const respond = () => route.fulfill({ contentType: 'text/event-stream', body: results.map(result => 'event: result\ndata: ' + JSON.stringify(result) + '\n\n').join('') + 'event: done\ndata: {"truncated":false,"state":"ready"}\n\n' })
            if (stale) {
              const key = delayKey(url.pathname, q, 'root')
              delayed.set(key, respond)
              delayWaiters.get(key)?.()
              return
            }
            return respond()
          }
          if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
          return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><div id="root"></div><script type="module" src="/app.js"></script></html>' })
        })
        try {
          await page.goto('http://mew-search-panel.test/?theme=' + theme + '&docs=' + Number(docs))
          const row = (path: string) => page.locator('button[data-path="' + path + '"]')
          const expansion = (path: string) => docs
            ? page.locator('[data-document-page="' + path + '"] > :first-child button[aria-expanded]').first()
            : row(path)
          const input = page.getByRole('textbox', { name: '파일명 검색', exact: true })
          await input.waitFor()
          const searchBar = page.locator('[data-explorer-search-bar]')
          const referenceBox = (await page.locator('#reference-tab-bar > div').boundingBox())!
          const assertCompactHeader = async () => {
            const box = (await searchBar.boundingBox())!
            const headerBox = (await searchBar.locator('..').boundingBox())!
            assert.equal(box.height, referenceBox.height, 'the search row matches the editor tab bar height')
            assert.equal(headerBox.height, referenceBox.height, 'outer padding does not add height to the search header')
            assert.equal(box.height, 36)
            assert.equal(box.y, (await page.locator('main').boundingBox())!.y, 'the search row aligns with adjacent panel headers')
            const fieldStyle = await searchBar.locator('input').locator('..').evaluate(el => {
              const style = el.ownerDocument.defaultView!.getComputedStyle(el)
              return { borderWidth: style.borderWidth, background: style.backgroundColor, radius: style.borderRadius }
            })
            assert.equal(fieldStyle.borderWidth, '0px', 'the search field has no enclosing border')
            assert.equal(fieldStyle.background, 'rgba(0, 0, 0, 0)', 'the search field uses the panel background')
            assert.equal(fieldStyle.radius, '0px', 'the search field has no rounded container')
            assert.equal(await searchBar.locator('input').getAttribute('placeholder'), null, 'search uses an icon instead of placeholder text in either mode')
            const searchIcon = searchBar.locator('input').locator('..').locator(':scope > svg[aria-hidden="true"]')
            assert.equal(await searchIcon.count(), 1, 'one decorative search icon identifies the input')
            const iconBox = (await searchIcon.boundingBox())!, inputBox = (await searchBar.locator('input').boundingBox())!
            assert.ok(iconBox.width > 0 && iconBox.x + iconBox.width <= inputBox.x, 'the search icon stays before the editable input')
            const bounds = await searchBar.locator('input, button').evaluateAll(elements => elements.map(el => {
              const rect = el.getBoundingClientRect()
              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
            }))
            for (const [index, control] of bounds.entries()) {
              assert.ok(control.width > 0 && control.height >= 24, 'search controls retain usable dimensions')
              assert.ok(control.left >= box.x && control.right <= box.x + box.width && control.top >= box.y && control.bottom <= box.y + box.height, 'controls fit inside the search row')
              if (index) assert.ok(control.left >= bounds[index - 1].right, 'search controls do not overlap')
            }
          }
          await assertCompactHeader()
          await page.keyboard.press('Tab')
          assert.equal(await input.evaluate(el => el === el.ownerDocument.activeElement), true, 'the search input stays first in keyboard order')
          const focusStyle = await input.evaluate(el => {
            const style = el.ownerDocument.defaultView!.getComputedStyle(el)
            return { width: style.outlineWidth, style: style.outlineStyle }
          })
          assert.notEqual(focusStyle.style, 'none', 'keyboard focus remains visible without the field container')
          assert.ok(parseFloat(focusStyle.width) >= 2)
          const closeExplorer = page.getByRole('button', { name: '파일 탐색기 닫기', exact: true })
          assert.equal(await closeExplorer.count(), 1, 'one close button is visible with an empty search')
          const fieldBox = (await input.locator('..').boundingBox())!, closeBox = (await closeExplorer.boundingBox())!, mainBox = (await page.locator('main').boundingBox())!
          assert.ok(closeBox.x >= fieldBox.x + fieldBox.width, 'the X button is to the right of the search field')
          assert.ok(Math.abs(closeBox.y + closeBox.height / 2 - (fieldBox.y + fieldBox.height / 2)) <= 1, 'the X button shares the search row')
          assert.ok(closeBox.x + closeBox.width <= mainBox.x + mainBox.width, 'the X button stays inside the narrow panel')
          await closeExplorer.click()
          assert.equal(await page.evaluate('window.explorerCloseCount'), 1, 'the X button invokes the explorer close action')
          assert.equal(await page.getByRole('textbox').count(), 1, 'one search input serves the explorer')
          assert.equal(await page.getByRole('tab').count(), 0, 'the explorer has no search tabs')
          assert.equal(await expansion('a1').getAttribute('aria-expanded'), 'false')
          const browsingList = page.locator('[data-tree-key=".workspace"] > div[tabindex="-1"]')
          if (!docs && width === 1100) {
            await browsingList.evaluate(el => new Promise<void>(resolve => {
              const view = el.ownerDocument.defaultView!
              el.dispatchEvent(new view.Event('wheel', { bubbles: true }))
              el.scrollTop = 140
              view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
            }))
            assert.equal(await browsingList.evaluate(el => el.scrollTop), 140)
          }
          await input.fill('c*.md')
          await page.locator('[data-search-match="true"]').nth(1).waitFor()
          await assertCompactHeader()
          assert.deepEqual(await page.locator('[data-search-match="true"]').evaluateAll(elements => elements.map(el => el.getAttribute('data-path'))), paths)
          for (const path of ['a1', 'a1/b1', 'a1/b2']) assert.equal(await expansion(path).getAttribute('aria-expanded'), 'true', path + ' is expanded for its matching descendant')
          assert.equal(await row('a1/b3.md').count(), 0, 'siblings that do not match are excluded')
          assert.equal(await row(paths[0]).innerText(), docs ? 'C1' : 'c1.md', 'results retain the current explorer layout')
          assert.equal(await page.locator('[data-document-page="' + paths[0] + '"]').count(), Number(docs))
          assert.equal(requests.at(-1)!.searchParams.get('scopes'), docs ? 'docs' : 'root')
          if (docs && width === 1100) {
            await page.evaluate('window.deferPageLoad=true')
            await row('a1').click()
            await page.waitForFunction('window.pageLoadPending===true')
            await row(paths[0]).click()
            await page.evaluate('window.resolvePageLoad([{type:"file",name:"_a1.md",path:"a1/_a1.md"}]);window.deferPageLoad=false')
            await browsingList.evaluate(el => new Promise<void>(resolve => {
              const view = el.ownerDocument.defaultView!
              view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
            }))
            assert.equal(await page.evaluate('window.openedFile'), paths[0], 'a delayed ancestor representative cannot replace a subsequently opened search match')
          }
          await row(paths[0]).click()
          assert.equal(await page.evaluate('window.openedFile'), paths[0])

          for (const [label, option] of [['대소문자 구분', 'case'], ['정규식 사용', 'regex']]) {
            const request = page.waitForRequest(request => {
              const url = new URL(request.url())
              return url.pathname === '/api/search/files' && url.searchParams.get(option) === '1'
            })
            await page.getByRole('button', { name: label, exact: true }).click()
            await request
            assert.equal(await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true')
          }
          await page.getByRole('button', { name: '검색 지우기', exact: true }).click()
          if (!docs && width === 1100) {
            await page.getByRole('button', { name: '검색 지우기', exact: true }).waitFor({ state: 'detached' })
            assert.equal(await browsingList.evaluate(el => el.scrollTop), 140, 'clearing a short search restores the browsing scroll recorded before DOM truncation')
          }
          await row('a1').waitFor()
          assert.equal(await input.inputValue(), '')
          assert.equal(await expansion('a1').getAttribute('aria-expanded'), 'false', 'clearing restores the original collapsed explorer')
          assert.equal(await row(paths[0]).count(), 0)
          await expansion('a1').click()
          await expansion('a1/b1').click()
          await row(paths[0]).waitFor()
          await input.fill('c*.md')
          await row(paths[1]).waitFor()
          await page.getByRole('button', { name: '검색 지우기', exact: true }).click()
          await row('a1/b3.md').waitFor()
          assert.equal(await expansion('a1/b1').getAttribute('aria-expanded'), 'true', 'a previously browsed folder stays open')
          assert.equal(await expansion('a1/b2').getAttribute('aria-expanded'), 'false', 'temporary search expansion is discarded')

          for (const label of ['대소문자 구분', '정규식 사용']) await page.getByRole('button', { name: label, exact: true }).click()
          await input.fill(query)
          await page.getByRole('button', { name: '파일 내용 검색', exact: true }).click()
          const contentInput = page.getByRole('textbox', { name: '파일 내용 검색', exact: true })
          assert.equal(await contentInput.inputValue(), query, 'the content toggle preserves the query')
          await page.locator('[data-search-match="true"]').nth(1).waitFor()
          await assertCompactHeader()
          assert.equal(await page.getByRole('button', { name: '파일 내용 검색', exact: true }).getAttribute('aria-pressed'), 'true')
          assert.equal(requests.at(-1)!.searchParams.get('scopes'), docs ? 'docs' : 'root')
          assert.equal(await row('a1/b3.md').count(), 0)
          await row(paths[0]).hover()
          const tooltip = page.getByRole('tooltip')
          await tooltip.waitFor()
          const tooltipText = await tooltip.textContent() ?? ''
          for (const text of contextTexts) assert.ok(tooltipText.includes(text), 'the hover preview includes ' + text)
          assert.deepEqual(await tooltip.locator('[data-search-context-line]').evaluateAll(elements => elements.map(el => Number(el.getAttribute('data-search-context-line')))), [4, 5, 6, 7, 8, 9, 10])
          assert.equal(await tooltip.locator('[data-search-context-line="7"] mark').innerText(), query)
          assert.equal(await tooltip.locator('script').count(), 0, 'content previews escape markup')
          assert.deepEqual(await tooltip.locator('mark').allTextContents(), [query])
          const highlight = await tooltip.locator('mark').evaluate(el => {
            const box = el.getBoundingClientRect(), style = el.ownerDocument.defaultView!.getComputedStyle(el)
            return { left: box.left, right: box.right, width: box.width, viewport: el.ownerDocument.defaultView!.innerWidth, background: style.backgroundColor, weight: style.fontWeight }
          })
          assert.ok(highlight.width > 0 && highlight.left >= 0 && highlight.right <= highlight.viewport, 'the Korean match stays visible in the tooltip')
          assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(highlight.background))
          assert.ok(Number(highlight.weight) >= 600)
          if (process.env.MEW_UI_SCREENSHOTS) {
            await fs.mkdir(process.env.MEW_UI_SCREENSHOTS, { recursive: true })
            await page.screenshot({ path: path.join(process.env.MEW_UI_SCREENSHOTS, 'search-tree-' + (docs ? 'documents' : 'files') + '-' + width + '-' + theme + '.png') })
          }
          if (!docs && width === 1100) {
            await row('a1').hover()
            await tooltip.waitFor({ state: 'hidden' })
            await row(paths[0]).hover()
            await tooltip.waitFor()
            await tooltip.getByRole('button', { name: '다음 매치', exact: true }).click()
            await tooltip.locator('[data-search-context-line="37"]').waitFor()
            assert.deepEqual(await tooltip.locator('[data-search-context-line]').evaluateAll(elements => elements.map(el => Number(el.getAttribute('data-search-context-line')))), [34, 35, 36, 37, 38, 39, 40])
            assert.equal(await tooltip.getByRole('button', { name: '다음 매치', exact: true }).isDisabled(), true)
            await tooltip.getByRole('button', { name: '파일 열기', exact: true }).click()
            const secondOpened = await page.evaluate('window.openedResult') as [string, typeof secondMatch]
            assert.equal(secondOpened[0], paths[0])
            assert.equal(secondOpened[1].line, secondMatch.line)
            assert.equal(secondOpened[1].column, secondMatch.column, 'tooltip navigation opens the selected match at its original position')
          }
          await row(paths[0]).click()
          const opened = await page.evaluate('window.openedResult') as [string, typeof firstMatch, string, unknown, string]
          assert.equal(opened[0], paths[0])
          assert.equal(opened[1].line, firstMatch.line)
          assert.equal(opened[1].column, firstMatch.column, 'opening a content match preserves its original document column')
          assert.equal(opened[2], query)
          assert.equal(opened[4], docs ? 'docs' : '.workspace')
          assert.equal(await page.evaluate('window.cancelSearch()'), true)
          await page.getByRole('button', { name: '검색 지우기', exact: true }).waitFor({ state: 'detached' })
          assert.equal(await contentInput.inputValue(), '')
          assert.equal(await page.evaluate('window.cancelSearch()'), false)
          assert.equal(await expansion('a1/b1').getAttribute('aria-expanded'), 'true', 'opening a search result preserves browsed expansion after clearing')
          assert.equal(await expansion('a1/b2').getAttribute('aria-expanded'), 'false')
          if (!docs && width === 1100) {
            const flushFrames = () => page.locator('main').evaluate(el => new Promise<void>(resolve => {
              const view = el.ownerDocument.defaultView!
              view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
            }))
            const matchedPaths = () => page.locator('[data-search-match="true"]').evaluateAll(elements => elements.map(el => el.getAttribute('data-path')))
            const waitForAbort = (pathname: string, query: string) => page.waitForEvent('requestfailed', { predicate: request => {
              const url = new URL(request.url())
              return url.pathname === pathname && url.searchParams.get('q') === query
            } })
            await page.getByRole('button', { name: '파일 내용 검색', exact: true }).click()
            const fileInput = page.getByRole('textbox', { name: '파일명 검색', exact: true })
            await fileInput.fill('debounced')
            await page.getByRole('button', { name: '검색 지우기', exact: true }).click()
            await fileInput.fill('c*.md')
            await page.locator('[data-search-match="true"]').nth(1).waitFor()
            assert.equal(requests.some(url => url.searchParams.get('q') === 'debounced'), false, 'clearing cancels a pending debounce before a later request completes')
            await page.getByRole('button', { name: '검색 지우기', exact: true }).click()

            const clearKey = delayKey('/api/search/files', 'slow-clear')
            const clearHeld = waitForDelayed(clearKey)
            await fileInput.fill('slow-clear')
            await clearHeld
            const clearAborted = waitForAbort('/api/search/files', 'slow-clear')
            await page.getByRole('button', { name: '검색 지우기', exact: true }).click()
            await delayed.get(clearKey)!()
            await clearAborted
            await flushFrames()
            assert.equal(await fileInput.inputValue(), '')
            assert.deepEqual(await matchedPaths(), [], 'a late response cannot restore a cleared search')
            assert.equal(await page.getByRole('status').count(), 0)

            const modeKey = delayKey('/api/search/files', 'slow-mode')
            const modeHeld = waitForDelayed(modeKey)
            await fileInput.fill('slow-mode')
            await modeHeld
            const modeAborted = waitForAbort('/api/search/files', 'slow-mode')
            await page.getByRole('button', { name: '파일 내용 검색', exact: true }).click()
            await page.locator('[data-search-match="true"]').nth(1).waitFor()
            await delayed.get(modeKey)!()
            await modeAborted
            await flushFrames()
            assert.deepEqual(await matchedPaths(), paths, 'a previous filename response cannot overwrite content results after a mode switch')
            assert.equal(await contentInput.inputValue(), 'slow-mode')

            const scopeKey = delayKey('/api/search/stream', 'slow-scope')
            const scopeHeld = waitForDelayed(scopeKey)
            await contentInput.fill('slow-scope')
            await scopeHeld
            const scopeAborted = waitForAbort('/api/search/stream', 'slow-scope')
            const docsRequest = page.waitForRequest(request => {
              const url = new URL(request.url())
              return url.pathname === '/api/search/stream' && url.searchParams.get('q') === 'slow-scope' && url.searchParams.get('scopes') === 'docs'
            })
            await page.evaluate('window.setDocs(true)')
            await docsRequest
            await page.locator('[data-search-match="true"]').nth(1).waitFor()
            await delayed.get(scopeKey)!()
            await scopeAborted
            await flushFrames()
            assert.deepEqual(await matchedPaths(), paths, 'a previous root response cannot overwrite Documents results after a scope switch')
            assert.equal(await page.locator('[data-document-page="' + paths[0] + '"]').count(), 1)
            assert.equal(await row('a1/b3.md').count(), 0)
            await row(paths[0]).click()
            assert.equal((await page.evaluate('window.openedResult') as [string, unknown, string, unknown, string])[4], 'docs')
            await page.getByRole('button', { name: '검색 지우기', exact: true }).click()
            await page.evaluate('window.setDocs(false)')
          }
          assert.deepEqual(errors, [])
        } finally { await page.close() }
      }
    }
  } finally { await browser.close() }
})
