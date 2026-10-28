import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('header dropdowns switch with one click or tap without losing the new menu to history cleanup', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {HeaderMenu} from '${root}/src/components/HeaderMenu.tsx';
import {ProjectSwitcher} from '${root}/src/components/ProjectSwitcher.tsx';
import {CommandButtonMenu} from '${root}/src/components/CommandButtonMenu.tsx';
localStorage.setItem('mew:locale','ko');
function Fixture(){const [outside,setOutside]=useState(0);return <>
 <header className="flex h-9">
 <ProjectSwitcher paths={['/alpha','/beta']} activePath="/alpha" fallbackLabel="alpha" canOpen canChangeIcon={false} icons={{}} onActivate={()=>{}} onIconChange={()=>{}} onOpen={()=>{}}/>
 <CommandButtonMenu project=".workspace" title="명령 목록"/>
 <HeaderMenu items={[{id:'action',label:'헤더 동작',onSelect:()=>{},icon:null}]}/>
 </header><button id="outside" style={{position:'fixed',bottom:20,right:20}} onClick={()=>setOutside(v=>v+1)}>Outside {outside}</button></>}
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const bundle = await build({ input: 'virtual:header-switch.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, plugins: [{
    name: 'fixture',
    resolveId(id) { if (id === 'virtual:header-switch.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:header-switch.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const content = (await Promise.all(['src/components/ProjectSwitcher.tsx', 'src/components/CommandButtonMenu.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390]) for (const dark of [false, true]) for (const gradient of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: width === 390 })
      page.setDefaultTimeout(4000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-header.test/**', route => {
        if (new URL(route.request().url()).pathname === '/api/cmd-buttons') return route.fulfill({ json: { buttons: [{ name: '서버 확인', command: 'echo test', session: 'fixture', running: false, oneShot: false }] } })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko" class="${dark ? 'dark' : ''} ${gradient ? 'theme-gradient' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` })
      })
      await page.goto('http://mew-header.test/')
      const project = page.locator('button[data-project-switcher]')
      const commands = page.getByRole('button', { name: '명령 목록', exact: true })
      const hamburger = page.getByRole('button', { name: '메뉴', exact: true })
      const press = async (button: typeof project) => width === 390 ? button.tap() : button.click()
      const popups = page.locator('[data-header-menu], [data-command-menu]')
      const triggers = [project, commands, project, hamburger, commands, hamburger, project]
      await press(triggers[0])
      for (let index = 1; index < triggers.length; index++) {
        const previous = triggers[index - 1], next = triggers[index]
        assert.equal(await previous.getAttribute('aria-expanded'), 'true')
        await press(next)
        const opened = next === commands ? page.locator('[data-command-menu]') : page.getByRole('menu', { name: next === project ? '프로젝트 선택' : '메뉴', exact: true })
        await opened.waitFor()
        await page.waitForFunction(el => el?.getAttribute('aria-expanded') === 'false', await previous.elementHandle())
        assert.equal(await previous.getAttribute('aria-expanded'), 'false', 'switching closes the previous dropdown')
        assert.equal(await next.getAttribute('aria-expanded'), 'true', 'one click or tap opens the next dropdown')
        assert.equal(await popups.count(), 1)
        assert.equal(await opened.evaluate(el => {
          const active = el.ownerDocument.activeElement
          return el.contains(active) || active?.getAttribute('aria-expanded') === 'true'
        }), true, 'focus belongs to the new dropdown or its trigger')
      }
      await page.goBack()
      await popups.waitFor({ state: 'hidden' })
      assert.equal(await project.getAttribute('aria-expanded'), 'false', 'Back dismisses the switched menu')
      for (const trigger of [project, commands, hamburger]) {
        await press(trigger); await popups.waitFor()
        await press(trigger); await popups.waitFor({ state: 'hidden' })
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'pressing the same trigger closes its menu')
      }
      await press(project); await popups.waitFor()
      await press(page.locator('#outside')); await popups.waitFor({ state: 'hidden' })
      assert.equal(await page.locator('#outside').textContent(), 'Outside 0', 'ordinary outside clicks still only dismiss the menu')
      await press(hamburger); await popups.waitFor()
      await page.keyboard.press('Escape'); await popups.waitFor({ state: 'hidden' })
      assert.equal(await hamburger.evaluate(el => el === el.ownerDocument.activeElement), true, 'Escape restores trigger focus')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
