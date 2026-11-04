import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `import React,{act} from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {ProjectAddInline} from ${JSON.stringify(new URL('./project-add-inline.tsx', import.meta.url).pathname)};
import {I18nProvider} from ${JSON.stringify(new URL('../i18n.tsx', import.meta.url).pathname)};
window.IS_REACT_ACT_ENVIRONMENT=true;
const root=createRoot(document.getElementById('root'));
let generation=0, resolvePending;
const project=(path,name=path.split('/').at(-1))=>({path,name,managed:false,mine:false,icon:null});
window.fixture={calls:[], failOpen:false, registryError:false, pendingPin:false, repositoriesError:false,
  projects:[project('/workspace/shared','Shared'),project('/other/shared','Shared'),project('/mine','Mine')],
  settle:()=>act(async()=>{}),
  mount:props=>act(async()=>{generation++;root.render(<I18nProvider><ProjectAddInline key={generation} basePath="/external" canManageFolders={false} {...props}
    beforeMutation={()=>window.fixture.calls.push(['before'])}
    onProjectsChanged={()=>window.fixture.calls.push(['changed'])}
    onCreateWithAgent={project=>window.fixture.calls.push(['agent',project.path])}
    onOpen={path=>{window.fixture.calls.push(['open',path]);return !window.fixture.failOpen;}}/></I18nProvider>);}),
  click:selector=>act(async()=>{const button=document.querySelector(selector);if(!button)throw new Error('Missing '+selector);button.click();}),
  input:(selector,value)=>act(async()=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}),
  submit:()=>act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))),
  key:key=>act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))),
  back:()=>act(async()=>{window.dispatchEvent(new PopStateEvent('popstate'));await Promise.resolve();}),
  finish:()=>act(async()=>resolvePending()),
  destroy:()=>act(async()=>root.unmount()),
};
window.fetch=async(input,init={})=>{
  const url=new URL(String(input),location.origin), method=init.method||'GET';
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  if(url.pathname==='/api/project-registry'&&method==='GET'){
    window.fixture.calls.push(['catalog']);
    return window.fixture.registryError?json({error:'Catalog unavailable'},500):json({projects:window.fixture.projects});
  }
  if(url.pathname==='/api/project-registry/mine'){
    const body=JSON.parse(init.body);window.fixture.calls.push(['pin',body.path]);
    if(window.fixture.pendingPin)await new Promise(resolve=>{resolvePending=resolve;});
    return json({ok:true});
  }
  if(url.pathname==='/api/project-registry/repositories'){
    window.fixture.calls.push(['repositories']);
    return window.fixture.repositoriesError?json({error:'Repositories unavailable'},500):json({connected:true,repositories:[{name:'Repo',fullName:'example/repo',url:'https://example.test/repo.git',private:true}]});
  }
  if(url.pathname==='/api/project-registry'&&method==='POST'){
    const body=JSON.parse(init.body);window.fixture.calls.push(['register',body]);
    return json({project:project(body.path||'/managed/'+(body.name||'repo'))});
  }
  if(url.pathname==='/api/git-connections/github')return json({available:true,login:null,environmentToken:false,busy:false,job:null});
  if(url.pathname==='/api/fs/dirs')return json({path:'/external',parent:'/',dirs:[]});
  throw new Error('Unexpected fixture request '+method+' '+url.pathname);
};`

const bundle = await build({
  input: 'virtual:project-add.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
  onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{ name: 'project-add-fixture', resolveId(id) {
    if (id === 'virtual:project-add.tsx') return id
    if (id.endsWith('.css')) return 'virtual:style'
  }, async load(id) {
    if (id === 'virtual:project-add.tsx') return source
    if (id === 'virtual:style') return ''
    if (id.endsWith('?raw')) return `export default ${JSON.stringify(await readFile(id.slice(0, -4), 'utf8'))}`
  } }],
})
const chunk = bundle.output.find(item => item.type === 'chunk')!

