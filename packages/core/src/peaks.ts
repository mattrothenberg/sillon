// A growable max-abs mipmap. Level 0 holds one value per `bucketSize`
// samples; level k holds one value per 2^k level-0 buckets. Reading any view
// (the whole hour, or five seconds of it) touches about one value per bar.

export interface PeaksInit {
  /** Samples per second of the source audio. */
  sampleRate: number
  /** Samples per level-0 bucket. */
  bucketSize: number
  /** Level-0 buckets expected in total, if known up front (lets a streaming waveform fill left to right). */
  expected?: number
}

/**
 * How `Peaks.from` places its values in time: the audio's sample rate and the
 * samples behind each value, or just the audio's duration (as wavesurfer.js's
 * `peaks` and `duration` options do), which spreads the values evenly across it.
 */
export type PeaksFromInit = { sampleRate: number; bucketSize: number } | { duration: number }

type Listener = () => void

// A compact file for peaks made ahead of time, for audio long enough that
// decoding it in the browser isn't worth it. Little-endian:
//
//   0   'SLPK'
//   4   u8   version (1)
//   5   u8   bits per value (8 or 16)
//   6   u16  reserved
//   8   u32  sample rate
//   12  u32  samples per value (the bucket size)
//   16  u32  number of values
//   20  f32  scale: the loudest value; stored values are fractions of it
//   24  values, u8 or u16
//
// An hour at 44.1 kHz with 512 samples per value is about 310,000 values:
// 300 kB at 8 bits, which zooms to about five seconds across a page-wide waveform.
const MAGIC = 0x4b504c53 // 'SLPK'
const HEADER = 24

export interface EncodeOptions {
  /** 8 (default) or 16 bits per value. */
  bits?: 8 | 16
}

/**
 * The loudness of a recording over time: the largest absolute sample in each
 * bucket of `bucketSize` samples, across channels (0 silent, 1 full scale, not
 * normalized). Grows as values are appended, and reads any range at any number
 * of bars by touching only a few values per bar.
 */
export class Peaks {
  /** Samples per second of the source audio. */
  sampleRate: number
  /** Samples per level-0 bucket. Set at construction, or by `begin` before any values arrive. */
  bucketSize: number
  /** Loudest value seen so far, for normalizing. */
  max = 0
  /** True once every bucket has arrived. */
  complete = false
  /** Bumped on every change, so renderers can skip redundant work. */
  version = 0

  private levels: Float32Array[] = [new Float32Array(1024)]
  private counts: number[] = [0]
  private expectedBuckets: number
  // Set by `Peaks.from` with a duration, so `duration` reads back exactly what was given.
  private exactDuration: number | null = null
  private listeners = new Set<Listener>()

  constructor(init: PeaksInit) {
    this.sampleRate = init.sampleRate
    this.bucketSize = init.bucketSize
    this.expectedBuckets = init.expected ?? 0
  }

  /**
   * Wraps values you already have (from a server, a cache, `toArray()`, or
   * wavesurfer.js's `exportPeaks()`), already complete. `values` is one array,
   * or one per channel; values may be signed, and each bucket keeps the largest
   * absolute value across channels. Place them with `{ sampleRate, bucketSize }`,
   * or with `{ duration }` in seconds, which spreads them evenly over it.
   */
  static from(values: ArrayLike<number> | readonly ArrayLike<number>[], init: PeaksFromInit): Peaks {
    const channels: readonly ArrayLike<number>[] = isChannels(values) ? values : [values]
    const n = channels.reduce((m, c) => Math.max(m, c.length), 0)
    const merged = new Float32Array(n)
    for (const c of channels) {
      for (let i = 0; i < c.length; i++) {
        const v = Math.abs(c[i])
        if (v > merged[i]) merged[i] = v
      }
    }
    const byDuration = 'duration' in init
    if (byDuration && !(init.duration > 0)) throw new Error(`Peaks.from: duration must be positive, not ${init.duration}`)
    const p = byDuration ? new Peaks({ sampleRate: n / init.duration, bucketSize: 1 }) : new Peaks(init)
    p.append(merged)
    p.finish()
    if (byDuration) p.exactDuration = init.duration
    return p
  }

