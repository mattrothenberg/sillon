// Decode lab: where does the time go for one short file? ?file=f00&reps=5
// Each variant runs `reps` times on the same bytes (already fetched), in this order,
// after one warm-up. Results land in window.__lab.
import type { LabJob, LabResult } from './lab-worker'
import { streamPeaks } from '@sillon/core'

const q = new URLSearchParams(location.search)
const file = q.get('file') ?? 'f00'
const reps = Number(q.get('reps') ?? 5)
const url = `/audio/bench/${file}.mp3`
const out: Record<string, number[] | unknown> = {}
;(window as any).__lab = out

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

function inWorker(job: Omit<LabJob, 'bytes'>, bytes: ArrayBuffer) {
  return new Promise<LabResult>((resolve) => {
    const w = new Worker(new URL('./lab-worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => { w.terminate(); resolve(e.data) }
    w.postMessage({ ...job, bytes: bytes.slice(0) })
  })
}

async function dad(bytes: ArrayBuffer, rate: number) {
  const t0 = performance.now()
  const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.slice(0))
  const decoded = performance.now() - t0
  const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  let peaks = 0
  for (let b = 0; b < buf.length; b += 256) {
    let m = 0
    for (const ch of chs) for (let i = b, e = Math.min(buf.length, b + 256); i < e; i++) { const v = Math.abs(ch[i]); if (v > m) m = v }
    if (m >= 0) peaks++
  }
  return { ms: performance.now() - t0, decoded }
}

async function go() {
  const t0 = performance.now()
  const bytes = await (await fetch(url)).arrayBuffer()
  out.fetchMs = performance.now() - t0
  const variants: [string, () => Promise<number>][] = [
    ['library streamPeaks (fetch included)', async () => { const t = performance.now(); await streamPeaks(url).done; return performance.now() - t }],
    ['wc 1 frame/chunk, none', async () => (await inWorker({ frames: 1, work: 'none', queue: 32 }, bytes)).ms],
    ['wc 1 frame/chunk, copy', async () => (await inWorker({ frames: 1, work: 'copy', queue: 32 }, bytes)).ms],
    ['wc 1 frame/chunk, peaks', async () => (await inWorker({ frames: 1, work: 'peaks', queue: 32 }, bytes)).ms],
    ['wc 1 frame/chunk, peaks, queue 1024', async () => (await inWorker({ frames: 1, work: 'peaks', queue: 1024 }, bytes)).ms],
    ['wc 16 frames/chunk, peaks, queue 1024', async () => (await inWorker({ frames: 16, work: 'peaks', queue: 1024 }, bytes)).ms],
    ['decodeAudioData 44.1k + peaks', async () => (await dad(bytes, 44100)).ms],
    ['decodeAudioData 8k + peaks', async () => (await dad(bytes, 8000)).ms],
  ]
  // Sample counts, to check that multi-frame chunks decode every frame.
  out.check = { one: await inWorker({ frames: 1, work: 'none', queue: 1024 }, bytes), sixteen: await inWorker({ frames: 16, work: 'none', queue: 1024 }, bytes) }
  for (const [name, f] of variants) {
    await f() // warm-up
    const xs: number[] = []
    for (let i = 0; i < reps; i++) xs.push(await f())
    out[name] = Math.round(median(xs))
  }
  out.done = true
}
go().catch((e) => { out.error = String(e); out.done = true })
