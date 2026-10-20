// One contender, one file, one fresh page. ?c=<contender>&file=<id>
//   sillon           @sillon/react parts over streamPeaks (WebCodecs in a worker), plus a
//                    preload=metadata <audio>, as usePlayer creates
//   sillon-fallback  the same, with the worker forced to report "unsupported", so it takes
//                    the fetch + decodeAudioData path
//   ws               wavesurfer.js 8.0.2 defaults: WaveSurfer.create({ url })
//   ws-peaks         wavesurfer.js with server-precomputed peaks + duration (its long-file advice);
//                    the peaks JSON fetch is timed, the server step is reported separately
//   naive            fetch + AudioContext.decodeAudioData + per-pixel peaks on the main thread
//   peaksjs          peaks.js 4.0.0 overview with precomputed data (`audiowaveform -b 8` layout,
//                    256 samples per pixel), its advice for long files; the .dat fetch is timed
//   peaksjs-webaudio peaks.js 4.0.0 overview with its Web Audio path: the whole file, decodeAudioData
//
// Times are milliseconds since navigation start, so each library's bundle load counts.
// "Presented" = the second requestAnimationFrame after the draw, i.e. the frame with the
// bars in it has been produced. Every contender uses the same definition.
// Each contender loads only its own code (dynamic imports), so bundle size counts as it would in an app.

const q = new URLSearchParams(location.search)
const c = q.get('c') ?? 'sillon'
const file = q.get('file') ?? 'd5m'
const url = `/audio/bench/${file}.mp3`
const W = 1200, H = 128
const el = document.getElementById('wave')!
const P = (window as any).__probe
const R: Record<string, any> = { c, file }
;(window as any).__r = R

const presented = () => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))))
// The runner stops sampling memory and CPU at "complete", then releases the accuracy pass.
const released = new Promise<void>((r) => ((window as any).__go = r))

function finishTiming() {
  P.stop = true
  const end = R.complete
  const long = P.long.filter(([s]: number[]) => s <= end)
  R.longtask = P.long.length || PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ? { tbt: long.reduce((s: number, [, d]: number[]) => s + Math.max(0, d - 50), 0), count: long.length, max: Math.max(0, ...long.map(([, d]: number[]) => d)) }
    : null
  const lags = P.lag.filter(([t]: number[]) => t <= end).map(([, l]: number[]) => l).sort((a: number, b: number) => a - b)
  R.lag = { max: lags.at(-1) ?? 0, p95: lags[Math.floor(lags.length * 0.95)] ?? 0, n: lags.length }
  const inp = [...P.input].sort((a, b) => a - b)
  R.input = { max: inp.at(-1) ?? null, p95: inp.length ? inp[Math.floor(inp.length * 0.95)] : null, n: inp.length }
  R.jsHeapMB = P.heap ? P.heap / 1048576 : null
  R.timing = true
}

/* ------------------------------------------------------------ accuracy */

// Ground truth: ffmpeg's max-abs over channels, 256 samples per bucket, gapless-trimmed.
// Everything is compared on a common time grid, so sample rates needn't match.
type Source = { duration: number; at: (t0: number, t1: number) => number }

function fromBuckets(values: Float32Array, sampleRate: number, bucket: number): Source {
  const per = bucket / sampleRate
  return {
    duration: values.length * per,
    at(t0, t1) {
      let m = 0
      for (let i = Math.floor(t0 / per), e = Math.min(values.length, Math.ceil(t1 / per)); i < e; i++) if (values[i] > m) m = values[i]
      return m
    },
  }
}

function fromBuffer(buf: AudioBuffer): Source {
  const ch = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k))
  return {
    duration: buf.duration,
    at(t0, t1) {
      let m = 0
      for (let i = Math.floor(t0 * buf.sampleRate), e = Math.min(buf.length, Math.ceil(t1 * buf.sampleRate)); i < e; i++)
        for (const x of ch) { const a = Math.abs(x[i]); if (a > m) m = a }
      return m
    },
  }
}

