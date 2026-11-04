import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

test('calendar agenda follows panel orientation and scrolls independently in wide panels', { timeout: 45_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const source = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {TaskCalendar} from '${root}/src/components/task-calendar.tsx';
import {tasksOnDate} from '${root}/src/utils/task-schedule.ts';
const tasks=Array.from({length:40},(_,i)=>({id:String(i),text:'Scheduled task '+i,done:false,startDate:'2026-11-04',date:'2026-11-04'}));
function Fixture(){const [selected,setSelected]=useState('2026-11-04'),[month,setMonth]=useState('2026-11');
return <section className="task-panel" style={{width:900,height:500,display:'flex',flexDirection:'column',overflow:'hidden'}}>
<header style={{height:36,flexShrink:0}}>Tasks</header><div style={{height:32,flexShrink:0}}>Filters</div>
<div className="task-view-body" style={{flex:1,minHeight:0,overflow:'auto'}}>
<TaskCalendar tasks={tasks} selected={selected} month={month} onSelect={setSelected} onMonth={setMonth}>
<div className="task-lines">{tasksOnDate(tasks,selected).map(task=><div className="task-line" key={task.id} style={{height:32}}><input aria-label={task.text} defaultValue={task.text}/></div>)}</div>
</TaskCalendar></div></section>}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:task-calendar-layout.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'task-calendar-layout-fixture', resolveId(id) { if (id === 'virtual:task-calendar-layout.tsx') return id }, load(id) { if (id === 'virtual:task-calendar-layout.tsx') return source } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const panelCss = await fs.readFile(path.join(root, 'src/components/task-panel.css'), 'utf8')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build(Array.from(panelCss.matchAll(/--color-([a-z-]+)/g), match => `bg-${match[1]}`)) + panelCss
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-task-calendar-layout.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>` }))
    await page.goto('http://mew-task-calendar-layout.test/')
    await page.locator('.task-calendar-day[data-selected]').waitFor()
    const panel = page.locator('.task-panel'), agenda = page.locator('.task-calendar-agenda')
    const screenshots = '/tmp/mew-task-calendar-layout'
    await fs.mkdir(screenshots, { recursive: true })
    for (const [width, height, wide] of [[900, 500, true], [900, 1000, false], [640, 400, true], [640, 640, false], [639, 400, false], [320, 740, false], [900, 220, true]] as const) {
      await panel.evaluate(async (el, size) => {
        el.style.width = `${size[0]}px`; el.style.height = `${size[1]}px`
        const view = el.ownerDocument.defaultView!
        await new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
      }, [width, height])
      const monthBox = await page.locator('.task-calendar-month').boundingBox(), agendaBox = await agenda.boundingBox()
      assert.ok(monthBox && agendaBox)
      if (wide) {
        assert.ok(agendaBox.x >= monthBox.x + monthBox.width - 1, `${width}×${height}: agenda is to the right`)
        assert.ok(Math.abs(agendaBox.y - monthBox.y) < 1, 'both columns start at the same height')
        await agenda.evaluate(el => { el.scrollTop = 100 })
        assert.ok(await agenda.evaluate(el => el.scrollTop) > 0, 'long agendas scroll within their column')
        assert.equal(await page.locator('.task-calendar-month').evaluate(el => el.scrollTop), 0, 'agenda scrolling preserves the calendar position')
        assert.equal(await page.locator('.task-view-body').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'columns fit the available panel height')
      } else {
        assert.ok(agendaBox.y >= monthBox.y + monthBox.height - 1, `${width}×${height}: agenda stays below`)
        assert.ok(Math.abs(agendaBox.x - monthBox.x) < 1, 'stacked sections share the panel width')
      }
      assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'no horizontal panel overflow')
      assert.equal(await agenda.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'agenda content fits its column')
      assert.equal(await page.locator('.task-calendar-day[data-selected]').getAttribute('data-date'), '2026-11-04', 'resizing preserves date selection')
      assert.equal(await agenda.getByRole('textbox').count(), 40, 'resizing preserves the task list')
      if (width === 900 && height === 500 || width === 320) await page.screenshot({ path: `${screenshots}/${width}x${height}.png` })
    }
    await page.locator('.task-calendar-day[data-date="2026-11-05"]').click()
    assert.equal(await agenda.getByRole('textbox').count(), 0, 'date selection updates the right-hand agenda')
    await page.locator('.task-calendar-day[data-selected]').press('ArrowLeft')
    assert.equal(await agenda.getByRole('textbox').count(), 40, 'keyboard date navigation restores the selected tasks')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