interface Fixture {
  calls: [string, ...unknown[]][]
  failOpen: boolean
  registryError: boolean
  pendingPin: boolean
  repositoriesError: boolean
  mount(props?: { onboarding?: boolean; paths?: string[]; canUseAgent?: boolean }): Promise<void>
  click(selector: string): Promise<void>
  input(selector: string, value: string): Promise<void>
  submit(): Promise<void>
  key(key: string): Promise<void>
  back(): Promise<void>
  finish(): Promise<void>
  settle(): Promise<void>
  destroy(): Promise<void>
}
function mount() {
  const win = new Window({ url: 'https://project-add.test', width: 1100, console,
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.console.timeStamp = () => {}
  Object.assign(win, { MessageChannel: class {
    port1 = { onmessage: null as (() => void) | null }
    port2 = { postMessage: () => { setTimeout(() => this.port1.onmessage?.(), 0) } }
  } })
  win.localStorage.setItem('mew:locale', 'ko')
  win.document.body.innerHTML = '<div id="root"></div>'
  win.eval(chunk.code)
  const fixture = (win as unknown as { fixture: Fixture }).fixture
  const step = () => win.document.querySelector('[data-project-add-step]')?.getAttribute('data-project-add-step')
  const choices = () => [...win.document.querySelectorAll('[data-project-add-choice]')].map(element => element.getAttribute('data-project-add-choice'))
  const choose = (name: string) => fixture.click(`[data-project-add-choice="${name}"]`)
  return { win, fixture, step, choices, choose, close: async () => { await fixture.destroy(); await win.happyDOM.close() } }
}

test('empty onboarding offers three actions, workspace import and path browsing back one level at a time', async () => {
  const view = mount()
  try {
    await view.fixture.mount({ onboarding: true })
    assert.equal(view.step(), 'choices')
    assert.equal(view.win.document.querySelector('h2')?.textContent, '프로젝트를 추가하세요')
    assert.deepEqual(view.choices(), ['create', 'clone', 'import'])
    assert.deepEqual([...view.win.document.querySelectorAll('[data-project-add-choice]')].map(element => element.textContent), ['새 프로젝트 만들기', 'Git repo 클론하기', '프로젝트 가져오기'])
    assert.equal(view.fixture.calls.length, 0, 'reading the empty onboarding does not query or import projects')
    await view.choose('import')
    assert.deepEqual(view.choices(), ['workspace', 'browse'])
    await view.choose('workspace')
    assert.equal(view.step(), 'workspace')
    assert.equal(view.win.document.querySelectorAll('[data-catalog-project]').length, 3)
    assert.equal(view.fixture.calls.filter(call => call[0] === 'pin').length, 0, 'browsing does not add a personal project')
    assert.equal(view.win.document.querySelector('.mew-project-catalog-toggle'), null)
    await view.fixture.click('[data-project-add-back]')
    assert.equal(view.step(), 'import')
    assert.equal(view.win.document.activeElement?.getAttribute('data-project-add-choice'), 'workspace')
    await view.choose('browse')
    assert.ok(view.win.document.querySelector('[role="dialog"]'), 'external browsing uses the established folder dialog')
    await view.fixture.key('Escape')
    assert.equal(view.win.document.querySelector('[role="dialog"]'), null)
    assert.equal(view.step(), 'import')
    assert.equal(view.win.document.activeElement?.getAttribute('data-project-add-choice'), 'browse')
    await view.fixture.key('Escape')
    assert.equal(view.step(), 'choices')
    assert.equal(view.win.document.activeElement?.getAttribute('data-project-add-choice'), 'import')
    await view.fixture.key('Escape')
    assert.equal(view.step(), 'closed')
    assert.equal(view.win.document.activeElement?.getAttribute('aria-label'), '프로젝트 추가')
    await view.fixture.click('button[aria-label="프로젝트 추가"]')
    assert.deepEqual(view.choices(), ['create', 'clone', 'import'])
  } finally { await view.close() }
})

test('workspace import disambiguates names, filters paths and pins before refreshing and opening', async () => {
  const view = mount()
  try {
    await view.fixture.mount({ onboarding: true, paths: ['/mine'] })
    await view.choose('import'); await view.choose('workspace')
    assert.ok(view.win.document.querySelector('[data-catalog-project="/workspace/shared"]')?.textContent.includes('/workspace/shared'))
    await view.fixture.input('.mew-project-catalog-search input', '/workspace/')
    assert.equal(view.win.document.querySelectorAll('[data-catalog-project]').length, 1)
    await view.fixture.click('[data-catalog-project="/workspace/shared"] button')
    assert.deepEqual(Array.from(view.fixture.calls, call => Array.from(call)), [['catalog'], ['before'], ['pin', '/workspace/shared'], ['changed'], ['open', '/workspace/shared']])
    assert.equal(view.step(), 'closed')
  } finally { await view.close() }
})

test('failed opening retries an imported project without pinning twice and existing personal projects remain available', async () => {
  const view = mount()
  try {
    view.fixture.failOpen = true
    await view.fixture.mount({ onboarding: true, paths: ['/mine'] })
    await view.choose('import'); await view.choose('workspace')
    await view.fixture.click('[data-catalog-project="/workspace/shared"] button')
    assert.match(view.win.document.querySelector('[role="alert"]')?.textContent ?? '', /프로젝트를 열지 못했습니다/)
    assert.equal(view.step(), 'workspace')
    view.fixture.failOpen = false
    await view.fixture.click('[data-catalog-project="/workspace/shared"] button')
    assert.equal(view.fixture.calls.filter(call => call[0] === 'pin').length, 1)
    assert.equal(view.fixture.calls.filter(call => call[0] === 'open').length, 2)
    await view.fixture.mount({ onboarding: true, paths: ['/mine'] })
    await view.choose('import'); await view.choose('workspace')
    await view.fixture.click('[data-catalog-project="/mine"] button')
    assert.equal(view.fixture.calls.filter(call => call[0] === 'pin').length, 1, 'an existing personal project is not pinned again')
    assert.equal(view.fixture.calls.at(-1)?.[1], '/mine')
  } finally { await view.close() }
})

test('busy workspace imports block duplicate actions, X, Escape and browser Back', async () => {
  const view = mount()
  try {
    view.fixture.pendingPin = true
    await view.fixture.mount({ onboarding: true })
    await view.choose('import'); await view.choose('workspace')
    await view.fixture.click('[data-catalog-project="/workspace/shared"] button')
    assert.equal(view.win.document.querySelector('[data-project-add-back]')?.getAttribute('disabled'), '')
    await view.fixture.click('[data-catalog-project="/workspace/shared"] button')
    await view.fixture.click('[data-project-add-back]')
    await view.fixture.key('Escape')
    await view.fixture.back()
    assert.equal(view.step(), 'workspace')
    assert.equal(view.fixture.calls.filter(call => call[0] === 'pin').length, 1)
    await view.fixture.finish()
    assert.equal(view.step(), 'closed')
  } finally { await view.close() }
})

test('catalog load errors recover inline and unmatched searches show the existing empty state', async () => {
  const view = mount()
  try {
    view.fixture.registryError = true
    await view.fixture.mount({ onboarding: true })
    await view.choose('import'); await view.choose('workspace')
    assert.match(view.win.document.querySelector('[role="alert"]')?.textContent ?? '', /Catalog unavailable/)
    view.fixture.registryError = false
    await view.fixture.click('button[aria-label="다시 시도"]')
    assert.equal(view.win.document.querySelectorAll('[data-catalog-project]').length, 3)
    await view.fixture.input('.mew-project-catalog-search input', 'does-not-exist')
    assert.equal(view.win.document.querySelectorAll('[data-catalog-project]').length, 0)
    assert.ok(view.win.document.querySelector('.mew-project-catalog-list p')?.textContent)
    await view.fixture.back()
    assert.equal(view.step(), 'import', 'browser Back returns to import sources')
  } finally { await view.close() }
})

test('creation retains validation and retries the created project without a duplicate registration', async () => {
  const view = mount()
  try {
    view.fixture.failOpen = true
    await view.fixture.mount({ onboarding: true })
    await view.choose('create')
    await view.fixture.input('input', '../invalid')
    await view.fixture.submit()
    assert.equal(view.fixture.calls.filter(call => call[0] === 'register').length, 0)
    await view.fixture.input('input', 'New project')
    await view.fixture.submit()
    assert.equal(view.fixture.calls.filter(call => call[0] === 'register').length, 1)
    assert.match(view.win.document.querySelector('[role="alert"]')?.textContent ?? '', /프로젝트를 열지 못했습니다/)
    await view.fixture.click('[data-project-add-back]')
    assert.equal(view.step(), 'choices')
    assert.equal(view.win.document.querySelector('[data-project-add-choice="clone"]')?.getAttribute('disabled'), '')
    await view.choose('create')
    view.fixture.failOpen = false
    await view.fixture.submit()
    assert.equal(view.fixture.calls.filter(call => call[0] === 'register').length, 1)
    assert.equal(view.step(), 'closed')
  } finally { await view.close() }
})

test('external folder import retains the registered project when opening fails and retries without registering twice', async () => {
  const view = mount()
  try {
    view.fixture.failOpen = true
    await view.fixture.mount({ onboarding: true })
    await view.choose('import'); await view.choose('browse')
    await view.fixture.click('[role="dialog"] footer button')
    assert.equal(view.fixture.calls.filter(call => call[0] === 'register').length, 1)
    assert.match(view.win.document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? '', /프로젝트를 열지 못했습니다/)
    view.fixture.failOpen = false
    await view.fixture.click('[role="dialog"] footer button')
    assert.equal(view.fixture.calls.filter(call => call[0] === 'register').length, 1)
    assert.equal(view.fixture.calls.filter(call => call[0] === 'open').length, 2)
    assert.equal(view.win.document.querySelector('[role="dialog"]'), null)
    assert.equal(view.step(), 'closed')
  } finally { await view.close() }
})

test('clone keeps provider repositories, retry and private status and can open a selected repository', async () => {
  const view = mount()
  try {
    view.fixture.repositoriesError = true
    await view.fixture.mount({ onboarding: true })
    await view.choose('clone')
    assert.match(view.win.document.querySelector('[role="alert"]')?.textContent ?? '', /Repositories unavailable/)
    view.fixture.repositoriesError = false
    await view.fixture.click('button[aria-label="다시 시도"]')
    assert.ok(view.win.document.querySelector('[aria-label="비공개 저장소"]'))
    await view.fixture.click('[role="group"] button')
    const registered = view.fixture.calls.find(call => call[0] === 'register')
    assert.equal((registered?.[1] as { url: string })?.url, 'https://example.test/repo.git')
    assert.equal(view.step(), 'closed')
  } finally { await view.close() }
})