// Bins are whole groups of truth buckets, so the reference is exact in every bin
// and each contender is measured over exactly the same span of time.
const grid = (s: Source, bins: number, per: number) => Float64Array.from({ length: bins }, (_, k) => s.at(k * per, (k + 1) * per))
function corr(a: ArrayLike<number>, b: ArrayLike<number>, lag = 0) {
  let sa = 0, sb = 0, n = 0
  for (let i = Math.max(0, -lag); i < a.length && i + lag < b.length; i++) { sa += a[i]; sb += b[i + lag]; n++ }
  const ma = sa / n, mb = sb / n
  let num = 0, da = 0, db = 0
  for (let i = Math.max(0, -lag); i < a.length && i + lag < b.length; i++) { const x = a[i] - ma, y = b[i + lag] - mb; num += x * y; da += x * x; db += y * y }
  return num / Math.sqrt(da * db)
}

async function accuracy(src: Source) {
  const info = await (await fetch(`/truth/${file}.bin`)).arrayBuffer()
  const truthBuckets = new Float32Array(info)
  const sr = Number(q.get('sr') ?? 44100)
  const truth = fromBuckets(truthBuckets, sr, 256)
  const dur = truth.duration
  const out: Record<string, number> = { durationDelta: src.duration - dur }
  for (const n of [2000, 20000]) {
    const k = Math.max(1, Math.ceil(truthBuckets.length / n)), per = (k * 256) / sr
    const bins = Math.ceil(truthBuckets.length / k)
    const a = grid(truth, bins, per), b = grid(src, bins, per)
    let maxErr = 0, over = 0
    for (let i = 0; i < bins; i++) { const e = Math.abs(a[i] - b[i]); if (e > maxErr) maxErr = e; if (e > 0.02) over++ }
    out[`corr${n}`] = corr(a, b)
    out[`maxErr${n}`] = maxErr
    out[`over2pct${n}`] = over / bins
    out[`binMs${n}`] = per * 1000
    if (n === 20000 && q.has('dump')) R.dump = { a: Array.from(a), b: Array.from(b) }
    if (n === 20000) {
      // Best alignment within ±40 bins: a non-zero lag means the waveform is shifted in time.
      let best = 0, bestC = -2
      for (let lag = -40; lag <= 40; lag++) { const r = corr(a, b, lag); if (r > bestC) { bestC = r; best = lag } }
      out.lagMs = best * per * 1000
    }
  }
  R.accuracy = out
}

/* ------------------------------------------------------------ contenders */

async function sillon(forceFallback: boolean) {
  const [{ createElement }, { createRoot }, { streamPeaks }, { Waveform, WaveformStore }] = await Promise.all([
    import('react'), import('react-dom/client'), import('@sillon/core'), import('@sillon/react'),
  ])
  if (forceFallback) {
    // The library falls back when its worker reports "unsupported"; stand in for that worker.
    ;(window as any).Worker = class {
      onmessage: ((e: { data: unknown }) => void) | null = null
      onerror = null
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: { type: 'unsupported', reason: 'forced by benchmark' } })) }
      terminate() {}
    }
  }
  const audio = new Audio()
  audio.preload = 'metadata'
  audio.src = url
  const s = streamPeaks(url)
  const store = new WaveformStore()
  createRoot(el).render(
    createElement(Waveform.Root, { peaks: s.peaks, store, progressive: true, barWidth: 2, barGap: 1, style: { width: W, height: H } },
      createElement(Waveform.Shape, null, createElement(Waveform.Track, { style: { background: '#8a8a8a' } }))),
  )
  // First bars: the first time the clip path is rewritten after real data arrived.
  const firstDraw = new Promise<void>((resolve) => {
    const mo = new MutationObserver(() => { if (s.peaks.length > 0) { mo.disconnect(); resolve() } })
    const watch = () => {
      const path = el.querySelector('[data-sillon-shape] path')
      if (path) mo.observe(path, { attributes: true, attributeFilter: ['d'] })
      else requestAnimationFrame(watch)
    }
    watch()
  })
  firstDraw.then(presented).then((t) => (R.firstBars ??= t))
  // Streaming draws left to right, so "first bars" is a sliver. Also record when a
  // quarter, half and all of the timeline had data (not frame-presented; peaks arrival).
  const marks = [0.25, 0.5, 0.75]
  s.peaks.subscribe(() => {
    const f = s.peaks.duration ? s.peaks.loaded / s.peaks.duration : 0
    while (marks.length && f >= marks[0]) R[`drawn${marks.shift()! * 100}`] = performance.now()
  })
  const stats = await s.done
  R.method = stats.method
  // Bars sweep in after their data arrives: the whole waveform is on screen only once the sweep ends.
  while (store.state.revealed !== Infinity) await new Promise(requestAnimationFrame)
  R.complete = await presented()
  await firstDraw
  R.firstBars ??= R.complete
  finishTiming()
  await released
  R.drawnBars = el.querySelector('[data-sillon-shape] path')?.getAttribute('d')?.split('M').length ?? 0
  await accuracy(fromBuckets(s.peaks.toArray(), s.peaks.sampleRate, s.peaks.bucketSize))
}

