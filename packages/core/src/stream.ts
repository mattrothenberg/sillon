import { Peaks } from './peaks'
import type { StartMessage, WorkerMessage } from './worker'

export interface StreamOptions {
  /** Samples per level-0 bucket. 256 at 44.1 kHz is ~5.8 ms, enough to zoom to a single word. */
  bucketSize?: number
  /** How often the worker hands over new buckets while decoding. */
  postEveryMs?: number
}

export interface StreamStats {
  /** Milliseconds from the call until the first buckets arrived. */
  firstPeaksMs: number
  /** Milliseconds until the whole file was decoded. */
  totalMs: number
  /** `webcodecs` streamed in a worker; `decodeAudioData` is the whole-file fallback. */
  method: 'webcodecs' | 'decodeAudioData'
}

export interface PeakStream {
  /** Fills in as the file streams. Usable (and drawable) immediately. */
  peaks: Peaks
  /** Resolves with milliseconds-to-first-buckets, the moment there is something to draw. */
  first: Promise<number>
  /** Resolves once the whole file is decoded. */
  done: Promise<StreamStats>
  cancel(): void
}

/**
 * Streams peaks for an audio URL. MP3 is decoded progressively in a worker
 * (WebCodecs), so a waveform can draw within ~100 ms of the first bytes no
 * matter how long the file is. Anything else, or a browser without WebCodecs
 * MP3, falls back to fetching the whole file and `decodeAudioData`.
 */
export function streamPeaks(url: string, options: StreamOptions = {}): PeakStream {
  const bucketSize = options.bucketSize ?? 256
  const t0 = performance.now()
  // The real sample rate arrives with the first frame header.
  const peaks = new Peaks({ sampleRate: 44100, bucketSize })
  const absolute = new URL(url, location.href).href
  let worker: Worker | null = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let firstMs = 0
  let resolveFirst!: (ms: number) => void
  const first = new Promise<number>((r) => (resolveFirst = r))
  const arrived = () => {
    if (!firstMs) resolveFirst((firstMs = performance.now() - t0))
  }
  const end = () => {
    worker?.terminate()
    worker = null
  }

  const done = new Promise<StreamStats>((resolve, reject) => {
    worker!.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data
      if (m.type === 'meta') peaks.begin(m.sampleRate, m.expected)
      else if (m.type === 'peaks') {
        peaks.append(m.values)
        arrived()
      } else if (m.type === 'done') {
        end()
        peaks.finish()
        resolve({ firstPeaksMs: firstMs, totalMs: performance.now() - t0, method: 'webcodecs' })
      } else if (m.type === 'unsupported') {
        end()
        fallback(absolute, peaks).then(() => {
          arrived()
          resolve({ firstPeaksMs: firstMs, totalMs: performance.now() - t0, method: 'decodeAudioData' })
        }, reject)
      } else {
        end()
        reject(new Error(m.message))
      }
    }
    worker!.onerror = (e) => {
      end()
      reject(new Error(e.message))
    }
    worker!.postMessage({ url: absolute, bucketSize, postEveryMs: options.postEveryMs ?? 50 } satisfies StartMessage)
  })

  return { peaks, first, done, cancel: end }
}

async function fallback(url: string, peaks: Peaks): Promise<void> {
  const bytes = await (await fetch(url)).arrayBuffer()
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes)
  const { bucketSize } = peaks
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const values = new Float32Array(Math.ceil(buf.length / bucketSize))
  for (let b = 0; b < values.length; b++) {
    const end = Math.min(buf.length, (b + 1) * bucketSize)
    let m = 0
    for (const ch of channels) for (let i = b * bucketSize; i < end; i++) { const v = Math.abs(ch[i]); if (v > m) m = v }
    values[b] = m
  }
  peaks.begin(buf.sampleRate, values.length)
  peaks.append(values)
  peaks.finish()
}
