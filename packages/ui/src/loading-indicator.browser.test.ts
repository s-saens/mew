import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const sizes = [12, 14, 16, 28, 36]

test('shared loading indicators preserve their geometry, inexpensive motion and accessible alternatives', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {LoadingIndicator} from '${root}/packages/ui/src/loading-indicator.tsx';
createRoot(document.getElementById('react')).render(React.createElement(React.Fragment,null,
  ...${JSON.stringify(sizes)}.map(size=>React.createElement(LoadingIndicator,{key:size,size,className:'size-'+size})),
  React.createElement(LoadingIndicator,{active:false,className:'inactive'})
));`
  const bundle = await build({
    input: 'virtual:loading-indicator.ts', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'loading-indicator-fixture',
      resolveId(id) {
        if (id === 'virtual:loading-indicator.ts') return id
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:loading-indicator.ts') return source
        if (id === 'virtual:style') return ''
      },
    }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const css = await fs.readFile(new URL('./loading-indicator.css', import.meta.url), 'utf8')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' })
  await page.setContent(`<!doctype html><style>${css}</style>
    <div id="react" style="color:#7a65db"></div>
    <div id="mewlink"><span class="mew-loading-indicator" aria-hidden="true"></span></div>`)
  await page.addScriptTag({ content: code })
  await page.locator('.size-36').waitFor()

  for (const size of sizes) {
    const snapshot = await page.locator(`.size-${size}`).evaluate(el => {
      const view = el.ownerDocument.defaultView!
      const style = view.getComputedStyle(el)
      const outer = view.getComputedStyle(el, '::before')
      const inner = view.getComputedStyle(el, '::after')
      return {
        tag: el.tagName, children: el.childElementCount, hidden: el.getAttribute('aria-hidden'),
        width: parseFloat(style.width), height: parseFloat(style.height), color: style.color,
        core: style.backgroundImage, outer: outer.backgroundImage, inner: inner.backgroundImage,
        outerWidth: parseFloat(outer.width), innerWidth: parseFloat(inner.width),
        outerMask: outer.maskImage, innerMask: inner.maskImage,
        generated: [outer.content, inner.content],
      }
    })
    assert.equal(snapshot.tag, 'SPAN')
    assert.equal(snapshot.children, 0, 'React and plain HTML share one empty decorative element')
    assert.equal(snapshot.hidden, 'true')
    assert.equal(snapshot.width, size)
    assert.equal(snapshot.height, size)
    assert.equal(snapshot.color, 'rgb(122, 101, 219)', 'the indicator inherits its surrounding color')
    assert.deepEqual(snapshot.generated, ['""', '""'])
    assert.match(snapshot.core, /radial-gradient/)
    assert.match(snapshot.outer, /conic-gradient/)
    assert.match(snapshot.inner, /conic-gradient/)
    assert.match(snapshot.outerMask, /radial-gradient/)
    assert.match(snapshot.innerMask, /radial-gradient/)
    assert.equal(snapshot.outerWidth, size)
    assert.ok(snapshot.innerWidth > 0 && snapshot.innerWidth < size, `${size}px keeps a distinct inner orbit`)
  }

  const indicator = page.locator('.size-16')
  const motion = await indicator.evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return {
      states: [view.getComputedStyle(el).animationPlayState, view.getComputedStyle(el, '::after').animationPlayState],
      effects: el.getAnimations({ subtree: true }).map(animation => {
        const effect = animation.effect
        if (!(effect instanceof view.KeyframeEffect)) throw new Error('Expected a CSS keyframe animation')
        return { keyframes: effect.getKeyframes().map(frame => Object.keys(frame)), iterations: effect.getTiming().iterations }
      }),
      filters: [null, '::before', '::after'].map(pseudo => {
        const style = view.getComputedStyle(el, pseudo)
        return [style.filter, style.backdropFilter, style.boxShadow]
      }),
    }
  })
  assert.deepEqual(motion.states, ['running', 'running'])
  assert.ok(motion.effects.length >= 2, 'the two orbits animate independently')
  const allowedKeys = new Set(['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'])
  for (const effect of motion.effects) {
    assert.equal(effect.iterations, Infinity)
    for (const frame of effect.keyframes) for (const property of frame) {
      assert.ok(allowedKeys.has(property), `${property} is not an allowed animated property`)
    }
  }
  assert.deepEqual(motion.filters, Array.from({ length: 3 }, () => ['none', 'none', 'none']))

  const playStates = (selector: string) => page.locator(selector).evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return [view.getComputedStyle(el).animationPlayState, view.getComputedStyle(el, '::after').animationPlayState]
  })
  assert.deepEqual(await playStates('.inactive'), ['paused', 'paused'], 'active=false pauses both orbit animations')
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['running', 'running'], 'plain HTML needs no React state attribute')
  await page.locator('#mewlink').evaluate(el => el.setAttribute('data-paused', ''))
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['paused', 'paused'], 'hidden Mewlink pages pause both orbits')
  await page.locator('#mewlink').evaluate(el => el.removeAttribute('data-paused'))
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['running', 'running'])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.deepEqual(await indicator.evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return [null, '::before', '::after'].map(pseudo => view.getComputedStyle(el, pseudo).animationName)
  }), ['none', 'none', 'none'], 'reduced motion leaves no animated pseudo-element behind')
  assert.match(await indicator.evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el, '::before').backgroundImage), /conic-gradient/, 'the static loading shape remains visible')

  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' })
  const forcedColors = await indicator.evaluate(el => {
    const doc = el.ownerDocument, view = doc.defaultView!
    const probe = doc.createElement('span')
    probe.style.color = 'CanvasText'
    doc.body.append(probe)
    const systemText = view.getComputedStyle(probe).color
    probe.remove()
    const outer = view.getComputedStyle(el, '::before')
    return {
      systemText, color: outer.borderTopColor, width: parseFloat(outer.borderTopWidth),
      border: outer.borderTopStyle, mask: outer.maskImage, outerBackground: outer.backgroundImage,
      core: view.getComputedStyle(el).backgroundImage, inner: view.getComputedStyle(el, '::after').display,
    }
  })
  assert.equal(forcedColors.color, forcedColors.systemText)
  assert.ok(forcedColors.width >= 1, 'forced colors retain a visible system-color boundary')
  assert.equal(forcedColors.border, 'solid')
  assert.equal(forcedColors.mask, 'none')
  assert.equal(forcedColors.outerBackground, 'none')
  assert.equal(forcedColors.core, 'none')
  assert.equal(forcedColors.inner, 'none')
  assert.deepEqual(errors, [])
})
