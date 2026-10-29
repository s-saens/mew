import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'

export async function verifyDemoTasks(page: Page, width: number): Promise<void> {
  const task = await page.evaluate(async () => {
    const snapshot = await (await fetch('/api/task-list')).json() as { tasks: { id: string; text: string; path: string; done: boolean }[] }
    return snapshot.tasks.find(item => item.text === 'mewlink')
  })
  assert.ok(task)
  task.path = '.mew/tasks/Done/mewlink.md'
  const dock = page.locator('.mobile-dock')
  await dock.locator('[data-dock-item="tasks"]').click()
  const tasks = page.locator('[data-workspace-panel="tasks"]')
  await tasks.getByRole('checkbox', { name: '완료된 항목 보기', exact: true }).check()
  const row = tasks.locator(`[data-task-id="${task.id}"]`)
  if (task.done) {
    await row.getByRole('checkbox', { name: '태스크 완료', exact: true }).uncheck()
    await page.waitForFunction("globalThis.demoWorkspace.hasFile('.mew/tasks/mewlink.md')")
  }
  await row.getByRole('checkbox', { name: '태스크 완료', exact: true }).check()
  await page.waitForFunction(`globalThis.demoWorkspace.hasFile(${JSON.stringify(task.path)}) && globalThis.demoWorkspace.readFile(${JSON.stringify(task.path)}).content.includes('done: true')`)
  await row.getByRole('button', { name: '태그: 기능', exact: true }).click()
  const tagPicker = page.getByRole('dialog', { name: '태그', exact: true })
  await tagPicker.getByRole('option', { name: '문서', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.waitForFunction(`globalThis.demoWorkspace.readFile(${JSON.stringify(task.path)}).content.includes('문서')`)
  await row.locator('.task-date-status').click()
  const calendar = page.getByRole('dialog', { name: '일정 편집', exact: true }), day = calendar.locator('[data-date]').nth(12)
  const selectedDate = await day.getAttribute('data-date')
  await day.click(); await day.click(); await page.keyboard.press('Escape')
  await page.waitForFunction(`globalThis.demoWorkspace.readFile(${JSON.stringify(task.path)}).content.includes(${JSON.stringify(selectedDate)})`)
  await row.getByRole('button', { name: '파일 열기', exact: true }).click()
  if (width === 390) await dock.locator('[data-dock-item="editor"]').click()
  const taskEditor = page.locator('.ProseMirror[contenteditable="true"]:visible').first()
  await taskEditor.waitFor(); await taskEditor.press('Control+End')
  await page.keyboard.insertText('실제 태스크 문서에 메모를 남깁니다.')
  await page.waitForFunction(`globalThis.demoWorkspace.readFile(${JSON.stringify(task.path)}).content.includes('실제 태스크 문서에 메모를 남깁니다.')`)
  if (width === 390) await dock.locator('[data-dock-item="tasks"]').click()
  await tasks.getByRole('tab', { name: '달력', exact: true }).click()
  await tasks.getByRole('grid', { name: '태스크 달력', exact: true }).waitFor()
  await tasks.getByRole('tab', { name: '간트', exact: true }).click()
  await tasks.locator('.task-gantt-svg').waitFor()
  assert.ok(await tasks.locator('.task-gantt-label').count() >= 4)
  await tasks.getByRole('tab', { name: '목록', exact: true }).click()
  const draft = tasks.getByRole('textbox', { name: '새 태스크', exact: true })
  await draft.fill('데모에서 직접 만든 작업'); await draft.press('Enter')
  await page.waitForFunction(`globalThis.demoWorkspace.fileEntries().some(file => file.path === '.mew/tasks/데모에서 직접 만든 작업.md')`)
  assert.equal(await tasks.getByRole('alert').count(), 0)
}
