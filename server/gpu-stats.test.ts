import test from 'node:test'
import assert from 'node:assert/strict'
import { createGpuCollector } from './gpu-stats.ts'

const gpuOutput = 'Fixture GPU, 12, 512, 16384, 50'
const gpuQuery = ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits']
const processQuery = ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits']
type Command = { file: string; args: string[] }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

function wslFixture(overrides: Parameters<typeof createGpuCollector>[0] = {}) {
  const calls: Command[] = []
  const windowsExe = '/mnt/c/Windows/System32/nvidia-smi.exe'
  const collector = createGpuCollector({
    platform: 'linux', env: { WSL_DISTRO_NAME: 'Fixture' }, release: 'fixture-kernel',
    readMounts: () => '', executable: file => file === windowsExe,
    run: async (file, args) => { calls.push({ file, args }); return gpuOutput },
    now: () => 0, ...overrides,
  })
  return { collector, calls, windowsExe }
}

test('WSL GPU monitoring uses Windows interop exclusively and never queries process GPU memory', async () => {
  const { collector, calls, windowsExe } = wslFixture()
  assert.deepEqual(await collector.processMemory(), new Map())
  assert.equal(calls.length, 0, 'process memory alone must not initialize either NVML implementation')
  assert.deepEqual(await collector.gpus(), [{ name: 'Fixture GPU', utilization: 12, memoryUsedMb: 512, memoryTotalMb: 16384, temperature: 50 }])
  assert.deepEqual(await collector.processMemory(), new Map())
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL without an executable reports unavailable without falling back to Linux nvidia-smi', async () => {
  const { collector, calls } = wslFixture({ executable: () => false })
  assert.deepEqual(await collector.gpus(), [])
  assert.deepEqual(await collector.processMemory(), new Map())
  assert.deepEqual(calls, [])
})