  /** Level-0 buckets received so far. */
  get length(): number {
    return this.counts[0]
  }

  /** Level-0 buckets the waveform spans: the expected total while streaming, the real total after. */
  get span(): number {
    return this.complete ? this.counts[0] : Math.max(this.counts[0], this.expectedBuckets)
  }

  /** Seconds the waveform spans (an estimate until `complete`). */
  get duration(): number {
    if (this.exactDuration !== null && this.complete) return this.exactDuration
    return (this.span * this.bucketSize) / this.sampleRate
  }

  /** Seconds decoded so far. */
  get loaded(): number {
    if (this.exactDuration !== null && this.complete) return this.exactDuration
    return (this.counts[0] * this.bucketSize) / this.sampleRate
  }

  /** Called by a stream once it knows the format. Only valid before the first `append`. */
  begin(sampleRate: number, expected: number, bucketSize = this.bucketSize): void {
    this.sampleRate = sampleRate
    this.bucketSize = bucketSize
    this.expectedBuckets = expected
    this.exactDuration = null
    this.emit()
  }

  /** Adds values to the end and notifies subscribers. */
  append(values: ArrayLike<number>): void {
    const len = values.length
    if (!len) return
    const from = this.counts[0]
    const total = from + len
    let base = this.grow(0, total)
    for (let i = 0; i < len; i++) {
      const v = values[i]
      base[from + i] = v
      if (v > this.max) this.max = v
    }
    this.counts[0] = total
    // Rebuild only the cells the new buckets touch, one level at a time,
    // up to the first level that is a single cell spanning everything.
    let lo = from, n = total
    for (let k = 1; n > 1; k++) {
      if (k === this.levels.length) {
        this.levels.push(new Float32Array(16))
        this.counts.push(0)
        lo = 0 // a new level starts empty, so fill all of it
      }
      const below = this.levels[k - 1]
      const cells = (n + 1) >> 1
      const level = this.grow(k, cells)
      for (let j = lo >> 1; j < cells; j++) {
        const a = below[2 * j], b = 2 * j + 1 < n ? below[2 * j + 1] : 0
        level[j] = a > b ? a : b
      }
      this.counts[k] = cells
      lo >>= 1
      n = cells
    }
    this.emit()
  }

  private grow(k: number, size: number): Float32Array {
    let level = this.levels[k]
    if (size > level.length) {
      const grown = new Float32Array(Math.max(size, level.length * 2))
      grown.set(level)
      this.levels[k] = level = grown
    }
    return level
  }

  /** Marks the peaks complete and notifies subscribers. */
  finish(): void {
    this.complete = true
    this.emit()
  }

  /**
   * Fills `out` with one max-abs value per bar for the time range
   * [start, end) in seconds. Bars past what has loaded read as 0.
   */
  bars(start: number, end: number, out: Float32Array): Float32Array {
    const count = out.length
    const a = (start * this.sampleRate) / this.bucketSize
    const b = (end * this.sampleRate) / this.bucketSize
    const perBar = (b - a) / count
    // A level fine enough that each bar covers at least four cells, so the
    // split between bars lands within an eighth of a bar of where it should.
    const k = Math.max(0, Math.min(this.levels.length - 1, Math.floor(Math.log2(Math.max(1, perBar / 4)))))
    const level = this.levels[k]
    const n = this.counts[k]
    const scale = 2 ** k
    const cells = perBar / scale
    for (let bar = 0; bar < count; bar++) {
      // Every cell belongs to exactly one bar: neighbors never share a value,
      // and no peak falls between two bars.
      // Zoomed past one cell per bar, each bar shows the cell under its center.
      // The view's own two ends round outward, so a partial cell there still shows.
      const edge = (i: number) => (a + i * perBar) / scale
      const lo = cells < 1 ? Math.floor(edge(bar + 0.5)) : bar === 0 ? Math.floor(edge(0)) : Math.round(edge(bar))
      const hi = cells < 1 ? lo + 1 : Math.max(lo + 1, bar === count - 1 ? Math.ceil(edge(count)) : Math.round(edge(bar + 1)))
      let m = 0
      for (let i = Math.max(0, lo); i < hi && i < n; i++) if (level[i] > m) m = level[i]
      out[bar] = m
    }
    return out
  }