async function ws(withPeaks: boolean) {
  const { default: WaveSurfer } = await import('wavesurfer.js')
  const opts: any = { container: el, url, height: H, barWidth: 2, barGap: 1, waveColor: '#8a8a8a', progressColor: '#444' }
  if (withPeaks) {
    const j = await (await fetch(`/peaks-ws/${file}.json`)).json()
    opts.peaks = j.peaks
    opts.duration = j.duration
  }
  const w = WaveSurfer.create(opts)
  await new Promise<void>((resolve, reject) => {
    w.on('error', (e: unknown) => reject(e))
    w.once('redrawcomplete', () => resolve())
  })
  R.complete = R.firstBars = await presented()
  R.method = withPeaks ? 'precomputed' : 'decodeAudioData@8kHz'
  finishTiming()
  await released
  if (!withPeaks) await accuracy(fromBuffer(w.getDecodedData()!))
}

async function naive() {
  const bytes = await (await fetch(url)).arrayBuffer()
  const ctx = new AudioContext()
  const buf = await ctx.decodeAudioData(bytes)
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  el.append(canvas)
  const g = canvas.getContext('2d')!
  g.fillStyle = '#8a8a8a'
  const ch = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k))
  const bars = Math.floor(W / 3), per = buf.length / bars
  for (let b = 0; b < bars; b++) {
    let m = 0
    for (let i = Math.floor(b * per), e = Math.floor((b + 1) * per); i < e; i++) for (const x of ch) { const a = Math.abs(x[i]); if (a > m) m = a }
    const h = Math.max(1, m * H)
    g.fillRect(b * 3, (H - h) / 2, 2, h)
  }
  R.complete = R.firstBars = await presented()
  R.method = `decodeAudioData@${buf.sampleRate}`
  finishTiming()
  await released
  await accuracy(fromBuffer(buf))
  void ctx.close()
}

async function peaksjs(webAudio: boolean) {
  const { default: Peaks } = await import('peaks.js')
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  document.body.append(audio)
  const ctx = webAudio ? new AudioContext() : null
  const opts: any = {
    overview: { container: el, waveformColor: '#8a8a8a', playedWaveformColor: '#444' },
    mediaElement: audio,
    ...(webAudio ? { webAudio: { audioContext: ctx, multiChannel: false } } : { dataUri: { arraybuffer: `/peaks-dat/${file}.dat` } }),
  }
  await new Promise<void>((resolve, reject) => Peaks.init(opts, (err: Error | null) => (err ? reject(err) : resolve())))
  R.complete = R.firstBars = await presented()
  R.method = webAudio ? `webaudio@${ctx!.sampleRate}` : 'precomputed'
  finishTiming()
  await released
  void ctx?.close()
}

const run = { sillon: () => sillon(false), 'sillon-fallback': () => sillon(true), ws: () => ws(false), 'ws-peaks': () => ws(true), naive, peaksjs: () => peaksjs(false), 'peaksjs-webaudio': () => peaksjs(true) }[c]
if (!run) R.error = `unknown contender ${c}`
else run().then(() => (R.done = true), (e) => { R.error = String(e?.message ?? e); R.done = true; if (!R.timing) { R.complete ??= null; finishTiming() } })
