import { useLayoutEffect, useRef, useState } from 'react'
import { formatTime, useWaveform, type WaveformState } from './waveform'

export interface Tick {
  /** Seconds. Place the tick with `<Waveform.Marker time={tick.time}>`. */
  time: number
  /** True on the longer interval (every 5 s when ticks are a second apart, every minute when they're 10 s apart…). */
  major: boolean
  /** The time as text, from `format`. */
  label: string
}

export interface TicksOptions {
  /** Fewest CSS pixels between ticks. The interval is the shortest nice step that keeps them this far apart. Default `64`. */
  minGap?: number
  /** Every this many ticks is major. Default: the next nice step at least 4× the interval (1 s → 5 s, 10 s → 1 min). */
  majorEvery?: number
  /** Formats a tick's time; `step` is the interval in seconds. Default `formatTime`, with tenths below a second. Read when the ticks change. */
  format?: (seconds: number, step: number) => string
}

// Intervals ticks can be, in seconds; past an hour, whole hours.
const STEPS = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
// Ticks are computed for whole blocks of this many intervals around the view, so panning
// within a block doesn't change them: their Markers move on their own.
const BLOCK = 16

const stepFor = (secondsPerPx: number, minGap: number) => {
  const want = secondsPerPx * minGap
  return STEPS.find((s) => s >= want) ?? Math.ceil(want / 3600) * 3600
}
const majorFor = (step: number) => {
  const whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-9
  for (const s of STEPS) if (s >= 4 * step && whole(s / step)) return s
  return Math.ceil((4 * step) / 3600) * 3600
}
const defaultFormat = (t: number, step: number) => (step < 1 ? `${formatTime(t)}.${Math.round((t % 1) * 10) % 10}` : formatTime(t))

function compute(s: WaveformState, o: TicksOptions): { key: string; ticks: Tick[] } {
  const span = s.end - s.start
  const total = s.peaks?.duration || s.player?.duration || s.end
  if (!(span > 0) || !s.width) return { key: '', ticks: [] }
  const step = stepFor(span / s.width, o.minGap ?? 64)
  const block = step * BLOCK
  const from = Math.max(0, Math.floor(s.start / block) * block)
  const to = Math.min(Math.max(total, s.end), Math.ceil(s.end / block) * block)
  const key = `${step}:${from}:${to}:${o.majorEvery ?? ''}`
  const major = majorFor(step), format = o.format ?? defaultFormat
  const ticks: Tick[] = []
  for (let i = Math.max(0, Math.ceil(from / step - 1e-9)); i * step <= to + 1e-9; i++) {
    // Rounded to the millisecond, so 0.1 × 3 is 0.3.
    const time = Math.round(i * step * 1000) / 1000
    const isMajor = o.majorEvery ? i % o.majorEvery === 0 : Math.abs(time / major - Math.round(time / major)) < 1e-6
    ticks.push({ time, major: isMajor, label: format(time, step) })
  }
  return { key, ticks }
}

/**
 * Ticks for a timeline under or over the waveform, like the wavesurfer.js
 * Timeline plugin: times at a nice interval for the current zoom and width.
 * Render each one in a `Waveform.Marker`, which places it and moves it while
 * zooming without a render. This hook re-renders only when the set of ticks
 * changes: when the interval changes, or the view pans into the next block of
 * them. Ticks just outside the view are included; their Markers stay hidden.
 * Must be inside `Waveform.Root`. Empty until the duration is known.
 *
 *   function Timeline() {
 *     return useTicks().map((t) => (
 *       <Waveform.Marker key={t.time} time={t.time}>
 *         <span className="absolute top-full">{t.major ? t.label : ''}</span>
 *       </Waveform.Marker>
 *     ))
 *   }
 */
export function useTicks(options: TicksOptions = {}): Tick[] {
  const store = useWaveform()
  const opts = useRef(options)
  opts.current = options
  const [state, setState] = useState(() => compute(store.state, options))
  const key = useRef(state.key)
  key.current = state.key
  const { minGap, majorEvery } = options
  useLayoutEffect(() => {
    const check = () => {
      const next = compute(store.state, opts.current)
      if (next.key !== key.current) { key.current = next.key; setState(next) }
    }
    check()
    return store.subscribe((c) => c !== 'hover' && check())
  }, [store, minGap, majorEvery])
  return state.ticks
}
