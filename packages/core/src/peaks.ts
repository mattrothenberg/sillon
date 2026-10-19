// A growable max-abs mipmap. Level 0 holds one value per `bucketSize`
// samples; level k holds one value per 2^k level-0 buckets. Reading any view
// (the whole hour, or five seconds of it) touches about one value per bar.

export interface PeaksInit {
  sampleRate: number
  /** Samples per level-0 bucket. */
  bucketSize: number
  /** Level-0 buckets expected in total, if known up front (lets a streaming waveform fill left to right). */
  expected?: number
}

type Listener = () => void

export class Peaks {
  sampleRate: number
  readonly bucketSize: number
  /** Loudest value seen so far, for normalising. */
  max = 0
  /** True once every bucket has arrived. */
  complete = false
  /** Bumped on every change, so renderers can skip redundant work. */
  version = 0

  private levels: Float32Array[] = [new Float32Array(1024)]
  private counts: number[] = [0]
  private expectedBuckets: number
  private listeners = new Set<Listener>()

  constructor(init: PeaksInit) {
    this.sampleRate = init.sampleRate
    this.bucketSize = init.bucketSize
    this.expectedBuckets = init.expected ?? 0
  }

  /** Wrap precomputed max-abs values (from a server, a cache, or `toArray()`). */
  static from(values: ArrayLike<number>, init: Omit<PeaksInit, 'expected'>): Peaks {
    const p = new Peaks(init)
    p.append(values)
    p.finish()
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
    return (this.span * this.bucketSize) / this.sampleRate
  }

  /** Seconds decoded so far. */
  get loaded(): number {
    return (this.counts[0] * this.bucketSize) / this.sampleRate
  }

  /** Called by a stream once it knows the format. Only valid before the first `append`. */
  begin(sampleRate: number, expected: number): void {
    this.sampleRate = sampleRate
    this.expectedBuckets = expected
    this.emit()
  }

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
      // Every cell belongs to exactly one bar: neighbours never share a value
      // (which drew them in matching pairs), and no peak falls between two bars.
      // Zoomed past one cell per bar, each bar shows the cell under its centre.
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

  /** The level-0 values as a plain array, for caching or sending elsewhere. */
  toArray(): Float32Array {
    return this.levels[0].slice(0, this.counts[0])
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.version++
    for (const l of this.listeners) l()
  }
}
