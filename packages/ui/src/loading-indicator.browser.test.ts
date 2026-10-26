import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const sizes = [12, 14, 16, 28, 48, 56]

test('shared loading indicators support dots, startup logos and circular attachment spinners', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {LoadingIndicator} from '${root}/packages/ui/src/loading-indicator.tsx';
createRoot(document.getElementById('react')).render(React.createElement(React.Fragment,null,
  ...${JSON.stringify(sizes)}.flatMap(size=>[
    React.createElement(LoadingIndicator,{key:'logo-'+size,variant:'logo',size,className:'size-'+size}),
    React.createElement(LoadingIndicator,{key:'dots-'+size,size,className:'dots-size-'+size}),
    React.createElement(LoadingIndicator,{key:'spinner-'+size,variant:'spinner',size,className:'spinner-size-'+size})
  ]),
  React.createElement(LoadingIndicator,{variant:'logo',active:false,className:'inactive'}),
  React.createElement(LoadingIndicator,{active:false,className:'inactive-dots'}),
  React.createElement(LoadingIndicator,{variant:'spinner',active:false,className:'inactive-spinner'})
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
    <div id="mewlink">
      <span class="mew-loading-indicator mew-loading-logo" aria-hidden="true"></span>
      <span class="mew-loading-indicator mew-loading-dots" aria-hidden="true"><span class="mew-loading-dot"></span><span class="mew-loading-dot"></span><span class="mew-loading-dot"></span></span>
    </div>`)
  await page.addScriptTag({ content: code })
  await page.locator('.size-56').waitFor()

  for (const size of sizes) {
    const spinner = await page.locator(`.spinner-size-${size}`).evaluate(el => {
      const style = el.ownerDocument.defaultView!.getComputedStyle(el)
      return {
        width: parseFloat(style.width), height: parseFloat(style.height),
        hidden: el.getAttribute('aria-hidden'), children: el.childElementCount,
        border: style.borderRightWidth, borderColor: style.borderRightColor, color: style.color,
        gap: style.borderTopColor, radius: style.borderRadius,
        animation: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction,
      }
    })
    assert.equal(spinner.width, size)
    assert.equal(spinner.height, size)
    assert.equal(spinner.hidden, 'true')
    assert.equal(spinner.children, 0, 'the circular indicator does not render dots')
    assert.equal(spinner.border, '2px')
    assert.equal(spinner.borderColor, spinner.color)
    assert.equal(spinner.gap, 'rgba(0, 0, 0, 0)')
    assert.equal(spinner.radius, '50%')
    assert.equal(spinner.animation, 'mew-loading-spin')
    assert.equal(spinner.duration, '0.8s')
    assert.equal(spinner.easing, 'linear')
  }
  const spinnerState = () => page.locator('.inactive-spinner').evaluate(el =>
    el.ownerDocument.defaultView!.getComputedStyle(el).animationPlayState)
  assert.equal(await spinnerState(), 'paused')
  await page.locator('.inactive-spinner').evaluate(el => el.setAttribute('data-active', 'true'))
  assert.equal(await spinnerState(), 'running')
  await page.locator('#react').evaluate(el => el.setAttribute('data-paused', ''))
  assert.equal(await spinnerState(), 'paused')
  await page.locator('#react').evaluate(el => el.removeAttribute('data-paused'))
  assert.equal(await spinnerState(), 'running')

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
    assert.ok(await page.locator(`.size-${size}`).evaluate(el => el.classList.contains('mew-loading-logo')))
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

  for (const size of sizes) {
    const snapshot = await page.locator(`.dots-size-${size}`).evaluate(el => {
      const view = el.ownerDocument.defaultView!
      const style = view.getComputedStyle(el)
      return {
        tag: el.tagName, children: el.childElementCount, hidden: el.getAttribute('aria-hidden'),
        variant: el.classList.contains('mew-loading-dots'),
        width: parseFloat(style.width), height: parseFloat(style.height),
        rootTransform: style.transform, rootAnimation: style.animationName,
        mask: style.maskImage, background: style.backgroundImage,
        color: style.color,
        dots: Array.from(el.children, dot => {
          const dotStyle = view.getComputedStyle(dot)
          return {
            tag: dot.tagName, className: dot.className, children: dot.childElementCount,
            width: parseFloat(dotStyle.width), height: parseFloat(dotStyle.height),
            color: dotStyle.backgroundColor, background: dotStyle.backgroundImage,
            radius: dotStyle.borderRadius,
          }
        }),
      }
    })
    assert.equal(snapshot.tag, 'SPAN')
    assert.equal(snapshot.hidden, 'true')
    assert.equal(snapshot.variant, true, 'the default variant is the compact dots indicator')
    assert.equal(snapshot.width, size * 1.5)
    assert.equal(snapshot.height, size)
    assert.equal(snapshot.rootTransform, 'none')
    assert.equal(snapshot.rootAnimation, 'none')
    assert.equal(snapshot.mask, 'none', 'panel loading does not reuse the logo mask')
    assert.equal(snapshot.background, 'none')
    assert.equal(snapshot.children, 3)
    for (const dot of snapshot.dots) {
      assert.equal(dot.tag, 'SPAN')
      assert.equal(dot.className, 'mew-loading-dot')
      assert.equal(dot.children, 0)
      assert.equal(dot.color, snapshot.color, 'dots inherit the surrounding text color')
      assert.equal(dot.background, 'none', 'compact loading uses solid monochrome dots')
      assert.equal(dot.radius, '50%')
      assert.ok(dot.width > 0 && dot.width <= size / 3, 'three dots fit inside the requested size')
      assert.equal(dot.width, dot.height)
    }
  }

  const dotMotion = await page.locator('.dots-size-16').evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return Array.from(el.children, dot => {
      const style = view.getComputedStyle(dot)
      return {
        name: style.animationName, duration: style.animationDuration, delay: style.animationDelay,
        effects: dot.getAnimations().map(animation => {
          const effect = animation.effect
          if (!(effect instanceof view.KeyframeEffect)) throw new Error('Expected a CSS dot keyframe animation')
          return {
            iterations: effect.getTiming().iterations,
            frames: effect.getKeyframes().map(frame => ({
              keys: Object.keys(frame), transform: frame.transform, opacity: frame.opacity,
            })),
          }
        }),
      }
    })
  })
  assert.deepEqual(dotMotion.map(dot => dot.name), Array(3).fill('mew-loading-dot-pulse'))
  assert.deepEqual(dotMotion.map(dot => dot.duration), Array(3).fill('1.2s'))
  assert.deepEqual(dotMotion.map(dot => dot.delay), ['-0.32s', '-0.16s', '0s'], 'the dots pulse in sequence')
  const dotAllowedKeys = new Set(['offset', 'computedOffset', 'easing', 'composite', 'transform', 'opacity'])
  for (const dot of dotMotion) {
    assert.equal(dot.effects.length, 1)
    assert.equal(dot.effects[0].iterations, Infinity)
    for (const frame of dot.effects[0].frames) {
      for (const property of frame.keys) assert.ok(dotAllowedKeys.has(property), `${property} is not an allowed animated dot property`)
      assert.match(String(frame.transform), /^scale\([\d.]+\)$/, 'dots change size without moving out of position')
      assert.ok(Number(frame.opacity) >= 0.45 && Number(frame.opacity) <= 1)
    }
    assert.ok(dot.effects[0].frames.some(frame => frame.transform === 'scale(0.55)'))
    assert.ok(dot.effects[0].frames.some(frame => frame.transform === 'scale(1)'))
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
  const dotPlayStates = (selector: string) => page.locator(selector).evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return Array.from(el.children, dot => view.getComputedStyle(dot).animationPlayState)
  })
  assert.deepEqual(await playStates('.inactive'), ['paused', 'paused'], 'active=false pauses the moving highlight')
  assert.deepEqual(await dotPlayStates('.inactive-dots'), Array(3).fill('paused'), 'active=false pauses all three dots')
  assert.deepEqual(await playStates('#mewlink .mew-loading-logo'), ['running', 'running'], 'plain HTML needs no React state attribute')
  assert.deepEqual(await dotPlayStates('#mewlink .mew-loading-dots'), Array(3).fill('running'))
  await page.locator('#mewlink').evaluate(el => el.setAttribute('data-paused', ''))
  assert.deepEqual(await playStates('#mewlink .mew-loading-logo'), ['paused', 'paused'], 'hidden Mewlink pages pause the highlight')
  assert.deepEqual(await dotPlayStates('#mewlink .mew-loading-dots'), Array(3).fill('paused'), 'hidden Mewlink pages pause all dots')
  await page.locator('#mewlink').evaluate(el => el.removeAttribute('data-paused'))
  assert.deepEqual(await playStates('#mewlink .mew-loading-logo'), ['running', 'running'])
  assert.deepEqual(await dotPlayStates('#mewlink .mew-loading-dots'), Array(3).fill('running'))
  await page.locator('.inactive').evaluate(el => el.setAttribute('data-active', 'true'))
  assert.deepEqual(await playStates('.inactive'), ['running', 'running'], 'reactivating an indicator resumes its highlight')
  await page.locator('.inactive-dots').evaluate(el => el.setAttribute('data-active', 'true'))
  assert.deepEqual(await dotPlayStates('.inactive-dots'), Array(3).fill('running'), 'reactivating an indicator resumes each dot')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.spinner-size-12').evaluate(el => el.getAnimations().length), 0, 'reduced motion stops circular rotation')
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
  const reducedDots = await page.locator('.dots-size-16').evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return {
      animations: el.getAnimations({ subtree: true }).length,
      dots: Array.from(el.children, dot => {
        const style = view.getComputedStyle(dot)
        return { name: style.animationName, opacity: style.opacity, width: parseFloat(style.width) }
      }),
    }
  })
  assert.equal(reducedDots.animations, 0, 'reduced motion stops all dot animations')
  for (const dot of reducedDots.dots) {
    assert.equal(dot.name, 'none')
    assert.ok(Number(dot.opacity) >= 0.45 && dot.width > 0, 'the three dots remain visible without motion')
  }

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
  const forcedSpinner = await page.locator('.spinner-size-12').evaluate(el => {
    const style = el.ownerDocument.defaultView!.getComputedStyle(el)
    return { border: style.borderRightColor, gap: style.borderTopColor }
  })
  assert.equal(forcedSpinner.border, forcedColors.systemText)
  assert.equal(forcedSpinner.gap, 'rgba(0, 0, 0, 0)', 'the circular gap stays visible in high contrast')
  const forcedDots = await page.locator('.dots-size-16').evaluate(el => {
    const view = el.ownerDocument.defaultView!
    return Array.from(el.children, dot => ({
      color: view.getComputedStyle(dot).backgroundColor,
      image: view.getComputedStyle(dot).backgroundImage,
    }))
  })
  for (const dot of forcedDots) {
    assert.equal(dot.color, forcedColors.systemText, 'forced colors retain all dots in the system text color')
    assert.equal(dot.image, 'none')
  }
  assert.deepEqual(errors, [])
})
