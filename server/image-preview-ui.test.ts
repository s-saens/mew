import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import type { Locator } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

async function focused(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => element === element.ownerDocument.activeElement)
}

test('shared media previews animate, preserve modal focus and expose editing only for supported images', { timeout: 90_000 }, async t => {
  const source = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MediaPreviewDialog} from '${root}/packages/ui/src/media-preview-dialog.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette} from '${root}/src/utils/theme-color.ts';
localStorage.setItem('mew:locale','ko');
window.previewEvents={closes:0,edits:0};
window.setTheme=light=>applyThemePalette({background:light?'#ffffff':'#101020',text:light?'#202020':'#eeeeee',primary:light?'#5642c7':'#9082da',gradient:{colors:light?['#eeeeff','#ffeeee']:['#102030','#302040'],angle:135,animated:false}});
const image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="600"%3E%3Crect width="900" height="600" fill="red"/%3E%3C/svg%3E';
function Fixture(){const [preview,setPreview]=useState(null);return <main>
 <button onClick={()=>setPreview({kind:'image',editable:true})}>Editable image</button>
 <button onClick={()=>setPreview({kind:'image',editable:false})}>Read-only image</button>
 <button onClick={()=>setPreview({kind:'video',editable:true})}>Video</button>
 {preview&&<MediaPreviewDialog src={preview.kind==='image'?image:'/sample.mp4'} name="sample" kind={preview.kind} onClose={()=>{window.previewEvents.closes++;setPreview(null)}} onEdit={preview.editable?()=>{window.previewEvents.edits++}:undefined}/>}
 </main>}
window.setTheme(false);
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    input: 'virtual:image-preview.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'image-preview-fixture', resolveId(id) { if (id === 'virtual:image-preview.tsx') return id }, async load(id) {
      if (id === 'virtual:image-preview.tsx') return source
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g) ?? [])]) + styles.join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())

  for (const width of [1100, 390]) for (const light of [false, true]) await t.test(`${width}px ${light ? 'light' : 'dark'}`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390, reducedMotion: 'no-preference', locale: 'ko-KR' })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://mew-image-preview.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
      if (pathname === '/sample.mp4') return route.fulfill({ status: 204, body: '' })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nhtml,body,#root{height:100%;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>` })
    })
    const events = () => page.locator('#root').evaluate(element => (element.ownerDocument.defaultView as unknown as { previewEvents: { closes: number; edits: number } }).previewEvents)
    const dialog = page.getByRole('dialog', { name: 'sample 사진 미리보기', exact: true })
    const opener = page.getByRole('button', { name: 'Editable image', exact: true })
    try {
      await page.goto('https://mew-image-preview.test/')
      await page.evaluate(`window.setTheme(${light})`)
      await opener.click()
      await dialog.waitFor()
      assert.equal(await dialog.getAttribute('aria-modal'), 'true')
      assert.equal(await dialog.evaluate(element => !element.ownerDocument.getElementById('root')!.contains(element)), true, 'the viewer portals outside the app panel')
      const image = dialog.getByRole('img', { name: 'sample', exact: true })
      await image.evaluate(element => (element as unknown as { decode: () => Promise<void> }).decode())
      const imageBounds = await image.boundingBox(); assert.ok(imageBounds)
      assert.ok(imageBounds.x >= 0 && imageBounds.y >= 0 && imageBounds.x + imageBounds.width <= width && imageBounds.y + imageBounds.height <= 844, 'the complete image fits the viewport')
      const enterMotion = await dialog.evaluate(element => {
        const view = element.ownerDocument.defaultView!, elements = [element.parentElement!, element, ...element.querySelectorAll('*')]
        return elements.some(item => {
          const style = view.getComputedStyle(item)
          const transition = style.transitionProperty.split(',').some((property: string) => ['opacity', 'all'].includes(property.trim())) && style.transitionDuration.split(',').some((duration: string) => parseFloat(duration) > 0)
          const animation = item.getAnimations().some((animation: { effect: unknown }) => {
            const effect = animation.effect as { getKeyframes?: () => { opacity?: string | number }[] } | null
            return effect?.getKeyframes?.().some(frame => frame.opacity !== undefined)
          })
          return transition || animation
        })
      })
      assert.equal(enterMotion, true, 'normal motion includes an opacity transition or animation')
      const close = dialog.getByRole('button', { name: '사진 미리보기 닫기', exact: true })
      const edit = dialog.getByRole('button', { name: '사진 편집', exact: true })
      await edit.waitFor()
      await edit.focus()
      for (let index = 0; index < 3; index++) {
        await page.keyboard.press('Tab')
        assert.equal(await dialog.evaluate(element => element.contains(element.ownerDocument.activeElement)), true, 'Tab stays inside the dialog')
      }
      for (let index = 0; index < 3; index++) {
        await page.keyboard.press('Shift+Tab')
        assert.equal(await dialog.evaluate(element => element.contains(element.ownerDocument.activeElement)), true, 'Shift+Tab stays inside the dialog')
      }
      await edit.click()
      assert.equal((await events()).edits, 1)
      assert.equal((await events()).closes, 0, 'editing delegates to the host')
      await close.evaluate(element => (element as unknown as { click: () => void }).click())
      assert.equal((await events()).closes, 0, 'onClose waits for the exit fade')
      assert.equal(await dialog.count(), 1, 'the viewer remains mounted during its exit fade')
      await dialog.waitFor({ state: 'detached' })
      assert.equal((await events()).closes, 1)
      assert.equal(await focused(opener), true, 'closing restores the opener focus')

      const readOnly = page.getByRole('button', { name: 'Read-only image', exact: true })
      await readOnly.click(); await dialog.waitFor()
      assert.equal(await dialog.getByRole('button', { name: '사진 편집', exact: true }).count(), 0, 'images without an edit callback stay view-only')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal((await events()).closes, 2)
      assert.equal(await focused(readOnly), true)

      await readOnly.click(); await dialog.waitFor()
      await page.mouse.click(4, 4)
      await dialog.waitFor({ state: 'detached' })
      assert.equal((await events()).closes, 3, 'the outside backdrop dismisses the viewer once')

      await page.getByRole('button', { name: 'Video', exact: true }).click()
      const videoDialog = page.getByRole('dialog', { name: 'sample 동영상 미리보기', exact: true })
      await videoDialog.waitFor()
      assert.equal(await videoDialog.locator('img').count(), 0)
      assert.equal(await videoDialog.locator('video').getAttribute('controls'), '')
      assert.equal(await videoDialog.locator('video').getAttribute('playsinline'), '')
      assert.equal(await videoDialog.getByRole('button', { name: '사진 편집', exact: true }).count(), 0, 'a video never exposes image editing even with a callback')
      await videoDialog.getByRole('button', { name: '동영상 미리보기 닫기', exact: true }).click()
      await videoDialog.waitFor({ state: 'detached' })
      assert.equal((await events()).closes, 4)

      await page.emulateMedia({ reducedMotion: 'reduce' })
      await opener.click(); await dialog.waitFor()
      const immediate = await dialog.getByRole('button', { name: '사진 미리보기 닫기', exact: true }).evaluate(element => {
        const button = element as unknown as { click: () => void }
        button.click()
        return (element.ownerDocument.defaultView as unknown as { previewEvents: { closes: number } }).previewEvents.closes
      })
      assert.equal(immediate, 5, 'reduced motion dismisses without waiting for a fade')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await focused(opener), true)
      assert.deepEqual(errors, [])
    } finally { await page.close() }
  })
})
