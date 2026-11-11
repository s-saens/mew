import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeWav, SAMPLE_RATE } from './audio.ts'

test('WAV output is 16 kHz mono PCM and clamps signed samples', async () => {
  const wav = encodeWav(new Float32Array([-2, -1, 0, 1, 2]))
  assert.equal(wav.type, 'audio/wav')
  const bytes = await wav.arrayBuffer()
  const view = new DataView(bytes)
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF')
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), 'WAVE')
  assert.equal(view.getUint32(4, true), bytes.byteLength - 8)
  assert.equal(view.getUint16(20, true), 1)
  assert.equal(view.getUint16(22, true), 1)
  assert.equal(view.getUint32(24, true), SAMPLE_RATE)
  assert.equal(view.getUint32(28, true), SAMPLE_RATE * 2)
  assert.equal(view.getUint16(34, true), 16)
  assert.equal(view.getUint32(40, true), 10)
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 32767, 32767])
})
