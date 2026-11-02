import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('DOM browser replays inert pages and relays editing, navigation, scrolling and reconnection', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const component = new URL('./DomBrowserPanel.tsx', import.meta.url).pathname
  const i18n = new URL('../i18n.tsx', import.meta.url).pathname
  const shortcuts = new URL('../utils/app-tab-shortcuts.ts', import.meta.url).pathname
  const react = import.meta.resolve('react'), reactDom = import.meta.resolve('react-dom/client')
  const snapshot = import.meta.resolve('rrweb-snapshot')
  const result = await build({ input: 'virtual:dom-browser.tsx', write: false, logLevel: 'silent', platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
    name: 'isolated-dom-browser',
    resolveId(id) { if (id.startsWith('virtual:')) return id; if (id.endsWith('/remote-transport')) return 'virtual:transport'; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:transport') return 'export function openMewSocket(url){return new window.BrowserSocket(url)}; export const mewFetch=(...args)=>fetch(...args);'
      if (id === 'virtual:dom-browser.tsx') return `
        import React from ${JSON.stringify(react)};
        import {createRoot} from ${JSON.stringify(reactDom)};
        import {snapshot,createMirror} from ${JSON.stringify(snapshot)};
        import {DomBrowserPanel} from ${JSON.stringify(component)};
        import {I18nProvider} from ${JSON.stringify(i18n)};
        import {captureAppTabShortcuts} from ${JSON.stringify(shortcuts)};
        window.packets=[];window.sockets=[];window.closedCount=0;window.generation=1;window.editorCloseCount=0;
        window.BrowserSocket=class {readyState=0;send(value){window.packets.push(JSON.parse(value))}close(){this.readyState=3}constructor(url){this.url=url;window.socket=this;window.sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.(new Event('open'))})}};
        window.deliver=message=>window.socket.onmessage({data:JSON.stringify(message)});
        window.snapshotPage=(generation=window.generation,initialOffset={left:0,top:0})=>{window.generation=generation;const doc=document.getElementById('source').contentDocument;const mirror=createMirror();const freshNode=snapshot(doc,{mirror});const node=window.initialNode||freshNode;window.initialNode=node;window.ids=window.initialIds||Object.fromEntries([...doc.querySelectorAll('[id]')].map(el=>[el.id,mirror.getId(el)]));window.ids.document=mirror.getId(doc);if(!window.initialIds){window.ids.resultText=mirror.getId(doc.querySelector('#result').firstChild);window.initialIds=window.ids;}const timestamp=Date.now()+60_000;window.deliver({type:'events',generation:window.generation,events:[{type:4,timestamp,data:{href:'http://localhost:3333/',width:760,height:480}},{type:2,timestamp:timestamp+1,data:{node,initialOffset}}]});window.deliver({type:'state',generation:window.generation,url:'http://localhost:3333/form',title:'Fixture',loading:false,canGoBack:true,canGoForward:true})};
        function Fixture(){const [open,setOpen]=React.useState(true);const [request,setRequest]=React.useState(0);const [url,setUrl]=React.useState('http://localhost:3333/');React.useEffect(()=>captureAppTabShortcuts({closeEditorTab:()=>window.editorCloseCount++,create:()=>{}}),[]);return <><button onClick={()=>{setOpen(true);setUrl('http://localhost:3333/');setRequest(value=>value+1)}}>Reopen same link</button><button onClick={()=>{setOpen(true);setUrl('');setRequest(value=>value+1)}}>Show port list</button>{open&&<div style={{height:'480px',width:'100%'}}><DomBrowserPanel url={url} navigationRequest={request} onClose={()=>{window.closedCount++;setOpen(false)}}/></div>}</>}
        createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
    },
  }] })
  const scripts = new Map(result.output.filter(chunk => chunk.type === 'chunk').map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const entry = result.output.find(chunk => chunk.type === 'chunk' && chunk.isEntry)!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, locale: 'ko-KR' })
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => { errors.push(error.message); process.stderr.write(`Browser fixture error: ${error.stack}\n`) })
  await page.route('https://dom-browser.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname, script = scripts.get(pathname)
    if (script !== undefined) { await route.fulfill({ contentType: 'text/javascript', body: script }); return }
    if (pathname === '/api/dom-browser/ports') return route.fulfill({ json: { ports: [{ port: 3333, kind: 'app' }, { port: 5000, kind: 'mew' }] } })
    if (pathname === '/source') {
      await route.fulfill({ contentType: 'text/html', body: '<html><head><style>html,#scroller{scroll-behavior:smooth}body{margin:8px;font:16px sans-serif;min-height:1800px}#scroller{height:100px;overflow:auto}#scroller>div{height:900px}</style></head><body><form><input id="name" aria-label="Name"><textarea id="notes" aria-label="Notes"></textarea><input id="check" type="checkbox" aria-label="Checked"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><button id="submit" type="submit">Save</button></form><a id="link" href="http://localhost:3333/other">Other page</a><p id="result">Initial result</p><div id="scroller"><div>Long content</div></div><script>window.top.replayScriptRan=true</script></body></html>' }); return
    }
    await route.fulfill({ contentType: 'text/html', body: `<html><head><style>body{margin:0}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.shrink-0{flex-shrink:0}.min-h-0{min-height:0}.min-w-0{min-width:0}.h-full{height:100%}.w-full{width:100%}.h-9{height:36px}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.overflow-hidden{overflow:hidden}.pointer-events-none{pointer-events:none}form{margin:0}</style></head><body><div id="root"></div><iframe id="source" sandbox="allow-same-origin" src="/source" style="display:none"></iframe><script type="module" src="/${entry.fileName}"></script></body></html>` })
  })
  await page.goto('https://dom-browser.test/')
  await page.waitForFunction('window.packets.some(packet=>packet.type==="navigate")')
  assert.match(await page.evaluate<string>('window.socket.url'), /^wss:\/\/dom-browser\.test\/api\/dom-browser\/ws$/)
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="resize"&&packet.width>0&&packet.height>0)'))
  assert.deepEqual(await page.evaluate('window.packets[0]'), { type: 'color-scheme', colorScheme: 'light' })
  await page.evaluate('window.snapshotPage()')
  const frame = page.frameLocator('[data-dom-browser-surface] iframe')
  await frame.getByRole('textbox', { name: 'Name', exact: true }).waitFor({ timeout: 1000 })
  await page.locator('html').evaluate(element => element.classList.add('dark'))
  await page.waitForFunction('window.packets.findLast(packet=>packet.type==="color-scheme")?.colorScheme==="dark"')
  assert.equal(await page.locator('[data-dom-browser-surface] iframe').evaluate(element => (element as unknown as { style: { colorScheme: string } }).style.colorScheme), 'dark')
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="navigate").length'), 1, 'theme changes do not navigate or reconnect')
  assert.equal(await page.evaluate('window.sockets.length'), 1)
  for (const hostOffset of [60_000, -60_000, 120_000]) {
    const marker = `Live update ${hostOffset}`
    const receivedAt = performance.now()
    await page.evaluate(`window.deliver({type:'events',generation:window.generation,events:[{type:3,timestamp:Date.now()+${hostOffset},data:{source:0,texts:[{id:window.ids.resultText,value:${JSON.stringify(marker)}}],attributes:[],removes:[],adds:[]}}]})`)
    await frame.getByText(marker, { exact: true }).waitFor({ timeout: 500 })
    t.diagnostic(`Host clock offset ${hostOffset} ms: received-to-visible ${Math.round(performance.now() - receivedAt)} ms`)
  }
  assert.equal(await page.locator('[data-dom-browser-surface] iframe').getAttribute('sandbox'), 'allow-same-origin')
  assert.equal(await page.evaluate('Boolean(window.replayScriptRan)'), false)
  await frame.getByRole('textbox', { name: 'Name', exact: true }).click()
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="focus"&&packet.id===window.ids.name)'))
  await frame.getByRole('textbox', { name: 'Name', exact: true }).fill('DOM 한글 input')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="input"&&packet.id===window.ids.name&&packet.value==="DOM 한글 input")'))
  await frame.getByRole('textbox', { name: 'Name', exact: true }).press('Enter')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="key"&&packet.key==="Enter")'))
  await frame.getByRole('textbox', { name: 'Notes', exact: true }).fill('first line\nsecond line')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="input"&&packet.id===window.ids.notes&&packet.value.includes("\\n"))'))
  await frame.getByRole('checkbox', { name: 'Checked', exact: true }).click()
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="click"&&packet.id===window.ids.check)'))
  await frame.getByRole('combobox', { name: 'Choice', exact: true }).selectOption('b')
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="input"&&packet.id===window.ids.choice&&packet.value==="b").length'), 1)
  await page.evaluate(`window.deliver({type:'events',generation:window.generation,events:[{type:3,timestamp:Date.now(),data:{source:5,id:window.ids.choice,text:'a',isChecked:false}}]})`)
  await frame.getByRole('combobox', { name: 'Choice', exact: true }).waitFor()
  await page.waitForFunction('document.querySelector("[data-dom-browser-surface] iframe").contentDocument.querySelector("#choice").value==="a"')
  await frame.getByRole('combobox', { name: 'Choice', exact: true }).selectOption('b')
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="input"&&packet.id===window.ids.choice&&packet.value==="b").length'), 2)
  await frame.getByRole('button', { name: 'Save', exact: true }).click()
  await frame.getByRole('link', { name: 'Other page', exact: true }).click()
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="click"&&packet.id===window.ids.submit)&&window.packets.some(packet=>packet.type==="click"&&packet.id===window.ids.link)'))
  assert.equal(await page.locator('[data-dom-browser-surface] iframe').getAttribute('src'), null)
  const settleScroll = () => page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>setTimeout(()=>requestAnimationFrame(resolve),120)))')
  let scrollMarker = 0
  const hostScroll = async (id: string, y: number, scrollRevision?: number) => {
    const marker = `Scroll replay ${++scrollMarker}`
    await page.evaluate(`window.deliver({type:'events',generation:window.generation,events:[{type:3,timestamp:Date.now(),data:{source:3,id:window.ids[${JSON.stringify(id)}],x:0,y:${y}${scrollRevision === undefined ? '' : `,scrollRevision:${scrollRevision}`}}},{type:3,timestamp:Date.now(),data:{source:0,texts:[{id:window.ids.resultText,value:${JSON.stringify(marker)}}],attributes:[],removes:[],adds:[]}}]})`)
    await frame.getByText(marker, { exact: true }).waitFor()
  }
  const nestedScrollCount = () => page.evaluate<number>('window.packets.filter(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller).length')
  await frame.locator('#scroller').evaluate(element => { element.scrollTo({ top: 110, behavior: 'instant' }) })
  await page.waitForFunction('window.packets.some(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller&&packet.y===110)')
  const firstScroll = await page.evaluate<{ scrollRevision: number }>('window.packets.findLast(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller)')
  assert.ok(Number.isSafeInteger(firstScroll.scrollRevision) && firstScroll.scrollRevision > 0)
  await frame.locator('#scroller').evaluate(element => { element.scrollTo({ top: 400, behavior: 'instant' }) })
  await page.waitForFunction('window.packets.some(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller&&packet.y===400)')
  const latestScroll = await page.evaluate<{ scrollRevision: number }>('window.packets.findLast(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller)')
  assert.ok(latestScroll.scrollRevision > firstScroll.scrollRevision)
  assert.equal(await nestedScrollCount(), 2)
  await hostScroll('scroller', 110, firstScroll.scrollRevision)
  await settleScroll()
  assert.equal(await frame.locator('#scroller').evaluate(element => element.scrollTop), 400)
  assert.equal(await nestedScrollCount(), 2)
  await hostScroll('scroller', 400, latestScroll.scrollRevision)
  await settleScroll()
  assert.equal(await frame.locator('#scroller').evaluate(element => element.scrollTop), 400)
  assert.equal(await nestedScrollCount(), 2)
  await hostScroll('scroller', 250, latestScroll.scrollRevision)
  assert.equal(await frame.locator('#scroller').evaluate(element => element.scrollTop), 250)
  await settleScroll()
  assert.equal(await nestedScrollCount(), 2)
  await frame.locator('#scroller').evaluate(element => { element.scrollTo({ top: 110, behavior: 'instant' }) })
  await page.waitForFunction('window.packets.filter(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller).length===3')
  assert.ok(await page.evaluate<boolean>(`window.packets.findLast(packet=>packet.type==="scroll"&&packet.id===window.ids.scroller).scrollRevision>${latestScroll.scrollRevision}`))
  await hostScroll('document', 220)
  assert.equal(await frame.locator('html').evaluate(element => element.ownerDocument.scrollingElement!.scrollTop), 220)
  await settleScroll()
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="scroll"&&packet.id===window.ids.document).length'), 0)
  assert.equal(await nestedScrollCount(), 3)
  await frame.locator('html').evaluate(element => { element.ownerDocument.defaultView!.scrollTo({ top: 400, behavior: 'instant' }) })
  await page.waitForFunction('window.packets.some(packet=>packet.type==="scroll"&&packet.id===window.ids.document&&packet.y===400)')
  assert.equal(await page.evaluate('window.packets.findLast(packet=>packet.type==="scroll"&&packet.id===window.ids.document).scrollRevision'), 1)
  await hostScroll('document', 220, 0)
  await settleScroll()
  assert.equal(await frame.locator('html').evaluate(element => element.ownerDocument.scrollingElement!.scrollTop), 400)
  assert.equal(await frame.locator('#scroller').evaluate(element => element.scrollTop), 110)
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="scroll"&&packet.id===window.ids.document).length'), 1)
  assert.equal(await nestedScrollCount(), 3)
  await page.evaluate(`window.deliver({type:'events',generation:window.generation,events:[{type:3,timestamp:Date.now(),data:{source:0,texts:[{id:window.ids.resultText,value:'Updated by host'}],attributes:[],removes:[],adds:[]}}]})`)
  await frame.getByText('Updated by host', { exact: true }).waitFor()
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click()
  await page.getByRole('button', { name: '앞으로가기', exact: true }).click()
  await page.evaluate('window.staleInput=document.querySelector("[data-dom-browser-surface] iframe").contentDocument.querySelector("#name");window.oldGeneration=window.generation;window.oldInputId=window.ids.name')
  await page.getByRole('button', { name: '새로고침', exact: true }).click()
  assert.deepEqual(await page.evaluate('window.packets.filter(packet=>["back","forward","reload"].includes(packet.type)).map(packet=>packet.type)'), ['back', 'forward', 'reload'])
  assert.equal(await page.locator('[data-dom-browser-surface]').getAttribute('inert'), '')
  const blockedInputs = await page.evaluate<number>('window.packets.filter(packet=>packet.type==="input").length')
  await page.evaluate(`window.staleInput.value='stale-after-reload';window.staleInput.dispatchEvent(new Event('input',{bubbles:true}));window.deliver({type:'state',generation:window.oldGeneration,url:'http://localhost:3333/stale',title:'Stale',loading:false,canGoBack:true,canGoForward:true});window.deliver({type:'events',generation:window.oldGeneration,events:[{type:3,timestamp:Date.now(),data:{source:0,texts:[{id:window.ids.resultText,value:'Stale stream'}],attributes:[],removes:[],adds:[]}}]})`)
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="input").length'), blockedInputs)
  assert.equal(await page.locator('[data-dom-browser-surface]').getAttribute('inert'), '')
  const scrollsBeforeSnapshot = await page.evaluate<number>('window.packets.filter(packet=>packet.type==="scroll").length')
  await page.evaluate('window.snapshotPage(2,{left:0,top:180})')
  await frame.getByRole('textbox', { name: 'Name', exact: true }).waitFor()
  await page.waitForFunction('!document.querySelector("[data-dom-browser-surface]").inert')
  await settleScroll()
  assert.equal(await frame.locator('html').evaluate(element => element.ownerDocument.scrollingElement!.scrollTop), 180, 'snapshot offsets restore instantly despite smooth CSS')
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="scroll").length'), scrollsBeforeSnapshot, 'snapshot restoration does not relay fresh viewer input')
  assert.equal(await page.evaluate('window.ids.name===window.oldInputId'), true)
  assert.equal(await frame.getByRole('textbox', { name: 'Name', exact: true }).inputValue(), '')
  await page.evaluate("window.staleInput.value='old-document-input';window.staleInput.dispatchEvent(new Event('input',{bubbles:true}))")
  assert.equal(await page.evaluate('window.packets.filter(packet=>packet.type==="input").length'), blockedInputs)
  await frame.getByRole('textbox', { name: 'Name', exact: true }).fill('Fresh generation input')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="input"&&packet.generation===2&&packet.value==="Fresh generation input")'))
  assert.equal(await frame.getByText('Stale stream', { exact: true }).count(), 0)
  await frame.getByRole('textbox', { name: 'Name', exact: true }).press('F5')
  assert.equal(await page.evaluate('window.packets.at(-1).type'), 'reload')
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).fill('localhost:4321/sub?x=1#section')
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).press('Enter')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="navigate"&&packet.url==="http://localhost:4321/sub?x=1#section")'))
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).fill('https://example.org/articles?q=mew#read')
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).press('Enter')
  assert.ok(await page.evaluate<boolean>('window.packets.some(packet=>packet.type==="navigate"&&packet.url==="https://example.org/articles?q=mew#read")'))
  await page.getByRole('button', { name: 'Reopen same link', exact: true }).click()
  await page.waitForFunction('window.packets.findLast(packet=>packet.type==="navigate").url==="http://localhost:3333/"')
  assert.equal(await page.evaluate('window.packets.findLast(packet=>packet.type==="navigate").url'), 'http://localhost:3333/')
  assert.equal(await page.evaluate('window.sockets.length'), 1)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForFunction('window.packets.findLast(packet=>packet.type==="resize").width<=390')
  await page.evaluate('window.socket.readyState=3;window.socket.onclose(new Event("close"))')
  await page.getByRole('alert').getByText('연결이 끊겼습니다. 다시 연결해 주세요.', { exact: true }).waitFor()
  await page.getByRole('button', { name: '다시 연결', exact: true }).first().click()
  await page.waitForFunction('window.sockets.length===2&&window.socket.readyState===1')
  assert.equal(await page.evaluate('window.packets.findLast(packet=>packet.type==="color-scheme").colorScheme'), 'dark')
  assert.equal(await page.locator('[data-dom-browser-surface] iframe').count(), 0)
  await page.evaluate('window.snapshotPage()')
  await frame.getByRole('textbox', { name: 'Name', exact: true }).waitFor()
  await frame.getByRole('textbox', { name: 'Name', exact: true }).press('Control+w')
  assert.equal(await page.evaluate('window.closedCount'), 1)
  assert.equal(await page.evaluate('window.packets.some(packet=>packet.type==="key"&&packet.ctrlKey&&packet.key==="w")'), false)
  assert.equal(await page.evaluate('window.socket.readyState'), 3)
  assert.equal(await page.locator('[data-dom-browser]').count(), 0)
  await page.getByRole('button', { name: 'Reopen same link', exact: true }).click()
  await page.waitForFunction('window.sockets.length===3&&window.socket.readyState===1')
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).press('Control+w')
  assert.equal(await page.evaluate('window.closedCount'), 2)
  assert.equal(await page.evaluate('window.editorCloseCount'), 0)
  assert.equal(await page.evaluate('window.socket.readyState'), 3)
  const socketsBeforeHome = await page.evaluate<number>('window.sockets.length')
  await page.getByRole('button', { name: 'Show port list', exact: true }).click()
  const ports = page.locator('[data-dom-browser-ports]')
  await ports.getByRole('button', { name: 'localhost:3333', exact: true }).waitFor()
  assert.equal(await page.evaluate('window.sockets.length'), socketsBeforeHome, 'listing ports opens no browser socket or Chromium session')
  assert.equal(await ports.getByRole('button', { name: 'localhost:5000 Mew', exact: true }).isDisabled(), true)
  await ports.getByRole('button', { name: 'localhost:3333', exact: true }).click()
  await page.waitForFunction(`window.sockets.length===${socketsBeforeHome + 1}&&window.socket.readyState===1`)
  assert.equal(await page.evaluate('window.packets.findLast(packet=>packet.type==="navigate").url'), 'http://localhost:3333/')
  await page.evaluate('window.snapshotPage()')
  await frame.getByRole('textbox', { name: 'Name', exact: true }).waitFor()
  await page.getByRole('button', { name: '열려 있는 포트', exact: true }).click()
  await ports.getByRole('button', { name: 'localhost:3333', exact: true }).waitFor()
  assert.equal(await page.evaluate('window.socket.readyState'), 3, 'returning to the list disposes of the host browser session')
  await page.getByRole('textbox', { name: '브라우저 주소', exact: true }).press('Control+w')
  assert.equal(await page.evaluate('window.closedCount'), 3)
  assert.deepEqual(errors, [])
})