  /** Max-abs value over a time range, in seconds. */
  peak(start: number, end: number): number {
    return this.bars(start, end, new Float32Array(1))[0]
  }

  /**
   * Packs the level-0 values into the `.peaks` format, for peaks made ahead of
   * time. The format stores the sample rate and bucket size as whole numbers, so
   * peaks made with `Peaks.from(values, { duration })` can't be encoded: make
   * them with `{ sampleRate, bucketSize }` instead.
   */
  encode({ bits = 8 }: EncodeOptions = {}): ArrayBuffer {
    if (!isU32(this.sampleRate) || !isU32(this.bucketSize)) {
      throw new Error(
        `encode: .peaks files store whole-number sample rates and bucket sizes, not ${this.sampleRate} and ${this.bucketSize}. ` +
          'Make the peaks with Peaks.from(values, { sampleRate, bucketSize }) to encode them.',
      )
    }
    const values = this.toArray()
    const top = bits === 8 ? 255 : 65535
    const buf = new ArrayBuffer(HEADER + values.length * (bits / 8))
    const v = new DataView(buf)
    v.setUint32(0, MAGIC, true)
    v.setUint8(4, 1)
    v.setUint8(5, bits)
    v.setUint32(8, this.sampleRate, true)
    v.setUint32(12, this.bucketSize, true)
    v.setUint32(16, values.length, true)
    v.setFloat32(20, this.max, true)
    const out = bits === 8 ? new Uint8Array(buf, HEADER) : new Uint16Array(buf, HEADER)
    const k = this.max > 0 ? top / this.max : 0
    // Round up, so a quiet but nonzero value never reads as silence.
    for (let i = 0; i < values.length; i++) out[i] = Math.min(top, Math.ceil(values[i] * k))
    return buf
  }

  /** Reads a `.peaks` file into `into` (which must be empty), or a new Peaks. */
  static decode(buf: ArrayBuffer, into?: Peaks): Peaks {
    const v = new DataView(buf)
    if (buf.byteLength < HEADER || v.getUint32(0, true) !== MAGIC) throw new Error('not a .peaks file')
    if (v.getUint8(4) !== 1) throw new Error(`.peaks version ${v.getUint8(4)} is not supported`)
    const bits = v.getUint8(5)
    if (bits !== 8 && bits !== 16) throw new Error(`.peaks with ${bits}-bit values is not supported`)
    const sampleRate = v.getUint32(8, true), bucketSize = v.getUint32(12, true), count = v.getUint32(16, true)
    const needed = HEADER + count * (bits / 8)
    if (buf.byteLength < needed) throw new Error(`truncated .peaks file: ${count} values need ${needed} bytes, got ${buf.byteLength}`)
    const scale = v.getFloat32(20, true) / (bits === 8 ? 255 : 65535)
    // Copied out, so the values are aligned whatever the buffer's offset.
    const raw = bits === 8 ? new Uint8Array(buf.slice(HEADER, HEADER + count)) : new Uint16Array(buf.slice(HEADER, HEADER + count * 2))
    const peaks = into ?? new Peaks({ sampleRate, bucketSize })
    peaks.begin(sampleRate, count, bucketSize)
    peaks.append(Float32Array.from(raw, (x) => x * scale))
    peaks.finish()
    return peaks
  }

  /** The level-0 values as a plain array, for caching or sending elsewhere. */
  toArray(): Float32Array {
    return this.levels[0].slice(0, this.counts[0])
  }

  /** Calls `listener` on every change. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.version++
    for (const l of this.listeners) l()
  }
}

/** An array of channels rather than one channel: its first element is itself array-like. */
const isChannels = (v: ArrayLike<number> | readonly ArrayLike<number>[]): v is readonly ArrayLike<number>[] =>
  v.length > 0 && typeof (v as ArrayLike<unknown>)[0] === 'object'

const isU32 = (x: number) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff
