import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import type { Locator } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

async function scrollFromBottom(scroll: Locator, distance: number) {
  await scroll.evaluate((el, offset) => {
    el.scrollTop = el.scrollHeight - el.clientHeight - offset
    el.dispatchEvent(new el.ownerDocument.defaultView!.Event('scroll'))
  }, distance)
}

async function assertFade(button: Locator) {
  const opacity = await button.evaluate(async el => {
    const view = el.ownerDocument.defaultView!
    for (let frame = 0; frame < 10; frame++) {
      const animation = el.getAnimations()[0]
      if (animation) {
        animation.pause()
        animation.currentTime = 75
        const sample = Number(view.getComputedStyle(el).opacity)
        animation.finish()
        return sample
      }
      await new Promise(resolve => view.requestAnimationFrame(resolve))
    }
    return null
  })
  assert.ok(opacity !== null && opacity > 0 && opacity < 1, `opacity animates through an intermediate value: ${opacity}`)
}

test('agent bottom button fades at 30px and stays above sticky answer controls', { timeout: 60_000 }, async t => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AgentPanel} from '${root}/src/components/AgentPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
localStorage.setItem('mew:locale','ko');
window.setTheme=id=>applyThemePalette(THEME_PRESETS.find(theme=>theme.id===id).palette);
window.setTheme('midnight');
const events=[];
for(let i=0;i<12;i++)events.push(
  {type:'update',update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'Question '+i}}},
  {type:'turn_start'},
  {type:'update',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:i===11?'Final answer\\n\\n'+'Long answer paragraph.\\n\\n'.repeat(100):'Answer '+i}}},
  {type:'turn_end',stopReason:'end_turn'});
class Socket {
  static OPEN=1;readyState=1;
  constructor(){window.socket=this;setTimeout(()=>{this.onopen?.();
    this.emit({type:'replay',restored:true,events});
    this.emit({type:'meta',meta:{sessionId:'scroll-test',startedAt:new Date().toISOString(),turns:12,busy:false,queued:[],usage:null,canLoad:false,canList:false}});
  },20)}
  emit(event){this.onmessage?.({data:JSON.stringify(event)})}
  send(){}
  close(){}
}
window.WebSocket=Socket;
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100vh',display:'flex'}}>
  <AgentPanel project="test" workspacePath="/workspace" tree={[]} focusedFilePath={null} onOpenFile={()=>{}} onClose={()=>{}} />
  <div data-popup-reference className="mew-overlay-surface fixed left-0 top-0 bg-surface-raised" />
