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

test('rejects anything else', () => {
  assert.throws(() => Peaks.decode(new ArrayBuffer(24)), /not a .peaks file/)
})
