// Streams an MP3 over fetch, decodes it frame-by-frame with WebCodecs, and
// reduces samples to min/max buckets as they arrive. Never holds PCM for more
// than one frame, so memory is O(peaks), not O(audio).
import { parseHeader, id3Size, parseGapless } from '@sillon/core/mp3'

// Every MPEG Layer III decoder adds this many samples of latency.
const DECODER_DELAY = 529

interface Start { url: string; bucketSize: number; postEveryMs: number; debug?: boolean }

self.onmessage = async (e: MessageEvent<Start>) => {
  const { url, bucketSize, postEveryMs, debug } = e.data
  const dbg: number[] = []
  const t0 = performance.now()
  const res = await fetch(url)
  const totalBytes = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body!.getReader()

  let pending = new Uint8Array(0)
  let toSkip = -1
  let decoder: AudioDecoder | null = null
  let timestamp = 0
  let estBuckets = 0

  let cap = 1 << 16
  let mins = new Float32Array(cap)
  let maxs = new Float32Array(cap)
  let n = 0
  let curMin = Infinity, curMax = -Infinity, curCount = 0
  let scratch = new Float32Array(1152 * 2)
  let posted = 0, lastPost = 0, firstPostAt = 0, samplesOut = 0, sampleRate = 0
  // Gapless trimming: drop priming samples at the start, padding at the end.
  let skip = 0, limit = Infinity

  const push = (mn: number, mx: number) => {
    if (n === cap) {
      cap *= 2
      const a = new Float32Array(cap); a.set(mins); mins = a
      const b = new Float32Array(cap); b.set(maxs); maxs = b
    }
    mins[n] = mn; maxs[n] = mx; n++
  }

  const post = (done: boolean) => {
    const m = mins.slice(posted, n), x = maxs.slice(posted, n)
    self.postMessage({ type: 'peaks', from: posted, mins: m, maxs: x, estBuckets, done }, [m.buffer, x.buffer] as any)
    if (!firstPostAt) firstPostAt = performance.now() - t0
    posted = n
    lastPost = performance.now()
  }

  const onOutput = (ad: AudioData) => {
    const frames = ad.numberOfFrames, ch = ad.numberOfChannels
    if (scratch.length < frames * ch) scratch = new Float32Array(frames * ch)
    for (let c = 0; c < ch; c++) ad.copyTo(scratch.subarray(c * frames, (c + 1) * frames), { planeIndex: c, format: 'f32-planar' })
    if (debug) { let m = 0; for (let k = 0; k < frames * ch; k++) { const a = Math.abs(scratch[k]); if (a > m) m = a } dbg.push(ad.timestamp, frames, m, ch) }
    ad.close()
    const from = Math.min(frames, skip)
    skip -= from
    const to = Math.min(frames, from + Math.max(0, limit - samplesOut))
    for (let i = from; i < to; i++) {
      for (let c = 0; c < ch; c++) {
        const v = scratch[c * frames + i]
        if (v < curMin) curMin = v
        if (v > curMax) curMax = v
      }
      if (++curCount === bucketSize) { push(curMin, curMax); curMin = Infinity; curMax = -Infinity; curCount = 0 }
    }
    samplesOut += to - from
    if (performance.now() - lastPost > postEveryMs) post(false)
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (value) {
      const merged = new Uint8Array(pending.length + value.length)
      merged.set(pending); merged.set(value, pending.length)
      let i = 0
      if (toSkip < 0) { if (merged.length < 10) { pending = merged; continue } toSkip = id3Size(merged) }
      if (toSkip > 0) { const s = Math.min(toSkip, merged.length); i = s; toSkip -= s }
      while (i + 4 <= merged.length) {
        const f = parseHeader(merged, i)
        if (!f) { i++; continue }
        if (i + f.len > merged.length) break
        if (!decoder) {
          sampleRate = f.sampleRate
          decoder = new AudioDecoder({ output: onOutput, error: (err) => self.postMessage({ type: 'error', message: String(err) }) })
          decoder.configure({ codec: 'mp3', sampleRate: f.sampleRate, numberOfChannels: f.channels })
          estBuckets = Math.ceil(((totalBytes * 8) / f.bitrate) * f.sampleRate / bucketSize)
          const g = parseGapless(merged, i, f)
          if (g) {
            skip = g.delay + DECODER_DELAY
            if (g.frames) limit = g.frames * f.samples - g.delay - g.padding
            i += f.len // metadata frame, not audio
            continue
          }
        }
        decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, data: merged.subarray(i, i + f.len) }))
        timestamp += (f.samples / f.sampleRate) * 1e6
        i += f.len
      }
      pending = merged.slice(i)
      // Backpressure: don't let the network race ahead of the decoder.
      while (decoder && decoder.decodeQueueSize > 32) await new Promise((r) => decoder!.addEventListener('dequeue', r, { once: true }))
    }
    if (done) break
  }
  await decoder?.flush()
  if (curCount) push(curMin, curMax)
  post(true)
  if (debug) self.postMessage({ type: 'debug', dbg })
  self.postMessage({ type: 'stats', firstPostAt, totalMs: performance.now() - t0, buckets: n, seconds: samplesOut / sampleRate })
}
