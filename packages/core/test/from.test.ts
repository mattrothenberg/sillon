// Peaks.from with wavesurfer.js-style input: signed values, one array per channel, a duration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Peaks } from '../src/peaks.ts'

test('signed values become their absolute value', () => {
  const p = Peaks.from([-0.5, 0.25, -1, 0], { sampleRate: 4, bucketSize: 1 })
  assert.deepEqual([...p.toArray()], [0.5, 0.25, 1, 0])
  assert.equal(p.max, 1)
})

test('channels merge to the largest absolute value per bucket', () => {
  const left = [0.1, -0.8, 0.3]
  const right = [-0.4, 0.2, 0.3, 0.6] // one value longer: missing left values count as 0
  const p = Peaks.from([left, right], { sampleRate: 8, bucketSize: 2 })
  assert.deepEqual([...p.toArray()].map((v) => +v.toFixed(6)), [0.4, 0.8, 0.3, 0.6])
  assert.ok(p.complete)
})

test('a duration spreads the values over it, and reads back exactly', () => {
  for (const [n, duration] of [[3, 0.1], [1000, 213.7], [7, 1 / 3]] as const) {
    const values = Array.from({ length: n }, (_, i) => Math.sin(i))
    const p = Peaks.from(values, { duration })
    assert.equal(p.duration, duration)
    assert.equal(p.loaded, duration)
    assert.equal(p.length, n)
    // The whole duration at one bar per value reads every value back in order (to float32 precision).
    const bars = p.bars(0, duration, new Float32Array(n))
    bars.forEach((v, i) => assert.ok(Math.abs(v - Math.abs(values[i])) < 1e-6, `bar ${i}: ${v} vs ${values[i]}`))
  }
})

test('a duration must be positive', () => {
  assert.throws(() => Peaks.from([0.1], { duration: 0 }), /duration must be positive/)
})

test('empty input gives empty, complete peaks', () => {
  const p = Peaks.from([], { sampleRate: 44100, bucketSize: 256 })
  assert.equal(p.length, 0)
  assert.ok(p.complete)
})
