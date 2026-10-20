// Decode lab, worker side: one MP3 already in memory, decoded with WebCodecs in
// different ways, so each cost can be timed on its own.
//   frames   MP3 frames per EncodedAudioChunk (1 is what the library does today)
//   work     'none' closes each AudioData; 'copy' also copies it out; 'peaks' also takes max-abs per 256
//   queue    how many chunks may wait in the decoder before we pause for 'dequeue'
import { id3Size, parseHeader, parseGapless } from '@sillon/core/mp3'

export interface LabJob { bytes: ArrayBuffer; frames: number; work: 'none' | 'copy' | 'peaks'; queue: number }
export interface LabResult { ms: number; samples: number; outputs: number; chunks: number; peaks: number; error?: string }

self.onmessage = async (e: MessageEvent<LabJob>) => {
  try { self.postMessage(await run(e.data)) } catch (err) { self.postMessage({ error: String(err) }) }
}

async function run({ bytes, frames: per, work, queue }: LabJob): Promise<LabResult> {
  const b = new Uint8Array(bytes)
  const t0 = performance.now()
  // Split into frames, skipping ID3 and the Info frame.
  const spans: [number, number][] = []
  let i = id3Size(b), first: ReturnType<typeof parseHeader> = null
  while (i + 4 <= b.length) {
    const f = parseHeader(b, i)
    if (!f) { i++; continue }
    if (!first) { first = f; if (parseGapless(b, i, f)) { i += f.len; continue } }
    spans.push([i, Math.min(b.length, i + f.len)])
    i += f.len
  }
  let samples = 0, outputs = 0, peaks = 0, cur = 0, count = 0
  let scratch = new Float32Array(1152 * 2)
  const decoder = new AudioDecoder({
    output: (ad) => {
      outputs++
      const n = ad.numberOfFrames, ch = ad.numberOfChannels
      samples += n
      if (work !== 'none') {
        if (scratch.length < n * ch) scratch = new Float32Array(n * ch)
        for (let c = 0; c < ch; c++) ad.copyTo(scratch.subarray(c * n, (c + 1) * n), { planeIndex: c, format: 'f32-planar' })
      }
      ad.close()
      if (work === 'peaks') {
        for (let k = 0; k < n; k++) {
          for (let c = 0; c < ch; c++) { const v = Math.abs(scratch[c * n + k]); if (v > cur) cur = v }
          if (++count === 256) { peaks++; cur = 0; count = 0 }
        }
      }
    },
    error: (err) => { throw err },
  })
  decoder.configure({ codec: 'mp3', sampleRate: first!.sampleRate, numberOfChannels: first!.channels })
  let ts = 0, chunks = 0
  for (let k = 0; k < spans.length; k += per) {
    const a = spans[k][0], z = spans[Math.min(spans.length, k + per) - 1][1]
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data: b.subarray(a, z) }))
    ts += (per * first!.samples / first!.sampleRate) * 1e6
    chunks++
    while (decoder.decodeQueueSize > queue) await new Promise((r) => decoder.addEventListener('dequeue', r, { once: true }))
  }
  await decoder.flush()
  decoder.close()
  return { ms: performance.now() - t0, samples, outputs, chunks, peaks }
}
