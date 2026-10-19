// Decode benchmark harness. ?impl=ours|wavesurfer&file=podcast-60m
import WaveSurfer from 'wavesurfer.js'

const q = new URLSearchParams(location.search)
const impl = q.get('impl') ?? 'ours'
const url = `/audio/${q.get('file') ?? 'podcast-5m'}.mp3`
const W = 1200, H = 128
const t0 = performance.now()
const afterPaint = () => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t0))))
const result: Record<string, unknown> = { impl, url }
;(window as any).__result = result

if (impl === 'wavesurfer') {
  const ws = WaveSurfer.create({ container: '#wave', url, height: H, barWidth: 2, barGap: 1, waveColor: '#a78bfa', progressColor: '#ec4899' })
  ws.on('error', (e) => { result.error = String(e); result.done = true })
  ws.once('ready', async () => {
    result.firstPaint = await afterPaint()
    result.complete = result.firstPaint
    result.duration = ws.getDuration()
    result.done = true
  })
} else {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  document.getElementById('wave')!.append(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#a78bfa'
  let est = 0
  let all: { mins: Float32Array; maxs: Float32Array }[] = []
  // Progressive draw: each message paints just the columns it covers.
  const drawRange = (from: number, mins: Float32Array, maxs: Float32Array) => {
    const perPx = est / W
    for (let k = 0; k < mins.length; k += Math.max(1, Math.floor(perPx / 4))) {
      const x = Math.floor((from + k) / perPx)
      const y0 = (1 - maxs[k]) * H / 2, y1 = (1 - mins[k]) * H / 2
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }
  }
  const worker = new Worker(new URL('./peaks-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = async (e) => {
    const m = e.data
    if (m.type === 'peaks') {
      est = m.estBuckets
      all.push({ mins: m.mins, maxs: m.maxs })
      drawRange(m.from, m.mins, m.maxs)
      if (!result.firstPaint) result.firstPaint = await afterPaint()
    } else if (m.type === 'stats') {
      result.complete = await afterPaint()
      Object.assign(result, { worker: m })
      // Coarse 2000-bucket max-abs envelope for correctness checks against ffmpeg.
      const total = all.reduce((s, c) => s + c.mins.length, 0)
      const env = new Array(2000).fill(0)
      let i = 0
      for (const c of all) for (let k = 0; k < c.mins.length; k++, i++) {
        const b = Math.min(1999, Math.floor((i / total) * 2000))
        env[b] = Math.max(env[b], Math.abs(c.mins[k]), Math.abs(c.maxs[k]))
      }
      result.envelope = env
      if (q.has('raw')) result.raw = all.flatMap((c) => Array.from(c.maxs, (x, k) => Math.max(x, -c.mins[k])))
      result.done = true
    } else if (m.type === 'error') { result.error = m.message; result.done = true }
  }
  worker.postMessage({ url, bucketSize: 128, postEveryMs: 100 })
}
