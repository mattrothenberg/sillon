import type { Peaks } from './peaks'

export interface Span { start: number; end: number }

export interface SilenceOptions {
  /** Level below which audio counts as silent, relative to the loudest peak. 0.03 ≈ -30 dB. */
  threshold?: number
  /** Ignore gaps shorter than this, in seconds. */
  minDuration?: number
  /** Leave this much of every gap in place, in seconds, split evenly at both ends. */
  keep?: number
}

/** Quiet spans, in seconds. Runs on peaks, not PCM, so it's instant on an hour of audio. */
export function findSilences(peaks: Peaks, options: SilenceOptions = {}): Span[] {
  const { threshold = 0.03, minDuration = 0.5, keep = 0 } = options
  const values = peaks.toArray()
  const limit = threshold * peaks.max
  const secs = peaks.bucketSize / peaks.sampleRate
  const out: Span[] = []
  let from = -1
  for (let i = 0; i <= values.length; i++) {
    const quiet = i < values.length && values[i] < limit
    if (quiet && from < 0) from = i
    else if (!quiet && from >= 0) {
      const start = from * secs, end = i * secs
      if (end - start >= minDuration) out.push({ start: start + keep / 2, end: end - keep / 2 })
      from = -1
    }
  }
  return out
}

export interface Summary {
  duration: number
  /** Loudness over time, 0–100, evenly spaced. */
  envelope: number[]
  silences: Span[]
}

/**
 * A compact, JSON-friendly description of a recording. Small enough to hand
 * to a language model in place of the audio itself.
 */
export function summarize(peaks: Peaks, points = 64, silence?: SilenceOptions): Summary {
  const duration = peaks.duration
  const bars = peaks.bars(0, duration, new Float32Array(points))
  const round = (x: number) => Math.round(x * 100) / 100
  return {
    duration: round(duration),
    envelope: Array.from(bars, (v) => Math.round((v / (peaks.max || 1)) * 100)),
    silences: findSilences(peaks, silence).map((s) => ({ start: round(s.start), end: round(s.end) })),
  }
}
