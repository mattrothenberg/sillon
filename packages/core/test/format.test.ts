// The .peaks format: what goes in comes back, within one step of the stored precision.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Peaks } from '../src/peaks.ts'

test('round-trips at 8 and 16 bits', () => {
  const v = Float32Array.from({ length: 10_007 }, (_, i) => (i % 97 === 0 ? 0 : Math.random() * 0.8))
  const p = Peaks.from(v, { sampleRate: 48000, bucketSize: 1024 })
  for (const bits of [8, 16] as const) {
    const q = Peaks.decode(p.encode({ bits }))
    assert.equal(q.sampleRate, 48000)
    assert.equal(q.bucketSize, 1024)
    assert.equal(q.length, v.length)
    assert.ok(q.complete)
    const step = p.max / (bits === 8 ? 255 : 65535)
    const back = q.toArray()
    for (let i = 0; i < v.length; i++) {
      assert.ok(back[i] >= v[i] - 1e-6 && back[i] - v[i] <= step + 1e-6, `value ${i}: ${v[i]} came back as ${back[i]}`)
    }
  }
})

test('rejects a buffer without the .peaks header', () => {
  assert.throws(() => Peaks.decode(new ArrayBuffer(24)), /not a .peaks file/)
})

test('rejects a truncated file, at 8 and 16 bits', () => {
  const p = Peaks.from(Float32Array.from({ length: 100 }, (_, i) => i / 100), { sampleRate: 44100, bucketSize: 512 })
  for (const bits of [8, 16] as const) {
    const whole = p.encode({ bits })
    assert.equal(Peaks.decode(whole).length, 100)
    // One byte short, and cut off halfway through the values.
    for (const cut of [whole.byteLength - 1, 24 + 50]) {
      assert.throws(() => Peaks.decode(whole.slice(0, cut)), /truncated \.peaks file/, `${bits}-bit, ${cut} bytes`)
    }
  }
})

test("won't encode a sample rate the format can't store", () => {
  const p = Peaks.from([0.1, 0.5, 0.2], { duration: 0.7 })
  assert.throws(() => p.encode(), /whole-number sample rates/)
})
