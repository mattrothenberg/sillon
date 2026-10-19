// Streams an MP3 over fetch, decodes it frame by frame with WebCodecs, and
// reduces samples to max-abs buckets as they arrive. PCM never lives longer
// than one frame, so memory is O(peaks), not O(audio).
import { parseHeader, id3Size, parseGapless } from './mp3'

// Every MPEG Layer III decoder adds this many samples of latency.
const DECODER_DELAY = 529
// If no frame header shows up in this many bytes, it isn't an MP3.
const SNIFF_BYTES = 64 * 1024

export interface StartMessage { url: string; bucketSize: number; postEveryMs: number }

export type WorkerMessage =
  | { type: 'meta'; sampleRate: number; channels: number; expected: number }
  | { type: 'peaks'; values: Float32Array }
  | { type: 'done'; samples: number; ms: number }
  | { type: 'unsupported'; reason: string }
  | { type: 'error'; message: string }

const send = (m: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(m, { transfer })

self.onmessage = (e: MessageEvent<StartMessage>) => {
  run(e.data).catch((err) => send({ type: 'error', message: String(err?.message ?? err) }))
}

async function run({ url, bucketSize, postEveryMs }: StartMessage) {
  const t0 = performance.now()
  if (typeof AudioDecoder === 'undefined') return send({ type: 'unsupported', reason: 'no WebCodecs AudioDecoder' })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`fetch ${url}: ${res.status}`)
  const totalBytes = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()

  let pending = new Uint8Array(0)
  let seen = 0
  let toSkip = -1
  let decoder: AudioDecoder | null = null
  let timestamp = 0

  let out = new Float32Array(4096)
  let n = 0
  let cur = 0, curCount = 0
  let scratch = new Float32Array(1152 * 2)
  let lastPost = 0, samplesOut = 0
  // Gapless trimming: drop encoder priming at the start, padding at the end.
  let skip = 0, limit = Infinity
  // Samples per MP3 frame, to spot a decoder that trims its own delay (see onOutput).
  let frameSamples = 0, firstOutput = true

  const flush = () => {
    if (!n) return
    const values = out.slice(0, n)
    n = 0
    send({ type: 'peaks', values }, [values.buffer])
    lastPost = performance.now()
  }

  const onOutput = (ad: AudioData) => {
    const frames = ad.numberOfFrames, ch = ad.numberOfChannels
    if (scratch.length < frames * ch) scratch = new Float32Array(frames * ch)
    for (let c = 0; c < ch; c++) ad.copyTo(scratch.subarray(c * frames, (c + 1) * frames), { planeIndex: c, format: 'f32-planar' })
    ad.close()
    // WebKit's decoder (AudioToolbox) already drops the 529-sample decoder delay:
    // its first output is short by that much. Don't trim those samples twice.
    if (firstOutput) {
      firstOutput = false
      if (frames < frameSamples) skip = Math.max(0, skip - (frameSamples - frames))
    }
    const from = Math.min(frames, skip)
    skip -= from
    const to = Math.min(frames, from + Math.max(0, limit - samplesOut))
    for (let i = from; i < to; i++) {
      for (let c = 0; c < ch; c++) {
        const v = Math.abs(scratch[c * frames + i])
        if (v > cur) cur = v
      }
      if (++curCount === bucketSize) {
        if (n === out.length) { const g = new Float32Array(n * 2); g.set(out); out = g }
        out[n++] = cur
        cur = 0
        curCount = 0
      }
    }
    samplesOut += to - from
    if (performance.now() - lastPost > postEveryMs) flush()
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (value) {
      seen += value.length
      const merged = new Uint8Array(pending.length + value.length)
      merged.set(pending)
      merged.set(value, pending.length)
      let i = 0
      if (toSkip < 0) {
        if (merged.length < 10) { pending = merged; continue }
        toSkip = id3Size(merged)
      }
      if (toSkip > 0) { const s = Math.min(toSkip, merged.length); i = s; toSkip -= s }
      while (i + 4 <= merged.length) {
        const f = parseHeader(merged, i)
        if (!f) { i++; continue }
        if (i + f.len > merged.length) break
        if (!decoder) {
          const config = { codec: 'mp3', sampleRate: f.sampleRate, numberOfChannels: f.channels }
          if (!(await AudioDecoder.isConfigSupported(config)).supported) {
            reader.cancel()
            return send({ type: 'unsupported', reason: 'AudioDecoder has no mp3' })
          }
          decoder = new AudioDecoder({ output: onOutput, error: (err) => send({ type: 'error', message: String(err) }) })
          decoder.configure(config)
          frameSamples = f.samples
          // CBR estimate from the file size; replaced by the exact count if there's an Info frame.
          let expectedSamples = ((Math.max(0, totalBytes - i) * 8) / f.bitrate) * f.sampleRate
          const g = parseGapless(merged, i, f)
          if (g) {
            skip = g.delay + DECODER_DELAY
            if (g.frames) expectedSamples = limit = g.frames * f.samples - g.delay - g.padding
          }
          send({ type: 'meta', sampleRate: f.sampleRate, channels: f.channels, expected: Math.ceil(expectedSamples / bucketSize) })
          if (g) { i += f.len; continue } // the Info frame is metadata, not audio
        }
        decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp, data: merged.subarray(i, i + f.len) }))
        timestamp += (f.samples / f.sampleRate) * 1e6
        i += f.len
      }
      pending = merged.slice(i)
      if (!decoder && seen > SNIFF_BYTES) {
        reader.cancel()
        return send({ type: 'unsupported', reason: 'not an MP3 stream' })
      }
      // Backpressure: don't let the network race ahead of the decoder.
      while (decoder && decoder.decodeQueueSize > 32) await new Promise((r) => decoder!.addEventListener('dequeue', r, { once: true }))
    }
    if (done) break
  }
  if (!decoder) return send({ type: 'unsupported', reason: 'not an MP3 stream' })
  await decoder.flush()
  decoder.close()
  if (curCount) out[n++] = cur
  flush()
  send({ type: 'done', samples: samplesOut, ms: performance.now() - t0 })
}
