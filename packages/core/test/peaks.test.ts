// Checks the mipmap against a brute-force max.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Peaks } from '../src/peaks.ts'

const brute = (v: Float32Array, a: number, b: number) => { let m = 0; for (let i = Math.max(0, a); i < b && i < v.length; i++) m = Math.max(m, v[i]); return m }

test('every level matches a brute-force max, across chunked appends', () => {
  for (const n of [1, 2, 3, 5, 17, 1000, 4097, 100_003]) {
    const v = Float32Array.from({ length: n }, () => Math.random())
    const p = new Peaks({ sampleRate: 1, bucketSize: 1 })
    for (let i = 0; i < n; ) { const k = 1 + Math.floor(Math.random() * 3000); p.append(v.subarray(i, i + k)); i += k }
    assert.equal(p.length, n)
    assert.equal(p.max, brute(v, 0, n))
    for (const count of [1, 7, 400]) {
      const bars = p.bars(0, n, new Float32Array(count))
      // Bars split the level's cells between them; past one cell per bar, each reads the cell under its center.
      const per = n / count, k = Math.max(0, Math.floor(Math.log2(Math.max(1, per / 4)))), s = 2 ** k, cells = per / s
      let covered = 0
      for (let b = 0; b < count; b++) {
        const e = (i: number) => (i * per) / s
        const lo = cells < 1 ? Math.floor(e(b + 0.5)) : b === 0 ? 0 : Math.round(e(b))
        const hi = cells < 1 ? lo + 1 : Math.max(lo + 1, b === count - 1 ? Math.ceil(e(count)) : Math.round(e(b + 1)))
        assert.equal(bars[b], brute(v, lo * s, hi * s), `n=${n} count=${count} bar=${b}`)
        // No gaps between bars: every cell is read by some bar.
        if (cells >= 1) { assert.ok(lo <= covered, `gap before bar ${b}`); covered = Math.max(covered, hi) }
      }
      if (cells >= 1) assert.ok(covered * s >= n, 'the last cells are read')
      // The loudest value always shows, however the bars fall.
      assert.equal(Math.max(...bars), p.max)
    }
  }
})

test('the whole view at one bar equals the global max', () => {
  const v = Float32Array.from({ length: 12345 }, () => Math.random())
  const p = Peaks.from(v, { sampleRate: 100, bucketSize: 1 })
  assert.equal(p.peak(0, p.duration), p.max)
  assert.ok(p.complete)
})