</div></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:agent-scroll.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{
      name: 'agent-scroll-fixture',
      async resolveId(id, importer) {
        if (id === 'virtual:agent-scroll.tsx') return id
        if (id === '@mew/tmux-term') return 'virtual:terminal'
        if (id.endsWith('.css')) return 'virtual:style'
        if (id.endsWith('?raw')) {
          const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true })
          if (resolved) return `${resolved.id}?raw`
        }
      },
      async load(id) {
        if (id === 'virtual:agent-scroll.tsx') return source
        if (id === 'virtual:terminal') return 'export const isHiddenTmuxSession=()=>false;export function TmuxTerminal(){return null}'
        if (id === 'virtual:style') return ''
        if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}`
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const content = await fs.readFile(`${root}/src/components/AgentPanel.tsx`, 'utf8')
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390]) await t.test(`${width}px`, async matrix => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    matrix.after(() => page.close())
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-agent-scroll.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/api/user-ui/agent-tabs') return route.fulfill({ json: { state: { tabs: [{ id: 'scroll', label: 'Codex', runtime: 'codex', cwd: '/workspace' }], activeId: 'scroll' }, claims: [] } })
      if (pathname === '/api/agent-cwd') return route.fulfill({ json: { cwd: '/workspace' } })
      if (pathname === '/api/projects') return route.fulfill({ json: [] })
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { settings: null, skills: [], jobs: [], commands: [], runtimes: [] } })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-agent-scroll.test/')
    const conversation = page.locator('[data-agent-conversation]')
    const scroll = conversation.locator(':scope > div').first()
    const button = page.locator('[data-agent-scroll-to-bottom]')
    const visibleButton = page.getByRole('button', { name: '에이전트 맨 아래로', exact: true })
    const header = page.locator('[data-agent-turn-header]').last()
    await page.getByText('Question 11', { exact: true }).waitFor()
    await header.locator('button[aria-expanded]').click()
    await conversation.locator('[data-agent-turn-footer]').waitFor()
    await scrollFromBottom(scroll, 0)
    assert.equal(await button.getAttribute('aria-hidden'), 'true')
    assert.equal(await visibleButton.count(), 0, 'hidden button leaves the accessibility tree')

    await scrollFromBottom(scroll, 120)
    await visibleButton.waitFor()
    await assertFade(button)
    const layers = await button.evaluate(el => {
      const box = el.getBoundingClientRect()
      const stack = el.ownerDocument.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return {
        buttonOnTop: stack[0] === el || el.contains(stack[0]),
        footerBelow: stack.some((node: typeof el) => node.hasAttribute('data-agent-turn-footer') || node.closest('[data-agent-turn-footer]')),
        outsideScroll: el.closest('[data-agent-conversation]')!.firstElementChild!.contains(el),
      }
    })
    assert.equal(layers.buttonOnTop, true, 'button receives clicks above the sticky footer')
    assert.equal(layers.footerBelow, true, 'fixture reproduces the overlap with collapse controls')
    assert.equal(layers.outsideScroll, false, 'button is anchored to the conversation viewport')

    for (const theme of ['midnight', 'rose', 'dark', 'light']) {
      await page.evaluate(`window.setTheme(${JSON.stringify(theme)})`)
      const surface = await button.evaluate(el => {
        const view = el.ownerDocument.defaultView!
        const style = view.getComputedStyle(el)
        const popup = view.getComputedStyle(el.ownerDocument.querySelector('[data-popup-reference]')!)
        return { background: style.backgroundColor, popupBackground: popup.backgroundColor, blur: style.backdropFilter, popupBlur: popup.backdropFilter, arrow: view.getComputedStyle(el.querySelector('svg')!).stroke }
      })
      assert.equal(surface.background, surface.popupBackground, `${theme}: matches popup background`)
      assert.equal(surface.blur, surface.popupBlur, `${theme}: matches popup blur`)
      assert.equal(surface.blur, theme === 'dark' ? 'none' : 'blur(6px)')
      assert.equal(surface.arrow, 'rgb(255, 255, 255)', `${theme}: arrow stays white`)
    }
    await page.evaluate("window.setTheme('midnight')")
    await conversation.screenshot({ path: `/tmp/mew-agent-scroll-${width}.png` })

    await scrollFromBottom(scroll, 31)
    assert.equal(await button.getAttribute('aria-hidden'), 'false', '31px remains visible independently of the follow threshold')
    await scrollFromBottom(scroll, 30)
    await assertFade(button)
    assert.equal(await button.getAttribute('aria-hidden'), 'true', '30px hides the button')
    assert.equal(await button.getAttribute('tabindex'), '-1')
    assert.equal(await button.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).pointerEvents), 'none')
    await scrollFromBottom(scroll, 29)
    assert.equal(await visibleButton.count(), 0)
    await scrollFromBottom(scroll, 31)
    await assertFade(button)
    await visibleButton.click()
    assert.equal(await scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight), 0, 'click reaches the bottom')
    assert.equal(await button.getAttribute('aria-hidden'), 'true')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await scrollFromBottom(scroll, 120)
    await visibleButton.waitFor()
    assert.equal(await button.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).transitionProperty), 'none')
    assert.equal(await button.evaluate(el => el.getAnimations().length), 0)
    await visibleButton.click()
    assert.equal(await button.getAttribute('aria-hidden'), 'true')
    assert.deepEqual(errors, [])
  })
})