test('a failing Windows WSL query never falls back to Linux NVML or compute-app queries', async () => {
  const calls: Command[] = []
  const { collector, windowsExe } = wslFixture({ run: async (file, args) => { calls.push({ file, args }); throw new Error('fixture interop unavailable') } })
  assert.deepEqual(await collector.gpus(), [])
  assert.deepEqual(await collector.processMemory(), new Map())
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL detection survives stripped environment using the Microsoft kernel release', async () => {
  const { collector, calls, windowsExe } = wslFixture({ env: {}, release: '6.6.87.2-MiCrOsOfT-standard-WSL2' })
  await collector.gpus()
  await collector.processMemory()
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL_INTEROP alone selects Windows GPU queries', async () => {
  const { collector, calls, windowsExe } = wslFixture({ env: { WSL_INTEROP: '/run/WSL/fixture_interop' } })
  await collector.gpus()
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL resolves Windows executable PATH entries containing spaces without shell splitting', async () => {
  const windowsExe = '/windows tools/NVIDIA Corporation/nvidia-smi.exe'
  const { collector, calls } = wslFixture({ env: { WSL_DISTRO_NAME: 'Fixture', PATH: '/usr/bin:/windows tools/NVIDIA Corporation:/bin' }, executable: file => file === windowsExe })
  await collector.gpus()
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL resolves Windows drive mounts with octal-escaped spaces', async () => {
  const windowsExe = '/windows drives/system/Program Files/NVIDIA Corporation/NVSMI/nvidia-smi.exe'
  const { collector, calls } = wslFixture({
    readMounts: () => 'C:\\ /windows\\040drives/system 9p rw 0 0\nnone /unrelated tmpfs rw 0 0\n',
    executable: file => file === windowsExe,
  })
  await collector.gpus()
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('WSL standard mount fallback works if the mount table cannot be read', async () => {
  const { collector, calls, windowsExe } = wslFixture({ readMounts: () => { throw new Error('fixture unreadable mounts') } })
  await collector.gpus()
  assert.deepEqual(calls, [{ file: windowsExe, args: gpuQuery }])
})

test('GPU parsing preserves unknown measurements as null and skips malformed rows', async () => {
  const collector = createGpuCollector({
    platform: 'linux', env: {}, release: 'fixture-native-kernel',
    run: async () => '\r\n  Fixture GPU, N/A, , -1, [Not Supported]\r\nZero GPU, 0, 0, 0, 0\r\nInvalid GPU, Infinity, NaN, unknown, -2\r\n, 1, 2, 3, 4\r\nshort, 1, 2, 3\r\n',
  })
  assert.deepEqual(await collector.gpus(), [
    { name: 'Fixture GPU', utilization: null, memoryUsedMb: null, memoryTotalMb: null, temperature: null },
    { name: 'Zero GPU', utilization: 0, memoryUsedMb: 0, memoryTotalMb: 0, temperature: 0 },
    { name: 'Invalid GPU', utilization: null, memoryUsedMb: null, memoryTotalMb: null, temperature: null },
  ])
})

for (const platform of ['linux', 'win32'] as const) {
  test(`native ${platform} process GPU memory sums duplicate PIDs and ignores unavailable or invalid rows`, async () => {
    const calls: Command[] = []
    const collector = createGpuCollector({
      platform, env: {}, release: 'fixture-native-kernel',
      run: async (file, args) => {
        calls.push({ file, args })
        return args[0] === gpuQuery[0] ? gpuOutput : '123, 10\n123, 2.5\n456, 0\n789, N/A\n790, \n791, -1\n792, Infinity\n, 10\n-1, 10\n1.5, 10\nN/A, 10\n'
      },
    })
    assert.deepEqual(await collector.processMemory(), new Map([[123, 12.5], [456, 0]]))
    const file = platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi'
    assert.deepEqual(calls, [{ file, args: gpuQuery }, { file, args: processQuery }])
    await collector.processMemory()
    assert.equal(calls.length, 2, 'cached process samples avoid another command')
  })
}

test('native process GPU queries are skipped when no GPU is available', async () => {
  const calls: Command[] = []
  const collector = createGpuCollector({ platform: 'linux', env: {}, release: 'fixture-native-kernel', run: async (file, args) => { calls.push({ file, args }); return '' } })
  assert.deepEqual(await collector.processMemory(), new Map())
  assert.deepEqual(calls, [{ file: 'nvidia-smi', args: gpuQuery }])
})

test('successful GPU samples are shared until five seconds and refresh at expiry', async () => {
  let now = 0
  const { collector, calls } = wslFixture({ now: () => now })
  const first = await collector.gpus()
  now = 4999
  assert.equal(await collector.gpus(), first)
  assert.equal(calls.length, 1)
  now = 5000
  await collector.gpus()
  assert.equal(calls.length, 2)
})

test('unavailable GPU queries back off for thirty seconds and recover at expiry', async () => {
  let now = 0, calls = 0
  const { collector } = wslFixture({ now: () => now, run: async () => { if (++calls === 1) throw new Error('fixture query failure'); return gpuOutput } })
  assert.deepEqual(await collector.gpus(), [])
  now = 29_999
  assert.deepEqual(await collector.gpus(), [])
  assert.equal(calls, 1)
  now = 30_000
  assert.equal((await collector.gpus()).length, 1)
  assert.equal(calls, 2)
  now = 34_999
  await collector.gpus()
  assert.equal(calls, 2)
  now = 35_000
  await collector.gpus()
  assert.equal(calls, 3)
})

test('missing WSL executable discovery recovers after unavailable sample expires', async () => {
  let now = 0, installed = false
  const { collector, calls } = wslFixture({ now: () => now, executable: file => installed && file === '/mnt/c/Windows/System32/nvidia-smi.exe' })
  assert.deepEqual(await collector.gpus(), [])
  installed = true
  now = 29_999
  assert.deepEqual(await collector.gpus(), [])
  assert.equal(calls.length, 0)
  now = 30_000
  assert.equal((await collector.gpus()).length, 1)
  assert.equal(calls.length, 1)
})

test('slow GPU collection remains shared beyond five seconds and caches from fulfillment', async () => {
  let now = 0, calls = 0
  const work = deferred<string>()
  const { collector } = wslFixture({ now: () => now, run: async () => { calls++; return work.promise } })
  const first = collector.gpus()
  now = 20_000
  assert.equal(collector.gpus(), first)
  assert.equal(calls, 1)
  work.resolve(gpuOutput)
  const value = await first
  now = 24_999
  assert.equal(await collector.gpus(), value)
  assert.equal(calls, 1)
  now = 25_000
  await collector.gpus()
  assert.equal(calls, 2)
})
