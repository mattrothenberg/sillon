import { useCallback, useEffect, useRef, useState } from 'react'
import { Peaks } from '@sillon/core'

// Live peaks from the microphone. An AudioWorklet reduces the input to the
// loudest sample per bucket on the audio thread, so nothing is missed between
// frames and recording keeps going in background tabs; the buckets arrive here
// in batches and go straight into a growing Peaks, which every part draws as
// it fills. A MediaRecorder keeps the audio itself, for playback and upload.

export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped'

export interface RecorderOptions {
  /** Samples per peak. Default 256, as `streamPeaks` uses. */
  bucketSize?: number
  /** Passed to `getUserMedia` as the `audio` constraints: a device id, echo cancellation and so on. Default `true`. */
  audio?: MediaTrackConstraints | true
  /** Passed to `MediaRecorder`: `mimeType`, `audioBitsPerSecond`. Default: the browser's choice. */
  recorder?: MediaRecorderOptions
}

export interface Recorder {
  /** Fills in while recording, ready for `Waveform.Root` with `progressive`; complete once stopped. Null before the first recording. */
  peaks: Peaks | null
  state: RecorderState
  /** The recorded audio, once stopped. */
  blob: Blob | null
  /** An object URL for `blob`, to play it back with `usePlayer(url)`. Revoked when a new recording starts or on unmount. */
  url: string | null
  /** Set if the microphone couldn't be opened (permission denied, no device) or recording failed. */
  error: Error | null
  /** Asks for the microphone and starts a new recording. Call it from a click: browsers start audio only after a user gesture. */
  start(): Promise<void>
  /** Ends the recording and releases the microphone. Resolves with the audio. */
  stop(): Promise<Blob | null>
  pause(): void
  resume(): void
}

// The audio thread's half: the largest absolute sample across channels in every
// `bucket` samples, posted every ~50 ms. Loaded from a Blob URL, so it works
// with any bundler; a page with a strict CSP needs `blob:` in `script-src`.
const WORKLET = `
class SillonPeaks extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super()
    this.bucket = processorOptions.bucket
    this.every = Math.max(1, Math.round((sampleRate * 0.05) / this.bucket))
    this.out = new Float32Array(this.every)
    this.n = 0; this.cur = 0; this.left = this.bucket
    this.on = true
    this.port.onmessage = (e) => {
      if (e.data === 'flush') { this.flush(true); this.port.postMessage({ flushed: true }) }
      else if (e.data === 'stop') this.on = false
    }
  }
  flush(partial) {
    if (partial && this.left < this.bucket) { this.out[this.n++] = this.cur; this.cur = 0; this.left = this.bucket }
    if (!this.n) return
    this.port.postMessage(this.out.slice(0, this.n))
    this.n = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length) return this.on
    const len = input[0].length
    for (let i = 0; i < len; i++) {
      let m = this.cur
      for (let c = 0; c < input.length; c++) { const v = input[c][i]; const a = v < 0 ? -v : v; if (a > m) m = a }
      this.cur = m
      if (--this.left === 0) {
        this.out[this.n++] = this.cur
        this.cur = 0; this.left = this.bucket
        if (this.n === this.every) this.flush(false)
      }
    }
    return this.on
  }
}
registerProcessor('sillon-peaks', SillonPeaks)
`

let workletUrl: string | null = null
const workletModule = () => (workletUrl ??= URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))

interface Session {
  stream: MediaStream
  context: AudioContext
  node: AudioWorkletNode
  source: MediaStreamAudioSourceNode
  media: MediaRecorder
  chunks: Blob[]
}

/**
 * Records from the microphone and draws it while you speak: `peaks` fills in
 * as audio arrives, so a `Waveform.Root` with `progressive` shows the
 * recording growing, and every other part works on it as on a file. When you
 * stop, `blob` and `url` hold the audio and `peaks` is complete (save it with
 * `peaks.encode()` to skip decoding later).
 *
 *   const rec = useRecorder()
 *   <button onClick={rec.state === 'recording' ? rec.stop : rec.start}>…</button>
 *   <Waveform.Root peaks={rec.peaks} progressive>…</Waveform.Root>
 */
export function useRecorder(options: RecorderOptions = {}): Recorder {
  const [peaks, setPeaks] = useState<Peaks | null>(null)
  const [state, setState] = useState<RecorderState>('idle')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const session = useRef<Session | null>(null)
  const opts = useRef(options)
  opts.current = options
  const urlRef = useRef<string | null>(null)
  const peaksRef = useRef<Peaks | null>(null)

  const release = useCallback((s: Session) => {
    s.source.disconnect()
    s.node.port.onmessage = null
    s.node.port.postMessage('stop')
    s.node.disconnect()
    for (const t of s.stream.getTracks()) t.stop()
    void s.context.close().catch(() => {})
  }, [])

  const start = useCallback(async () => {
    if (session.current) return
    setError(null)
    setState('starting')
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setUrl(null)
    setBlob(null)
    let stream: MediaStream | null = null
    try {
      const { bucketSize = 256, audio = true, recorder } = opts.current
      stream = await navigator.mediaDevices.getUserMedia({ audio })
      const context = new AudioContext()
      await context.audioWorklet.addModule(workletModule())
      const p = new Peaks({ sampleRate: context.sampleRate, bucketSize })
      p.begin(context.sampleRate, 0, bucketSize)
      const source = context.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(context, 'sillon-peaks', { numberOfOutputs: 0, processorOptions: { bucket: bucketSize } })
      node.port.onmessage = (e: MessageEvent<Float32Array | { flushed: true }>) => {
        if (e.data instanceof Float32Array) p.append(e.data)
      }
      source.connect(node)
      const media = new MediaRecorder(stream, recorder)
      const chunks: Blob[] = []
      media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      media.start(1000)
      if (context.state === 'suspended') await context.resume()
      session.current = { stream, context, node, source, media, chunks }
      peaksRef.current = p
      setPeaks(p)
      setState('recording')
    } catch (e) {
      for (const t of stream?.getTracks() ?? []) t.stop()
      setError(e instanceof Error ? e : new Error(String(e)))
      setState('idle')
    }
  }, [])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const s = session.current
    if (!s) return null
    session.current = null
    // The last partial bucket, then the audio's final chunk, then let go of the microphone.
    const flushed = new Promise<void>((resolve) => {
      const done = (e: MessageEvent) => { if (!(e.data instanceof Float32Array)) resolve() }
      s.node.port.addEventListener('message', done)
      setTimeout(resolve, 500)
    })
    s.node.port.postMessage('flush')
    await flushed
    const audio = await new Promise<Blob>((resolve) => {
      s.media.onstop = () => resolve(new Blob(s.chunks, { type: s.media.mimeType }))
      if (s.media.state === 'inactive') s.media.onstop(new Event('stop'))
      else s.media.stop()
    })
    release(s)
    peaksRef.current?.finish()
    const u = URL.createObjectURL(audio)
    urlRef.current = u
    setBlob(audio)
    setUrl(u)
    setState('stopped')
    return audio
  }, [release])

  const pause = useCallback(() => {
    const s = session.current
    if (!s || s.media.state !== 'recording') return
    s.media.pause()
    s.source.disconnect()
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    const s = session.current
    if (!s || s.media.state !== 'paused') return
    s.source.connect(s.node)
    s.media.resume()
    setState('recording')
  }, [])

  useEffect(() => () => {
    if (session.current) { session.current.media.stop(); release(session.current); session.current = null }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [release])

  return { peaks, state, blob, url, error, start, stop, pause, resume }
}
