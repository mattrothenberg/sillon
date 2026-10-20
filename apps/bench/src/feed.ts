// A feed: 20 waveforms of 20 different 3-minute files on one page, like a list of
// episodes or tracks. ?c=<contender>. Each item gets what a real list item needs:
// a waveform and something that can play it.
//   sillon           one useAudio() per item, library defaults (draws each waveform once its file is read)
//   ws               one WaveSurfer.create({ url }) per item, defaults
//   ws-peaks         wavesurfer.js with precomputed 8000-point peaks + duration per item
//   peaksjs          peaks.js overview per item with precomputed .dat data
//   peaksjs-webaudio peaks.js overview per item with its Web Audio path (one shared AudioContext)
// "complete" = every waveform drawn (second rAF after the last one). Same probes as compare.ts.

const q = new URLSearchParams(location.search)
const c = q.get('c') ?? 'sillon'
const N = 20, W = 1000, H = 40
const ids = Array.from({ length: N }, (_, i) => `f${String(i).padStart(2, '0')}`)
const feed = document.getElementById('feed')!
const slots = ids.map(() => feed.appendChild(document.createElement('div')))
const P = (window as any).__probe
const R: Record<string, any> = { c, file: 'feed20' }
;(window as any).__r = R

const presented = () => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))))
const released = new Promise<void>((r) => ((window as any).__go = r))

function finishTiming() {
  P.stop = true
  const end = R.complete
  const long = P.long.filter(([s]: number[]) => s <= end)
  R.longtask = { tbt: long.reduce((s: number, [, d]: number[]) => s + Math.max(0, d - 50), 0), count: long.length, max: Math.max(0, ...long.map(([, d]: number[]) => d)) }
  const lags = P.lag.filter(([t]: number[]) => t <= end).map(([, l]: number[]) => l).sort((a: number, b: number) => a - b)
  R.lag = { max: lags.at(-1) ?? 0, p95: lags[Math.floor(lags.length * 0.95)] ?? 0, n: lags.length }
  const inp = [...P.input].sort((a, b) => a - b)
  R.input = { max: inp.at(-1) ?? null, p95: inp.length ? inp[Math.floor(inp.length * 0.95)] : null, n: inp.length }
  R.jsHeapMB = P.heap ? P.heap / 1048576 : null
  R.timing = true
}

async function sillon() {
  const [{ createElement: h }, { createRoot }, { Waveform, useAudio, usePeaks }] = await Promise.all([import('react'), import('react-dom/client'), import('@sillon/react')])
  // ?noplayer: peaks only, no <audio> elements, to see what the players' own requests cost.
  function Bare({ url }: { url: string }) {
    const { peaks } = usePeaks(url)
    return h(Waveform.Root, { peaks, barWidth: 2, barGap: 1, style: { width: W, height: H } }, h(Waveform.Shape, null, h(Waveform.Track, { style: { background: '#8a8a8a' } })))
  }
  function Item({ url }: { url: string }) {
    if (q.has('noplayer')) return h(Bare, { url })
    const { peaks, player } = useAudio(url)
    return h(Waveform.Root, { peaks, player, barWidth: 2, barGap: 1, style: { width: W, height: H } },
      h(Waveform.Shape, null, h(Waveform.Track, { style: { background: '#8a8a8a' } }), h(Waveform.Progress, { style: { background: '#444' } })))
  }
  createRoot(feed).render(ids.map((id) => h(Item, { key: id, url: `/audio/bench/${id}.mp3` })))
  // Done when every Root is ready and its bars are in the shape's path.
  for (;;) {
    const ready = feed.querySelectorAll('[data-state="ready"] [data-sillon-shape] path')
    if (ready.length === N && [...ready].every((p) => (p.getAttribute('d') ?? '').length > 0)) break
    await new Promise(requestAnimationFrame)
  }
  R.complete = await presented()
  R.method = 'useAudio'
  finishTiming()
  await released
}

async function ws(withPeaks: boolean) {
  const { default: WaveSurfer } = await import('wavesurfer.js')
  await Promise.all(ids.map(async (id, i) => {
    const opts: any = { container: slots[i], url: `/audio/bench/${id}.mp3`, height: H, barWidth: 2, barGap: 1, waveColor: '#8a8a8a', progressColor: '#444' }
    if (withPeaks) {
      const j = await (await fetch(`/peaks-ws/${id}.json`)).json()
      opts.peaks = j.peaks
      opts.duration = j.duration
    }
    const w = WaveSurfer.create(opts)
    await new Promise<void>((resolve, reject) => { w.on('error', (e: unknown) => reject(e)); w.once('redrawcomplete', () => resolve()) })
  }))
  R.complete = await presented()
  R.method = withPeaks ? 'precomputed' : 'decodeAudioData@8kHz'
  finishTiming()
  await released
}

async function peaksjs(webAudio: boolean) {
  const { default: Peaks } = await import('peaks.js')
  const ctx = webAudio ? new AudioContext() : null
  await Promise.all(ids.map((id, i) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = `/audio/bench/${id}.mp3`
    document.body.append(audio)
    const opts: any = {
      overview: { container: slots[i], waveformColor: '#8a8a8a', playedWaveformColor: '#444' },
      mediaElement: audio,
      ...(webAudio ? { webAudio: { audioContext: ctx, multiChannel: false } } : { dataUri: { arraybuffer: `/peaks-dat/${id}.dat` } }),
    }
    return new Promise<void>((resolve, reject) => Peaks.init(opts, (err: Error | null) => (err ? reject(err) : resolve())))
  }))
  R.complete = await presented()
  R.method = webAudio ? `webaudio@${ctx!.sampleRate}` : 'precomputed'
  finishTiming()
  await released
}

const run = { sillon, ws: () => ws(false), 'ws-peaks': () => ws(true), peaksjs: () => peaksjs(false), 'peaksjs-webaudio': () => peaksjs(true) }[c]
if (!run) R.error = `unknown contender ${c}`
else run().then(() => (R.done = true), (e) => { R.error = String(e?.message ?? e); R.done = true; if (!R.timing) { R.complete ??= null; finishTiming() } })
