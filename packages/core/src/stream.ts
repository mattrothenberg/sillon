import { Peaks } from './peaks'
import type { StartMessage, WorkerMessage } from './worker'

export interface StreamOptions {
  /** Samples per level-0 bucket. 256 at 44.1 kHz is ~5.8 ms, enough to zoom to a single word. */
  bucketSize?: number
  /** How often the worker hands over new buckets while decoding. */
  postEveryMs?: number
  /**
   * Files up to this many bytes are decoded whole with `decodeAudioData`, which is
   * quicker for short files; larger MP3s stream through a worker. Default 8 MB,
   * about eight minutes at 128 kbps. 0 streams everything.
   */
  wholeBelow?: number
}

export interface StreamStats {
  /** Milliseconds from the call until the first buckets arrived. */
  firstPeaksMs: number
  /** Milliseconds until the whole file was decoded. */
  totalMs: number
  /** `webcodecs` streamed in a worker; `decodeAudioData` decoded the whole file at once; `file` read a `.peaks` file. */
  method: 'webcodecs' | 'decodeAudioData' | 'file'
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

const WHOLE_BELOW = 8 * 1024 * 1024

/**
 * Peaks for an audio URL, or for a `.peaks` file of peaks made ahead of time
 * (see `Peaks.encode`). Short audio files are fetched and decoded whole, which the
 * browser does fastest. Longer MP3s are decoded progressively in a worker
 * (WebCodecs), so a waveform can draw within ~100 ms of the first bytes and
 * memory stays proportional to the peaks, not the audio. Anything the worker
 * can't stream falls back to the whole-file path.
 */
export function streamPeaks(url: string, options: StreamOptions = {}): PeakStream {
  const bucketSize = options.bucketSize ?? 256
  const wholeBelow = options.wholeBelow ?? WHOLE_BELOW
  const t0 = performance.now()
  // The real sample rate arrives with the first frame header, or the decoded buffer.
  const peaks = new Peaks({ sampleRate: 44100, bucketSize })
  const absolute = new URL(url, location.href).href
  const abort = new AbortController()
  let worker: Worker | null = null
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
  const stats = (method: StreamStats['method']): StreamStats => ({ firstPeaksMs: firstMs, totalMs: performance.now() - t0, method })
  const whole = (bytes: ArrayBuffer | Promise<ArrayBuffer>) =>
    queued(async () => decodeWhole(await bytes, peaks)).then(() => (arrived(), stats('decodeAudioData')))

  const stream = () => new Promise<StreamStats>((resolve, reject) => {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data
      if (m.type === 'meta') peaks.begin(m.sampleRate, m.expected)
      else if (m.type === 'peaks') {
        peaks.append(m.values)
        arrived()
      } else if (m.type === 'done') {
        end()
        peaks.finish()
        resolve(stats('webcodecs'))
      } else if (m.type === 'unsupported') {
        end()
        whole(fetch(absolute, { signal: abort.signal }).then((r) => r.arrayBuffer())).then(resolve, reject)
      } else {
        end()
        reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      end()
      reject(new Error(e.message))
    }
    worker.postMessage({ url: absolute, bucketSize, postEveryMs: options.postEveryMs ?? 50 } satisfies StartMessage)
  })

  // A .peaks file (peaks made ahead of time) is read as is. Otherwise the response
  // headers say how big the audio is: small files are read here and decoded whole;
  // for large ones this request is dropped and the worker streams.
  const done = /\.peaks(?:[?#]|$)/.test(absolute)
    ? fetch(absolute, { signal: abort.signal }).then(async (res) => {
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
        Peaks.decode(await res.arrayBuffer(), peaks)
        arrived()
        return stats('file')
      })
    : !wholeBelow
    ? stream()
    : fetch(absolute, { signal: abort.signal }).then((res) => {
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
        const size = Number(res.headers.get('content-length') ?? 0)
        if (size && size <= wholeBelow) return whole(res.arrayBuffer())
        void res.body?.cancel()
        return stream()
      })

  return { peaks, first, done, cancel: () => { abort.abort(); end() } }
}

/* ------------------------------------------------------------ whole-file decoding */

// At most this many whole-file decodes at once: a page of twenty short files would
// otherwise hold twenty decoded files in memory at the same time.
const MAX_DECODES = 4
let running = 0
const waiting: (() => void)[] = []

async function queued<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_DECODES) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await task()
  } finally {
    running--
    waiting.shift()?.()
  }
}

async function decodeWhole(bytes: ArrayBuffer, peaks: Peaks): Promise<void> {
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes)
  const { bucketSize } = peaks
  const values = new Float32Array(Math.ceil(buf.length / bucketSize))
  // One channel at a time, each a tight loop over a typed array: about twice as
  // fast as visiting every channel for every sample.
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c)
    for (let b = 0, i = 0; b < values.length; b++) {
      let m = values[b]
      for (const e = Math.min(ch.length, i + bucketSize); i < e; i++) {
        const v = ch[i] < 0 ? -ch[i] : ch[i]
        if (v > m) m = v
      }
      values[b] = m
    }
  }
  peaks.begin(buf.sampleRate, values.length)
  peaks.append(values)
  peaks.finish()
}
