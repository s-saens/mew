import test from 'node:test'
import assert from 'node:assert/strict'
import { parseVmStatUsed } from './platform/macos/memory.ts'
import { readSystemMemory } from './system-memory.ts'

const GIB = 1024 ** 3

function vmStat(pageSize: number): string {
  return `Mach Virtual Memory Statistics: (page size of ${pageSize} bytes)
Pages free:                                  1000.
Pages active:                                2000.
Pages inactive:                              3000.
Pages speculative:                            40.
Pages wired down:                             500.
Pages purgeable:                               20.
File-backed pages:                           4000.
Anonymous pages:                             6000.
Pages stored in compressor:                 20000.
Pages occupied by compressor:                 800.
`
}

test('macOS excludes file cache and counts physical compressed pages at the reported page size', () => {
  for (const size of [4096, 16384]) {
    assert.equal(parseVmStatUsed(vmStat(size), GIB), (6000 + 500 + 800 - 20) * size)
  }
})

test('macOS rejects missing, duplicated, malformed and out-of-range counters', () => {
  const valid = vmStat(4096)
  for (const text of [
    valid.replace('Anonymous pages:', 'Other pages:'),
    `${valid}Pages purgeable: 0.\n`,
    valid.replace('6000.', '1.5.'),
    valid.replace('6000.', '-1.'),
    valid.replace('6000.', '999999999999999999999.'),
    valid.replace('6000.', '9999999.'),
    valid.replace('page size of 4096', 'page size of 0'),
    valid.replace('Pages purgeable:                               20.', 'Pages purgeable:                            10000.'),
  ]) assert.equal(parseVmStatUsed(text, GIB), null, text)
})

test('system RAM routes macOS sample to both usage and available, with a free-memory fallback', async () => {
  const expected = (6000 + 500 + 800 - 20) * 4096
  const args = { platform: 'darwin' as const, total: GIB, free: 100, readLinux: () => assert.fail('must not read Linux /proc') }
  assert.deepEqual(await readSystemMemory({ ...args, readMac: async total => parseVmStatUsed(vmStat(4096), total) }),
    { total: GIB, used: expected, available: GIB - expected })
  for (const readMac of [async () => null, async () => { throw new Error('vm_stat failed') }, async () => GIB + 1]) {
    assert.deepEqual(await readSystemMemory({ ...args, readMac }), { total: GIB, used: GIB - 100, available: 100 })
  }
})

test('Linux uses MemAvailable and other platforms retain their free-memory fallback', async () => {
  const args = { total: GIB, free: 100, readMac: async () => assert.fail('must not invoke vm_stat') }
  assert.deepEqual(await readSystemMemory({ ...args, platform: 'linux', readLinux: () => 'MemAvailable: 524288 kB\n' }),
    { total: GIB, used: GIB / 2, available: GIB / 2 })
  assert.deepEqual(await readSystemMemory({ ...args, platform: 'linux', readLinux: () => { throw new Error('unavailable') } }),
    { total: GIB, used: GIB - 100, available: 100 })
  assert.deepEqual(await readSystemMemory({ ...args, platform: 'win32' }), { total: GIB, used: GIB - 100, available: 100 })
})
