// Runtime benchmark: what each library costs after loading. ?c=sillon|ws&scenario=playback|zoom|resize
// Both draw the same 1-hour file from the same precomputed data (ffmpeg's 256-sample max-abs
// peaks), so no decoding happens here. The runner reads Chromium's main-thread counters
// (Performance.getMetrics) around window.__start(), which runs one scenario for MS milliseconds:
//   playback  the audio plays (muted); the played part and cursor follow it
//   zoom      the view sweeps from the whole hour down to 5 seconds around 30:00 and back
//   resize    the container's width swings between 600 and 1200 px every frame
// sillon redraws are counts of its clip path changing; wavesurfer's are its 'redrawcomplete' events.

const q = new URLSearchParams(location.search)
const c = q.get('c') ?? 'sillon'
const scenario = q.get('scenario') ?? 'playback'
const MS = Number(q.get('ms') ?? 8000)
const W = 1200, H = 128, SR = 44100, BUCKET = 256
const url = '/audio/bench/d1h.mp3'
const box = document.getElementById('box')!
const el = document.getElementById('wave')!
const R: Record<string, any> = { c, scenario }
;(window as any).__r = R

const values = new Float32Array(await (await fetch('/truth/d1h.bin')).arrayBuffer())
const duration = (values.length * BUCKET) / SR

interface Contender { play(): Promise<void>; view(start: number, end: number): void; redraws(): number; time(): number }

async function sillon(): Promise<Contender> {
  const [{ createElement: h }, { createRoot }, { Waveform, WaveformStore, Peaks, createPlayer }] = await Promise.all([
    import('react'), import('react-dom/client'), import('@sillon/react'),
  ])
  const peaks = Peaks.from(values, { sampleRate: SR, bucketSize: BUCKET })
  const player = createPlayer(url)
  player.audio.muted = true
  const store = new WaveformStore()
  createRoot(el).render(
    h(Waveform.Root, { peaks, player, store, barWidth: 2, barGap: 1, style: { width: '100%', height: H } },
      h(Waveform.Shape, null, h(Waveform.Track, { style: { background: '#8a8a8a' } }), h(Waveform.Progress, { style: { background: '#444' } })),
      h(Waveform.Cursor, { style: { width: 1, background: '#333' } })),
  )
  while (!el.querySelector('[data-state="ready"] [data-sillon-shape] path')?.getAttribute('d')) await new Promise(requestAnimationFrame)
  let redraws = 0
  new MutationObserver((m) => (redraws += m.length)).observe(el.querySelector('[data-sillon-shape] path')!, { attributes: true, attributeFilter: ['d'] })
  return {
    play: () => player.play(),
    view: (a, b) => store.setView(a, b),
    redraws: () => redraws,
    time: () => player.audio.currentTime,
  }
}

async function ws(): Promise<Contender> {
  const { default: WaveSurfer } = await import('wavesurfer.js')
  const w = WaveSurfer.create({ container: el, url, peaks: [values], duration, height: H, barWidth: 2, barGap: 1, waveColor: '#8a8a8a', progressColor: '#444', cursorColor: '#333', cursorWidth: 1 })
  await new Promise<void>((resolve, reject) => { w.on('error', (e: unknown) => reject(e)); w.once('redrawcomplete', () => resolve()) })
  w.setMuted(true)
  let redraws = 0
  w.on('redrawcomplete', () => redraws++)
  return {
    play: () => w.play(),
    // wavesurfer's view is a zoom (pixels per second) plus a scroll position.
    view: (a, b) => { w.zoom(el.clientWidth / (b - a)); w.setScrollTime(a) },
    redraws: () => redraws,
    time: () => w.getCurrentTime(),
  }
}

const make = { sillon, ws }[c]
if (!make) { R.error = `unknown contender ${c}`; R.ready = true }
const it = await make!()
await new Promise((r) => setTimeout(r, 500))

;(window as any).__start = async () => {
  if (scenario === 'playback') await it.play()
  const t0 = it.time(), r0 = it.redraws(), c0 = (window as any).__commits
  const deltas: number[] = []
  const start = performance.now()
  let last = start
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      const t = (now - start) / MS
      if (scenario === 'zoom') {
        // Whole hour → 5 s → whole hour, on a log scale, centered at 30:00.
        const span = duration * Math.pow(5 / duration, (1 - Math.cos(t * Math.PI * 2)) / 2)
        const a = Math.max(0, duration / 2 - span / 2)
        it.view(a, a + span)
      } else if (scenario === 'resize') {
        box.style.width = `${Math.round(900 + 300 * Math.sin(t * Math.PI * 2 * 4))}px`
      }
      if (now - start < MS) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  const elapsed = performance.now() - start
  deltas.shift()
  const s = [...deltas].sort((a, b) => a - b), pct = (p: number) => s[Math.floor(p * (s.length - 1))]
  const median = pct(0.5)
  Object.assign(R, {
    elapsed, frames: deltas.length, fps: deltas.length / (elapsed / 1000),
    frameP50: median, frameP95: pct(0.95), frameP99: pct(0.99), frameMax: s.at(-1),
    slowFrames: deltas.filter((d) => d > median * 1.5).length / deltas.length,
    redraws: it.redraws() - r0,
    commits: c === 'sillon' ? (window as any).__commits - c0 : null,
    played: scenario === 'playback' ? it.time() - t0 : null,
  })
}
R.ready = true
