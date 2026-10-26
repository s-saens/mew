import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const sizes = [12, 14, 16, 28, 48, 56]

test('shared loading indicators keep the Mew logo fixed while a gradient highlight moves with accessible alternatives', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
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
  const favicon = await fs.readFile(new URL('../../../public/favicon.svg', import.meta.url), 'utf8')
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
  await page.locator('.size-56').waitFor()

  for (const size of sizes) {
    const snapshot = await page.locator(`.size-${size}`).evaluate(el => {
      const view = el.ownerDocument.defaultView!
      const style = view.getComputedStyle(el)
      const highlight = view.getComputedStyle(el, '::after')
      return {
        tag: el.tagName, children: el.childElementCount, hidden: el.getAttribute('aria-hidden'),
        width: parseFloat(style.width), height: parseFloat(style.height),
        base: style.backgroundImage, mask: style.maskImage, maskMode: style.maskMode,
        rootTransform: style.transform, rootAnimation: style.animationName,
        highlight: highlight.backgroundImage, highlightContent: highlight.content,
        highlightWidth: parseFloat(highlight.width), highlightHeight: parseFloat(highlight.height),
      }
    })
    assert.equal(snapshot.tag, 'SPAN')
    assert.equal(snapshot.children, 0, 'React and plain HTML share one empty decorative element')
    assert.equal(snapshot.hidden, 'true')
    assert.equal(snapshot.width, size)
    assert.equal(snapshot.height, size)
    assert.equal(snapshot.rootTransform, 'none', 'the logo must stay fixed while its highlight moves')
    assert.equal(snapshot.rootAnimation, 'none')
    assert.match(snapshot.mask, /^url\("data:image\/svg\+xml,/)
    assert.equal(snapshot.maskMode, 'alpha')
    assert.match(snapshot.base, /linear-gradient/)
    assert.ok(new Set(snapshot.base.match(/rgb\([^)]+\)/g)).size >= 3, 'the logo has a multicolor base')
    assert.equal(snapshot.highlightContent, '""')
    assert.match(snapshot.highlight, /conic-gradient/)
    assert.ok(new Set(snapshot.highlight.match(/rgb\([^)]+\)/g)).size >= 5, 'the highlight spans distinct gradient colors')
    assert.ok(snapshot.highlightWidth >= size * Math.SQRT2, 'the rotating highlight covers the square logo corners')
    assert.ok(snapshot.highlightHeight >= size * Math.SQRT2)
  }

  const indicator = page.locator('.size-16')
  const geometry = await indicator.evaluate((el, source) => {
    const view = el.ownerDocument.defaultView!
    const mask = view.getComputedStyle(el).maskImage
    const dataUrl = mask.match(/^url\("(.*)"\)$/)?.[1]
    if (!dataUrl?.startsWith('data:image/svg+xml,')) throw new Error('Expected an embedded SVG logo mask')
    const parser = new view.DOMParser()
    const original = parser.parseFromString(source, 'image/svg+xml').documentElement
    const logo = parser.parseFromString(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1)), 'image/svg+xml').documentElement
    const shapes = (svg: typeof logo) => Array.from(svg.querySelectorAll('rect,path'), shape => ({
      tag: shape.localName,
      attributes: Object.fromEntries(Array.from(shape.attributes)
        .filter(attribute => attribute.name !== 'stroke')
        .map(attribute => [attribute.name, attribute.value])),
    }))
    return {
      actual: shapes(logo), expected: shapes(original),
      viewBox: logo.getAttribute('viewBox'), originalViewBox: original.getAttribute('viewBox'),
      fill: logo.getAttribute('fill'), originalFill: original.getAttribute('fill'),
      strokes: Array.from(logo.querySelectorAll('rect,path'), shape => shape.getAttribute('stroke')),
    }
  }, favicon)
  assert.deepEqual(geometry.actual, geometry.expected, 'the mask preserves the original Mew rectangle and path geometry')
  assert.equal(geometry.actual.length, 2)
  assert.equal(geometry.viewBox, geometry.originalViewBox)
  assert.equal(geometry.fill, geometry.originalFill)
  assert.equal(geometry.fill, 'none', 'the logo mask contains strokes rather than solid filled shapes')
  assert.deepEqual(geometry.strokes, ['white', 'white'])

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
  assert.equal(motion.effects.length, 1, 'only the highlight animates')
  const allowedKeys = new Set(['offset', 'computedOffset', 'easing', 'composite', 'transform'])
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
  assert.deepEqual(await playStates('.inactive'), ['paused', 'paused'], 'active=false pauses the moving highlight')
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['running', 'running'], 'plain HTML needs no React state attribute')
  await page.locator('#mewlink').evaluate(el => el.setAttribute('data-paused', ''))
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['paused', 'paused'], 'hidden Mewlink pages pause the highlight')
  await page.locator('#mewlink').evaluate(el => el.removeAttribute('data-paused'))
  assert.deepEqual(await playStates('#mewlink .mew-loading-indicator'), ['running', 'running'])
  await page.locator('.inactive').evaluate(el => el.setAttribute('data-active', 'true'))
  assert.deepEqual(await playStates('.inactive'), ['running', 'running'], 'reactivating an indicator resumes its highlight')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedMotion = await indicator.evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return {
      animations: [null, '::before', '::after'].map(pseudo => view.getComputedStyle(el, pseudo).animationName),
      runningAnimations: el.getAnimations({ subtree: true }).length,
      highlight: view.getComputedStyle(el, '::after').backgroundImage,
      highlightTransform: view.getComputedStyle(el, '::after').transform,
      rootTransform: view.getComputedStyle(el).transform,
      mask: view.getComputedStyle(el).maskImage,
    }
  })
  assert.deepEqual(reducedMotion.animations, ['none', 'none', 'none'], 'reduced motion leaves no animated pseudo-element behind')
  assert.equal(reducedMotion.runningAnimations, 0)
  assert.match(reducedMotion.highlight, /conic-gradient/, 'reduced motion retains a static colored highlight')
  assert.notEqual(reducedMotion.highlightTransform, 'none')
  assert.equal(reducedMotion.rootTransform, 'none')
  assert.match(reducedMotion.mask, /data:image\/svg\+xml,/)

  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' })
  const forcedColors = await indicator.evaluate(el => {
    const doc = el.ownerDocument, view = doc.defaultView!
    const probe = doc.createElement('span')
    probe.style.color = 'CanvasText'
    doc.body.append(probe)
    const systemText = view.getComputedStyle(probe).color
    probe.remove()
    const style = view.getComputedStyle(el)
    return {
      systemText, background: style.backgroundColor, backgroundImage: style.backgroundImage,
      mask: style.maskImage, colorAdjust: style.forcedColorAdjust,
      highlight: view.getComputedStyle(el, '::after').display,
    }
  })
  assert.equal(forcedColors.background, forcedColors.systemText, 'forced colors retain the full logo in the system text color')
  assert.equal(forcedColors.backgroundImage, 'none')
  assert.equal(forcedColors.mask, reducedMotion.mask, 'high contrast retains the Mew logo geometry')
  assert.equal(forcedColors.colorAdjust, 'none')
  assert.equal(forcedColors.highlight, 'none')
  assert.deepEqual(errors, [])
})
