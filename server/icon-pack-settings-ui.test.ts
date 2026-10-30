import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('curated icon settings preview, propagate and persist across themes, viewports and languages', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const source = `import React,{useEffect,useState} from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {createPortal} from '${root}/node_modules/react-dom/index.js';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
import {ThemeSettingsPanel} from '${root}/src/components/theme-settings.tsx';
import {IconPackProvider} from '${root}/src/components/icon-pack-context.tsx';
import {FileTypeIcon} from '${root}/src/components/file-type-icon.tsx';
import {FileTree} from '${root}/src/components/FileTree.tsx';
import {FileBrowserEntry} from '${root}/src/components/file-browser.tsx';
import {applyThemePalette,loadThemeSettings,saveThemeSettings,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
const noop=()=>{},file=name=>({name,path:name,type:'file'});
const tree=[file('note.md'),file('main.ts'),{name:'src',path:'src',type:'dir',children:[file('src/child.ts')]}];
const props={project:'icon-pack-fixture',readOnly:true,selectedPath:null,newFileSignal:{n:0,parentPath:null},revealSignal:0,presence:{},onSelect:noop,onFileCreated:noop,onFolderCreated:noop,onRenamed:noop,onDeleted:noop,onNotice:noop};
function Fixture(){
 const [settings,setSettings]=useState(loadThemeSettings),[expanded,setExpanded]=useState(false);
 const {setLocale}=useI18n();window.setFixtureLocale=setLocale;
 useEffect(()=>{applyThemePalette(settings.palette);saveThemeSettings(settings)},[settings]);
 window.setFixtureTheme=id=>setSettings(value=>({...value,palette:THEME_PRESETS.find(theme=>theme.id===id).palette}));
 return <IconPackProvider value={settings.iconPack}><main className="mx-auto flex max-w-2xl flex-col gap-4 p-3 text-ink">
 <section id="settings"><ThemeSettingsPanel value={settings} onChange={setSettings}/></section>
 <section id="files" style={{height:120}}><FileTree {...props} tree={tree}/></section>
 <section id="server"><FileBrowserEntry entry={{...file('package.json'),path:'/fixture/package.json'}} onClick={noop}/><FileBrowserEntry entry={{name:'src',path:'/fixture/src',type:'dir'}} expanded={expanded} onClick={()=>setExpanded(value=>!value)}/></section>
 </main>{createPortal(<div id="portal-icon" className="mx-auto max-w-2xl px-3"><FileTypeIcon name="main.ts"/></div>,document.getElementById('portal-host'))}</IconPackProvider>;
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:icon-settings.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onwarn(warning, handler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') handler(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'icon-settings-fixture', resolveId(id) { if (id === 'virtual:icon-settings.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      async load(id) { if (id === 'virtual:icon-settings.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const files = ['src/components/theme-settings.tsx', 'src/components/theme-gradient-angle.tsx', 'src/components/icon-pack-settings.tsx', 'src/components/file-type-icon.tsx', 'src/components/file-icon-artwork.tsx', 'src/components/FileTree.tsx', 'src/components/file-browser.tsx', 'packages/ui/src/color-picker.tsx']
  const content = (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 768 })
    page.setDefaultTimeout(5000)
    const errors: string[] = [], requests: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.url().startsWith('http')) requests.push(request.url()) })
    await page.route('http://mew-icon-settings.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><div id="portal-host"></div><script>localStorage.setItem('mew:locale','ko')</script><script src="/app.js"></script></html>` }))
    await page.goto('http://mew-icon-settings.test/')
    const group = page.getByRole('radiogroup', { name: '파일 아이콘', exact: true })
    const material = page.getByRole('radio', { name: 'Material Icon Theme', exact: true })
    const catppuccin = page.getByRole('radio', { name: 'Catppuccin', exact: true })
    const basic = page.getByRole('radio', { name: '기본 아이콘', exact: true })
    const liveIcons = page.locator('#files [data-icon-pack], #server [data-icon-pack], #portal-icon [data-icon-pack]')
    const stored = () => page.evaluate<{ iconPack?: string; custom: unknown[] }>("JSON.parse(localStorage.getItem('mew:themes'))")
    const checkPack = async (pack: 'material' | 'catppuccin' | 'none', theme: string) => {
      await page.waitForFunction(`JSON.parse(localStorage.getItem('mew:themes')).iconPack===${JSON.stringify(pack)}`)
      assert.ok(await liveIcons.count() >= 6)
      assert.ok((await liveIcons.evaluateAll(elements => elements.map(el => el.getAttribute('data-icon-pack')))).every(value => value === pack), 'the selected pack propagates to existing tree, browser and portal icons')
      if (pack === 'none') {
        assert.equal(await page.locator('#files img, #server img, #portal-icon img').count(), 0)
        assert.ok((await liveIcons.locator('svg').count()) >= 6, 'basic icons retain generic vector artwork')
        assert.equal(await page.locator('#settings a').count(), 0)
      } else {
        const icon = pack === 'material' ? 'typescript' : `${theme === 'dark' ? 'mocha' : 'latte'}-typescript`
        await page.locator(`#files [data-path="main.ts"] img[data-file-icon="${icon}"]`).waitFor()
        await page.locator(`#portal-icon img[data-file-icon="${icon}"]`).waitFor()
        const license = page.locator(`#settings a[href="/licenses/${pack === 'material' ? 'material-icon-theme' : 'catppuccin-icons'}.txt"]`)
        assert.equal(await license.count(), 1, 'the selected artwork links to its bundled license')
        assert.equal(await license.getAttribute('target'), '_blank')
        assert.equal(await license.getAttribute('rel'), 'noopener noreferrer')
        assert.equal(await page.locator('#settings a[href^="https://github.com/"]').count(), 1)
      }
      for (const selector of ['#files [data-path="src"]', '#server [title="/fixture/src"]']) {
        const folder = page.locator(selector)
        await folder.click()
        assert.equal(await folder.getAttribute('aria-expanded'), 'true')
        if (pack !== 'none') {
          const opened = pack === 'material' ? 'folder-open' : `${theme === 'dark' ? 'mocha' : 'latte'}-_folder_open`
          await folder.locator(`img[data-file-icon="${opened}"]`).waitFor()
        }
        await folder.click()
        assert.equal(await folder.getAttribute('aria-expanded'), 'false')
      }
      for (const image of await page.locator('img[data-file-icon]:visible').all()) {
        await image.evaluate(async el => { await (el as unknown as { decode(): Promise<void> }).decode() })
        assert.equal(await image.getAttribute('alt'), '')
        assert.equal(await image.getAttribute('draggable'), 'false')
        assert.equal(await image.evaluate(el => el.closest('[aria-hidden="true"]') !== null), true)
        const bounds = await image.boundingBox(); assert.ok(bounds)
        assert.equal(bounds.width, 16); assert.equal(bounds.height, 16)
      }
    }
    await group.waitFor()
    assert.equal(await group.getByRole('radio').count(), 3)
    assert.equal(await material.isChecked(), true, 'existing users keep Material Icon Theme')
    assert.equal(await page.locator('select, datalist').count(), 0)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(`window.setFixtureTheme(${JSON.stringify(theme)})`)
      await page.waitForFunction(`document.documentElement.classList.contains('dark')===${theme === 'dark'}`)
      for (const [radio, pack] of [[catppuccin, 'catppuccin'], [basic, 'none'], [material, 'material']] as const) {
        await radio.check()
        await checkPack(pack, theme)
        assert.equal(await group.getByRole('radio', { checked: true }).count(), 1)
        const row = await radio.evaluate(el => { const bounds = el.closest('label')!.getBoundingClientRect(); return { x: bounds.x, width: bounds.width, height: bounds.height } })
        assert.ok(row.x >= 0 && row.x + row.width <= width)
        assert.ok(row.height >= (width < 768 ? 44 : 32), 'radio rows retain touch targets')
      }
      assert.equal(await page.locator('html').evaluate(el => el.scrollWidth > el.ownerDocument.defaultView!.innerWidth), false, 'settings fit narrow viewports')
      if ((width === 1100 && theme === 'light') || (width === 390 && theme === 'dark')) {
        await catppuccin.check(); await checkPack('catppuccin', theme)
        await page.screenshot({ path: `/tmp/mew-icon-pack-settings-${width}-${theme}.png`, fullPage: true })
      }
    }
    await material.check(); await material.focus(); await material.press('ArrowDown')
    assert.equal(await catppuccin.isChecked(), true, 'arrow keys change the native radio selection')
    assert.equal(await catppuccin.evaluate(el => el.ownerDocument.activeElement === el), true)
    await catppuccin.press('ArrowDown')
    assert.equal(await basic.isChecked(), true)
    await basic.press('ArrowUp')
    assert.equal(await catppuccin.isChecked(), true)
    await checkPack('catppuccin', 'dark')
    await page.reload(); await catppuccin.waitFor()
    assert.equal(await catppuccin.isChecked(), true, 'the selected pack survives reload')
    await checkPack('catppuccin', 'dark')
    await page.getByRole('button', { name: '테마 커스터마이징', exact: true }).click()
    await page.getByRole('button', { name: '배경색', exact: true }).click()
    await page.getByRole('textbox', { name: '배경색 HEX 코드', exact: true }).fill('#141820')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '테마 추가', exact: true }).click()
    assert.equal((await stored()).iconPack, 'catppuccin', 'adding a custom palette preserves the pack')
    await page.getByRole('button', { name: '커스텀 1', exact: true }).click()
    await page.getByRole('button', { name: '테마 저장', exact: true }).click()
    assert.equal((await stored()).iconPack, 'catppuccin', 'saving a custom palette preserves the pack')
    await page.getByRole('button', { name: '커스텀 1', exact: true }).click()
    await page.getByRole('button', { name: '커스텀 테마 삭제', exact: true }).click()
    assert.equal((await stored()).iconPack, 'catppuccin', 'deleting a custom palette preserves the pack')
    assert.equal((await stored()).custom.length, 0)
    for (const [locale, label, basicLabel, sourceLabel, licenseLabel] of [
      ['en', 'File icons', 'Basic icons', 'Source', 'License'],
      ['zh-CN', '文件图标', '基础图标', '来源', '许可证'],
      ['ja', 'ファイルアイコン', '基本アイコン', 'ソース', 'ライセンス'],
      ['ko', '파일 아이콘', '기본 아이콘', '출처', '라이선스'],
    ]) {
      await page.evaluate(`window.setFixtureLocale(${JSON.stringify(locale)})`)
      const localized = page.getByRole('radiogroup', { name: label, exact: true })
      await localized.waitFor()
      assert.equal(await localized.getByRole('radio', { name: basicLabel, exact: true }).count(), 1)
      assert.equal(await page.getByRole('link', { name: sourceLabel, exact: true }).count(), 1)
      assert.equal(await page.getByRole('link', { name: licenseLabel, exact: true }).count(), 1)
    }
    assert.deepEqual(errors, [])
    assert.ok(requests.every(url => url.startsWith('http://mew-icon-settings.test/')), 'bundled icons do not request an external registry or CDN')
    await page.close()
  }
})
