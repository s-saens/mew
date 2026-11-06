import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)

test('virtual display modes select bounded advertised resolutions and refresh rates with consistent timings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-display-modes-'))
  try {
    await fs.copyFile(path.resolve(import.meta.dirname, '../native/remote-desktop/virtual-display-modes.h'), path.join(root, 'virtual-display-modes.h'))
    await fs.writeFile(path.join(root, 'modes.cpp'), `#include "virtual-display-modes.h"
#include <cassert>
#include <limits>
void selected(uint32_t width,uint32_t height,uint32_t fps,uint32_t expectedWidth,uint32_t expectedHeight,uint32_t expectedFps){
 const auto mode=selectMewDisplayMode(width,height,fps);assert(isMewDisplayMode(mode));
 assert(mode.width==expectedWidth && mode.height==expectedHeight && mode.fps==expectedFps);
}
int main(){
 assert(mewDisplayModes.size()==12);
 for(const auto& mode:mewDisplayModes){
  selected(mode.width,mode.height,mode.fps,mode.width,mode.height,mode.fps);
  const auto timing=mewDisplayTiming(mode);
  assert(timing.width>mode.width && timing.height>mode.height);
  assert(timing.pixelRate==uint64_t(timing.width)*timing.height*mode.fps);
  assert(timing.pixelRate<=std::numeric_limits<uint32_t>::max());
 }
 selected(1280,720,30,1920,1080,60);
 selected(2560,1440,165,2560,1440,144);
 selected(3000,2000,119,2560,1440,60);
 selected(3840,1440,240,2560,1440,240);
 selected(2160,3840,144,1920,1080,144);
 selected(0,0,0,1920,1080,60);
 selected(UINT32_MAX,UINT32_MAX,UINT32_MAX,3840,2160,240);
 assert(!isMewDisplayMode({2560,1440,165}));assert(!isMewDisplayMode({1280,720,60}));
}
`)
    await run('c++', ['-std=c++17', '-O2', path.join(root, 'modes.cpp'), '-o', path.join(root, 'modes')])
    await run(path.join(root, 'modes'))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('Windows CCD activation applies exact modes, preserves physical outputs and refuses shared sources', {
  skip: !process.env.MEW_DESKTOP_TEST_POWERSHELL,
}, async () => {
  const script = path.resolve(import.meta.dirname, '../native/remote-desktop/test-virtual-display-client.ps1')
  const translated = process.platform === 'win32' ? script : (await run('wslpath', ['-w', script])).stdout.trim()
  const result = await run(process.env.MEW_DESKTOP_TEST_POWERSHELL!, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', translated])
  assert.match(result.stdout, /CCD mock tests passed/)
})

test('driver monitor lease isolates file owners, expires without renewal and cleans up on file close', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-display-lease-'))
  try {
    await fs.copyFile(path.resolve(import.meta.dirname, '../native/remote-desktop/virtual-display-lease.h'), path.join(root, 'virtual-display-lease.h'))
    await fs.writeFile(path.join(root, 'lease.cpp'), `#include "virtual-display-lease.h"
#include <cassert>
int main(){
 DisplayLease lease;
 assert(!lease.acquire(0,0));assert(lease.acquire(11,0));
 assert(!lease.acquire(22,1));assert(!lease.renew(22,1));assert(!lease.release(22));
 assert(!lease.expired(9999));assert(lease.expired(10000));
 assert(!lease.renew(11,10000));assert(lease.release(11));
 assert(lease.acquire(22,10001));assert(lease.renew(22,19999));assert(!lease.expired(20001));
 assert(lease.release(22));assert(!lease.expired(30000));assert(!lease.release(22));
 assert(lease.acquire(33,30000));assert(!lease.acquire(33,30001));
 assert(lease.release(33));assert(lease.acquire(44,30002));
}
`)
    await run('c++', ['-std=c++17', '-O2', path.join(root, 'lease.cpp'), '-o', path.join(root, 'lease')])
    await run(path.join(root, 'lease'))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('an unsigned driver package fails verification without staging or registering a device', {
  skip: !process.env.MEW_DESKTOP_TEST_WINDOWS_DRIVER_PACKAGE || !process.env.MEW_DESKTOP_TEST_POWERSHELL,
}, async () => {
  const script = path.resolve(import.meta.dirname, '../native/remote-desktop/install-virtual-display.ps1')
  const translated = (await run('wslpath', ['-w', script])).stdout.trim()
  await assert.rejects(run(process.env.MEW_DESKTOP_TEST_POWERSHELL!, [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', translated, '-Package', process.env.MEW_DESKTOP_TEST_WINDOWS_DRIVER_PACKAGE!,
    '-SignerThumbprint', '0000000000000000000000000000000000000000', '-CheckOnly',
  ]), /valid trusted release signature/)
})
