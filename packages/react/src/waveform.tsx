// Performance model: React renders the parts once. After that, streaming,
// resizing, playback, hovering and zooming never re-render anything. Root
// keeps a mutable store; each part subscribes and writes to its own DOM node.
// Per-frame writes are transforms only (compositor work, no layout or paint).
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import type { Peaks } from '@sillon/core'
import type { Player } from './player'

export interface Geometry {
  barWidth: number
  barGap: number
  barRadius: number
  minBarHeight: number
  align: 'center' | 'top' | 'bottom'
  normalize: boolean
  /** Averages each bar with this many neighbors on each side, for a softer outline. */
  smoothing: number
  /**
   * Bar heights are raised to this power after normalizing. Above 1, quiet
   * passages drop and loud ones stand out, which helps evenly mastered music.
   */
  contrast: number
}

export interface WaveformState extends Geometry {
  peaks: Peaks | null
  player: Player | null
  width: number
  height: number
  /** Visible range, in seconds. */
  start: number
  end: number
  /** Seconds under the pointer, or null. */
  hover: number | null
  /** The gain that normalizes bar heights right now. Managed by the store. */
  gain: number
  /** Draw bars while the file streams in, left to right. Off by default: the waveform appears once, complete. */
  progressive: boolean
  /**
   * With `progressive`, animate loading: sweep bars in from the left and ease
   * them to their final scale when the file completes. Off by default.
   */
  reveal: boolean
  /** How far the sweep has got, in seconds; Infinity when not sweeping. Managed by the store. */
  revealed: number
}

/** What changed: layout (size, view, geometry), data (peaks), or hover. */
export type Change = 'layout' | 'data' | 'hover'

export class WaveformStore {
  state: WaveformState = {
    peaks: null, player: null, width: 0, height: 0, start: 0, end: 0, hover: null, gain: 1, progressive: false, reveal: false, revealed: Infinity,
    barWidth: 2, barGap: 1, barRadius: 0, minBarHeight: 1, align: 'center', normalize: true,
    smoothing: 0, contrast: 1,
  }
  /** The `end` prop; null means "until the end of the audio". */
  endProp: number | null = null
  private listeners = new Set<(c: Change) => void>()
  private pendingData = false
  private raf = 0
  private unsubPeaks: (() => void) | null = null

  subscribe(l: (c: Change) => void): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  emit(c: Change) {
    for (const l of this.listeners) l(c)
  }

  /** Applies a patch and notifies synchronously if anything changed. */
  update(patch: Partial<WaveformState>) {
    const s = this.state
    let changed = false
    for (const k in patch) {
      const key = k as keyof WaveformState
      if (s[key] !== patch[key]) { (s as any)[key] = patch[key]; changed = true }
    }
    if (patch.peaks !== undefined && patch.peaks !== this.watched) this.watch(patch.peaks)
    else if (patch.normalize !== undefined) this.resolveGain()
    if (this.resolveEnd()) changed = true
    if (changed) this.emit('layout')
  }

  /**
   * Moves the visible range, in seconds, without a React render. Pass
   * `end: null` to follow the end of the audio. Cheap enough to call every
   * frame (zoom gestures, animated transitions).
   */
  setView(start: number, end: number | null) {
    this.endProp = end
    this.update({ start })
  }

  setHover(t: number | null) {
    if (t === this.state.hover) return
    this.state.hover = t
    this.emit('hover')
  }

  destroy() {
    this.unsubPeaks?.()
    this.unsubPeaks = null
    this.watched = null
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.gainAnim)
    cancelAnimationFrame(this.revealAnim)
    this.raf = this.gainAnim = this.revealAnim = 0
  }

  private watched: Peaks | null = null
  private watch(peaks: Peaks | null) {
    this.unsubPeaks?.()
    this.watched = peaks
    this.wasStreaming = !!peaks && !peaks.complete
    cancelAnimationFrame(this.revealAnim)
    this.revealAnim = 0
    this.state.revealed = this.wasStreaming && this.state.progressive && this.state.reveal ? 0 : Infinity
    this.resolveGain()
    // Peaks can arrive many times a frame while streaming; draw once per frame.
    this.unsubPeaks = peaks?.subscribe(() => {
      this.pendingData = true
      if (!this.raf) this.raf = requestAnimationFrame(this.flush)
    }) ?? null
  }

  private flush = () => {
    this.raf = 0
    if (!this.pendingData) return
    this.pendingData = false
    this.resolveGain()
    if (this.state.revealed !== Infinity && !this.revealAnim) this.revealAnim = requestAnimationFrame(this.reveal)
    this.emit(this.resolveEnd() ? 'layout' : 'data')
  }

  /**
   * Moves the sweep towards what has loaded, plus one ramp's width, so bars
   * that have data are always fully grown once it catches up. Quick when far
   * behind, never slower than a full width per 700 ms.
   */
  private revealAnim = 0
  private revealAt = 0
  private reveal = (now: number) => {
    const s = this.state, p = s.peaks
    if (!p) return void (this.revealAnim = 0)
    const span = s.end - s.start || p.duration || 1
    const target = p.loaded + rampOf(span)
    const dt = this.revealAt ? Math.min(50, now - this.revealAt) : 16
    this.revealAt = now
    s.revealed = Math.min(target, s.revealed + Math.max((span * dt) / 700, (target - s.revealed) * 0.18))
    const done = p.complete && s.revealed >= target
    if (done) s.revealed = Infinity
    this.emit('data')
    // Waits for more data at the target; `flush` restarts it when some arrives.
    this.revealAnim = done || s.revealed >= target ? 0 : requestAnimationFrame(this.reveal)
    if (!this.revealAnim) this.revealAt = 0
  }
  /**
   * While peaks stream in, the loudest value so far keeps rising, so
   * normalizing to it would shrink every bar on every update. Instead,
   * streaming bars are drawn against full scale, and once the file is
   * complete the gain eases to the normalized value in one short move.
   */
  private gainAnim = 0
  private resolveGain() {
    const s = this.state, p = s.peaks
    const target = !s.normalize || !p?.max ? 1 : p.complete ? 1 / p.max : 1 / Math.max(1, p.max)
    if (target === s.gain) return
    cancelAnimationFrame(this.gainAnim)
    // Eases only with `reveal`; otherwise, and for precomputed peaks, it's set at once.
    if (!p?.complete || !this.wasStreaming || !s.reveal || !s.progressive) { s.gain = target; return }
    this.wasStreaming = false
    const from = s.gain, t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 240)
      s.gain = from + (target - from) * (1 - Math.pow(1 - t, 3))
      this.emit('data')
      this.gainAnim = t < 1 ? requestAnimationFrame(step) : 0
    }
    this.gainAnim = requestAnimationFrame(step)
  }
  private wasStreaming = false

  /** Recomputes the view's end from the audio when there's no `end` prop. True if it moved. */
  private resolveEnd(): boolean {
    const s = this.state
    const end = this.endProp ?? (s.peaks?.duration || s.player?.duration || 0)
    if (end === s.end) return false
    s.end = end
    return true
  }
}

const WaveformContext = createContext<WaveformStore | null>(null)

/** A store to hand to `Waveform.Root`, for imperative control. */
export function useWaveformStore(): WaveformStore {
  const [store] = useState(() => new WaveformStore())
  return store
}

/** The store behind the nearest `Waveform.Root`, for building your own parts. */
export function useWaveform(): WaveformStore {
  const store = useContext(WaveformContext)
  if (!store) throw new Error('Waveform parts must be inside <Waveform.Root>')
  return store
}

/**
 * Runs `effect` now and on every change, with the store's state. For parts
 * that also track playback, `time` fires every frame while playing.
 */
function useStoreEffect(
  effect: (s: WaveformState, change: Change | 'mount' | 'time', time: number) => void,
  opts: { time?: boolean; hover?: boolean } = {},
  /** Props the effect reads; it re-runs when they change. */
  deps: unknown[] = [],
) {
  const store = useWaveform()
  const fn = useRef(effect)
  fn.current = effect
  useLayoutEffect(() => {
    const now = () => store.state.player?.time ?? 0
    let unTime: (() => void) | undefined
    const bindTime = () => {
      unTime?.()
      unTime = opts.time ? store.state.player?.onTime((t) => fn.current(store.state, 'time', t)) : undefined
    }
    let player = store.state.player
    bindTime()
    fn.current(store.state, 'mount', now())
    const unsub = store.subscribe((c) => {
      if (c === 'hover' && !opts.hover) return
      if (store.state.player !== player) { player = store.state.player; bindTime() }
      fn.current(store.state, c, now())
    })
    return () => { unsub(); unTime?.() }
  }, [store, opts.time, opts.hover])
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (mounted.current) fn.current(store.state, 'layout', store.state.player?.time ?? 0)
    mounted.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Seconds → x in pixels for the current view. */
export const timeToX = (s: Pick<WaveformState, 'start' | 'end' | 'width'>, t: number) =>
  s.end > s.start ? ((t - s.start) / (s.end - s.start)) * s.width : 0

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
const fraction = (s: WaveformState, t: number) => (s.end > s.start ? clamp((t - s.start) / (s.end - s.start), 0, 1) : 0)

export const formatTime = (s: number) => {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/* ---------------------------------------------------------------- Root */

export interface RootProps extends HTMLAttributes<HTMLDivElement>, Partial<Geometry> {
  peaks: Peaks | null
  player?: Player | null
  /** Start of the visible range, in seconds. */
  start?: number
  /** End of the visible range, in seconds. Defaults to the end of the audio. */
  end?: number
  /** Your own store, from `useWaveformStore()`, to drive the view imperatively with `store.setView()`. */
  store?: WaveformStore
  /** Seconds moved by the arrow keys. */
  step?: number
  /** Click and drag to seek. On by default when there's a player. */
  interactive?: boolean
  /**
   * Turns dragging across the waveform into selecting a span instead of
   * scrubbing; a click still seeks. Called on every move with the span so far.
   */
  onDragSelect?: (start: number, end: number) => void
  /**
   * Draw bars while the file streams in, left to right, so long files show
   * something within a fraction of a second. Off by default: the waveform
   * appears once, complete.
   */
  progressive?: boolean
  /**
   * With `progressive`, animate loading: sweep bars in from the left and ease
   * them to their final scale when the file completes. Off by default.
   */
  reveal?: boolean
  /**
   * A fixed number of bars. Bar width and gap then scale with the waveform's
   * width, keeping the proportion of `barWidth` to `barGap`, so it looks the
   * same at any size, and bars drawn on the server line up with the client's.
   */
  bars?: number
  ref?: Ref<HTMLDivElement>
}

/** Bar width and gap that fit exactly `bars` bars into `width`, in the proportion of `barWidth` to `barGap`. */
export function fitBars(width: number, bars: number, barWidth: number, barGap: number): { barWidth: number; barGap: number } {
  if (!bars || !width) return { barWidth, barGap }
  // bars × pitch − gap = width, with the gap the same share of each pitch as in the props.
  const share = barGap / (barWidth + barGap)
  const pitch = width / (bars - share)
  return { barWidth: pitch * (1 - share), barGap: pitch * share }
}

/**
 * Lays out the waveform and owns seeking. Renders a single `div` that is
 * `position: relative`; give it a size and every part fills it.
 */
function Root({
  peaks, player = null, start, end, step = 5, interactive = !!player, progressive = false, reveal = false, store: external, onDragSelect, bars = 0,
  barWidth = 2, barGap = 1, barRadius = 0, minBarHeight = 1, align = 'center', normalize = true,
  smoothing = 0, contrast = 1, children, style, ref, onPointerDown, onPointerMove, onPointerEnter, onPointerLeave, onKeyDown, ...rest
}: RootProps) {
  const [own] = useState(() => external ?? new WaveformStore())
  const store = external ?? own
  const el = useRef<HTMLDivElement | null>(null)
  const rect = useRef<DOMRect | null>(null)
  const dragging = useRef(false)
  // Where a press began, to tell a click from a drag-select.
  const press = useRef<{ x: number; t: number; selecting: boolean } | null>(null)

  // Props only override the view when given, so `store.setView()` isn't undone by a re-render.
  if (end !== undefined) store.endProp = end
  // Bar width and gap for a given width: as given, or fitted to a fixed number of bars.
  const fit = useRef((w: number) => fitBars(w, bars, barWidth, barGap))
  fit.current = (w: number) => fitBars(w, bars, barWidth, barGap)
  useLayoutEffect(() => {
    const patch: Partial<WaveformState> = { progressive, reveal, peaks, player, ...fit.current(store.state.width), barRadius, minBarHeight, align, normalize, smoothing, contrast }
    if (start !== undefined) patch.start = start
    store.update(patch)
  })

  useLayoutEffect(() => {
    const node = el.current!
    // ResizeObserver fires after layout and before paint: no stretched frame.
    const ro = new ResizeObserver(() => {
      rect.current = null
      store.update({ width: node.clientWidth, height: node.clientHeight, ...fit.current(node.clientWidth) })
    })
    ro.observe(node)
    store.update({ width: node.clientWidth, height: node.clientHeight, ...fit.current(node.clientWidth) })
    return () => { ro.disconnect(); store.destroy() }
  }, [store])

  // "loading" until there are bars to draw, then "ready": a hook for CSS, written without a render.
  useLayoutEffect(() => {
    const node = el.current!
    let last = ''
    const write = () => {
      const state = isReady(store.state) ? 'ready' : 'loading'
      if (state !== last) node.setAttribute('data-state', (last = state))
    }
    write()
    return store.subscribe((c) => c !== 'hover' && write())
  }, [store])

  // Without peaks, the view's end comes from the audio's metadata.
  useLayoutEffect(() => player?.subscribe(() => store.update({})), [store, player])

  // Slider semantics, kept current without re-rendering.
  useLayoutEffect(() => {
    const node = el.current!
    if (!interactive || !player) return
    let last = -1, lastMax = -1
    const write = (t: number, force = false) => {
      const s = Math.floor(t)
      if (s === last && !force) return
      last = s
      node.setAttribute('aria-valuenow', String(s))
      const max = Math.floor(store.state.end)
      if (max !== lastMax) node.setAttribute('aria-valuemax', String((lastMax = max)))
      node.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(store.state.end)}`)
    }
    write(player.time, true)
    const a = player.onTime((t) => write(t))
    const b = store.subscribe((c) => c === 'layout' && write(player.time, true))
    return () => { a(); b() }
  }, [store, player, interactive])

  const setRef = useCallback((node: HTMLDivElement | null) => {
    el.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])

  // Cached between pointer events: reading layout on every move is the classic scrubber jank.
  const timeAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = (rect.current ??= e.currentTarget.getBoundingClientRect())
    const s = store.state
    return s.start + clamp((e.clientX - r.left) / r.width, 0, 1) * (s.end - s.start)
  }

  const live = interactive && player
  // React bubbles events from portals through their React parents, so a popover opened from a marker would
  // otherwise seek and grab the pointer. Only events from inside the waveform's own element count.
  const ours = (e: { target: EventTarget; currentTarget: HTMLElement }) => e.currentTarget.contains(e.target as Node)
  return (
    <WaveformContext.Provider value={store}>
      <div
        role={live ? 'slider' : undefined}
        tabIndex={live ? 0 : undefined}
        aria-label={live ? 'Seek' : undefined}
        aria-valuemin={live ? 0 : undefined}
        {...rest}
        ref={setRef}
        data-sillon=""
        style={{ position: 'relative', touchAction: interactive ? 'none' : undefined, userSelect: 'none', ...style }}
        onPointerEnter={(e) => {
          onPointerEnter?.(e)
          rect.current = e.currentTarget.getBoundingClientRect()
        }}
        onPointerDown={(e) => {
          onPointerDown?.(e)
          if (!live || e.defaultPrevented || e.button !== 0 || !ours(e)) return
          rect.current = e.currentTarget.getBoundingClientRect()
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const t = timeAt(e)
          press.current = { x: e.clientX, t, selecting: false }
          player.seek(t)
        }}
        onPointerMove={(e) => {
          onPointerMove?.(e)
          if (!dragging.current && !ours(e)) return store.setHover(null)
          const t = timeAt(e)
          store.setHover(t)
          if (!dragging.current || !player) return
          const p = press.current
          if (p && onDragSelect && (p.selecting || Math.abs(e.clientX - p.x) > 3)) {
            p.selecting = true
            onDragSelect(Math.min(p.t, t), Math.max(p.t, t))
          } else player.seek(t)
        }}
        onPointerUp={() => { dragging.current = false; press.current = null }}
        onPointerCancel={() => { dragging.current = false; press.current = null }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e)
          if (!dragging.current) store.setHover(null)
        }}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(e)
          if (!live || e.defaultPrevented || !ours(e)) return
          const t = player.time, s = store.state
          const to: Record<string, number> = {
            ArrowLeft: t - step, ArrowDown: t - step, ArrowRight: t + step, ArrowUp: t + step,
            PageDown: t - step * 6, PageUp: t + step * 6, Home: s.start, End: s.end,
          }
          if (e.key in to) player.seek(clamp(to[e.key], 0, s.end))
          else if (e.key === ' ' || e.key === 'k') player.toggle()
          else return
          e.preventDefault()
        }}
      >
        {children}
      </div>
    </WaveformContext.Provider>
  )
}

/* ---------------------------------------------------------------- Shape */

const round1 = (x: number) => Math.round(x * 10) / 10
/** Width of the sweep's soft leading edge, in seconds, for a view `span` seconds long. */
const rampOf = (span: number) => span * 0.08
/** A normalized peak (0–1) with `contrast` applied. */
export const level = (v: number, contrast: number) => (contrast === 1 ? v : Math.pow(clamp(v, 0, 1), contrast))

/** True once there are bars to draw: all of them, or with `progressive`, any. */
export const isReady = (s: WaveformState) => (s.progressive ? !!s.peaks : !!s.peaks?.complete)

// The epsilon keeps a width fitted to exactly n bars (see fitBars) from rounding down to n − 1.
const barCount = (s: WaveformState) => Math.max(0, Math.floor((s.width + s.barGap) / (s.barWidth + s.barGap) + 1e-6))

/** One rounded bar of height `h` in slot `i`, as path data. */
function barPath(s: WaveformState, i: number, h: number): string {
  const w = s.barWidth
  const x = round1(i * (w + s.barGap)), y = round1(s.align === 'bottom' ? s.height - h : s.align === 'top' ? 0 : (s.height - h) / 2)
  const r = Math.min(s.barRadius, w / 2, h / 2)
  if (r <= 0) return `M${x} ${y}h${w}v${h}h-${w}z`
  const hw = round1(w - 2 * r), hh = round1(h - 2 * r), rr = round1(r)
  return `M${x} ${round1(y + r)}a${rr} ${rr} 0 0 1 ${rr}-${rr}h${hw}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${hh}a${rr} ${rr} 0 0 1-${rr} ${rr}h-${hw}a${rr} ${rr} 0 0 1-${rr}-${rr}z`
}

/** One SVG path of rounded bars for the current view and size. */
export function barsPath(s: WaveformState, out?: { bars?: Float32Array }): string {
  const count = barCount(s)
  if (!count || !s.height) return ''
  // Not progressive: nothing until every bar is known, then all of it at once.
  if (!isReady(s)) return ''
  const bars = fillBars(s, count, out)
  const k = s.gain, H = s.height
  const parts: string[] = new Array(count)
  // While sweeping in, bars inside the leading edge are partly grown.
  const sweeping = s.revealed !== Infinity
  const perBar = (s.end - s.start) / count, ramp = rampOf(s.end - s.start)
  for (let i = 0; i < count; i++) {
    let grown = 1
    if (sweeping) {
      const f = clamp((s.revealed - (s.start + (i + 0.5) * perBar)) / ramp, 0, 1)
      grown = f * (2 - f)
    }
    parts[i] = barPath(s, i, round1(clamp(level(bars[i] * k, s.contrast) * grown * H, s.minBarHeight, H)))
  }
  return parts.join('')
}

function fillBars(s: WaveformState, count: number, out?: { bars?: Float32Array; raw?: Float32Array }) {
  const k = Math.max(0, Math.round(s.smoothing))
  let bars = out?.bars
  if (!bars || bars.length !== count) bars = new Float32Array(count)
  if (out) out.bars = bars
  // With smoothing, read into a scratch buffer and blur into `bars`.
  let raw = bars
  if (k) {
    raw = out?.raw && out.raw.length === count ? out.raw : new Float32Array(count)
    if (out) out.raw = raw
  }
  if (s.peaks && s.end > s.start) s.peaks.bars(s.start, s.end, raw)
  else raw.fill(0)
  if (k) {
    // Running-sum box blur, clamped at the ends.
    const at = (i: number) => raw[clamp(i, 0, count - 1)]
    let sum = 0
    for (let i = -k; i <= k; i++) sum += at(i)
    for (let i = 0; i < count; i++) {
      bars[i] = sum / (2 * k + 1)
      sum += at(i + k + 1) - at(i - k)
    }
  }
  return bars
}

export interface ShapeProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/**
 * Clips its children to the waveform's bars. Anything inside is just HTML
 * with CSS (backgrounds, gradients, images, video) and shows only through
 * the bars. Put `Track` and `Progress` in here.
 */
function Shape({ style, children, ...rest }: ShapeProps) {
  const id = 'sillon-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const path = useRef<SVGPathElement>(null)
  const scratch = useRef({})
  const last = useRef('')
  useStoreEffect((s, change) => {
    if (change === 'time') return
    const d = barsPath(s, scratch.current)
    if (d !== last.current) path.current!.setAttribute('d', (last.current = d))
  })
  return (
    <div {...rest} data-sillon-shape="" style={{ position: 'absolute', inset: 0, clipPath: `url(#${id})`, ...style }}>
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <path ref={path} />
        </clipPath>
      </svg>
      {children}
    </div>
  )
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Height of the placeholder bars, as a fraction of the waveform's height. */
  level?: number
  children?: ReactNode
}

/**
 * Stands in while the waveform loads: a row of even, low bars in the same
 * geometry. Style it like `Track`, or put anything inside, as with `Shape`.
 * Its opacity goes to 0 when the bars are ready; add a CSS transition on
 * opacity to fade between them, or leave it for an instant swap.
 */
function Skeleton({ level: at = 0.16, style, children, ...rest }: SkeletonProps) {
  const id = 'sillon-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const path = useRef<SVGPathElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useStoreEffect((s, change) => {
    if (change === 'time' || change === 'hover') return
    const ready = isReady(s)
    box.current!.style.opacity = ready ? '0' : ''
    if (ready || change === 'data') return
    const h = round1(clamp(at * s.height, s.minBarHeight, s.height)), parts: string[] = []
    for (let i = 0, n = barCount(s); i < n; i++) parts.push(barPath(s, i, h))
    path.current!.setAttribute('d', parts.join(''))
  }, {}, [at])
  return (
    <div {...rest} ref={box} data-sillon-skeleton="" aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', clipPath: `url(#${id})`, ...style }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <path ref={path} />
        </clipPath>
      </svg>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Fills */

const fill: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

/** The whole waveform. Style it like any div. */
function Track({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} data-sillon-track="" style={{ ...fill, ...style }} />
}

/**
 * The played part of the waveform, styled like `Track`. It's revealed with
 * two opposing transforms (an overflow-hidden window sliding right, its
 * contents sliding back left), so playback is compositor-only and
 * gradients and patterns stay pinned instead of stretching.
 */
function Progress({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  useStoreEffect((s, _c, t) => {
    const x = fraction(s, t)
    if (x === last.current) return
    last.current = x
    const pct = (1 - x) * 100
    outer.current!.style.transform = `translateX(${-pct}%)`
    inner.current!.style.transform = `translateX(${pct}%)`
  }, { time: true })
  return (
    <div ref={outer} data-sillon-progress="" style={{ ...fill, overflow: 'hidden', willChange: 'transform', transform: 'translateX(-100%)' }}>
      <div {...rest} ref={inner} style={{ ...fill, willChange: 'transform', transform: 'translateX(100%)', ...style }} />
    </div>
  )
}

/** A marker at the playhead. Zero width by default; give it a width and a background. */
function Cursor({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useStoreEffect((s, _c, t) => {
    ref.current!.style.transform = `translateX(${fraction(s, t) * s.width}px)`
  }, { time: true })
  return <div {...rest} ref={ref} data-sillon-cursor="" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, pointerEvents: 'none', willChange: 'transform', ...style }} />
}

/** Follows the pointer. Opacity 0 when the pointer is elsewhere; add a transition if you like. */
function Hover({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  useStoreEffect((s) => {
    const el = ref.current!
    el.style.opacity = s.hover === null ? '0' : '1'
    if (s.hover !== null) el.style.transform = `translateX(${timeToX(s, s.hover)}px)`
  }, { hover: true })
  return <div {...rest} ref={ref} data-sillon-hover="" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, pointerEvents: 'none', opacity: 0, willChange: 'transform', ...style }} />
}

export interface RegionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  start: number
  end: number
  /**
   * Makes the region editable: drag it to move it, drag a `RegionHandle`
   * inside it to resize. Called on every move with the new span.
   */
  onChange?: (start: number, end: number) => void
  /** Shortest span a resize can make, in seconds. */
  minLength?: number
}

type Edit = 'move' | 'start' | 'end'
const RegionContext = createContext<((e: PointerEvent<HTMLElement>, edit: Edit) => void) | null>(null)

/**
 * A span of time. Inside `Shape` it tints only the bars; outside, it's a box
 * over the whole height. With `onChange`, it can be moved and resized.
 */
function Region({ start, end, onChange, minLength = 0.1, style, onPointerDown, children, ...rest }: RegionProps) {
  const store = useWaveform()
  const ref = useRef<HTMLDivElement>(null)
  useStoreEffect((s, change) => {
    if (change === 'data') return
    const el = ref.current!
    const l = timeToX(s, start), r = timeToX(s, end)
    el.style.display = r < 0 || l > s.width || !s.width ? 'none' : ''
    el.style.transform = `translateX(${l}px)`
    el.style.width = `${Math.max(0, r - l)}px`
  }, {}, [start, end])

  const span = useRef({ start, end, onChange, minLength })
  span.current = { start, end, onChange, minLength }
  // Starts a move or resize. Seconds per pixel are read once, at the press.
  const begin = useCallback((e: PointerEvent<HTMLElement>, edit: Edit) => {
    const { start: a, end: b, onChange: change } = span.current
    if (!change || e.button !== 0) return
    // Keeps Root from seeking.
    e.preventDefault()
    const s = store.state
    const perPx = (s.end - s.start) / (s.width || 1)
    const total = s.peaks?.duration || s.player?.duration || s.end
    const x0 = e.clientX, target = e.currentTarget
    // The waveform's left edge on screen: one layout read per press.
    const left = ref.current!.getBoundingClientRect().left - timeToX(s, a)
    target.setPointerCapture(e.pointerId)
    let moved = false
    const move = (ev: globalThis.PointerEvent) => {
      moved ||= Math.abs(ev.clientX - x0) > 3
      if (!moved) return
      const d = (ev.clientX - x0) * perPx, min = span.current.minLength
      if (edit === 'move') {
        const shift = clamp(d, -a, total - b)
        change(a + shift, b + shift)
      } else if (edit === 'start') change(clamp(a + d, 0, b - min), b)
      else change(a, clamp(b + d, a + min, total))
    }
    const up = (ev: globalThis.PointerEvent) => {
      // A click that didn't drag seeks, as it would anywhere else on the waveform.
      if (!moved && ev.type === 'pointerup') s.player?.seek(clamp(s.start + (ev.clientX - left) * perPx, 0, total))
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }, [store])

  return (
    <RegionContext.Provider value={begin}>
      <div
        {...rest}
        ref={ref}
        data-sillon-region=""
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, ...style }}
        onPointerDown={(e) => {
          onPointerDown?.(e)
          if (!e.defaultPrevented) begin(e, 'move')
        }}
      >
        {children}
      </div>
    </RegionContext.Provider>
  )
}

export interface RegionHandleProps extends HTMLAttributes<HTMLDivElement> {
  /** Which edge this handle drags. */
  side: 'start' | 'end'
}

/**
 * A grip on one edge of an editable `Region`, as tall as the region and
 * zero width by default, like `Cursor`. Give it a width; center it on the
 * edge with `translate`. `data-sillon-handle` is "start" or "end".
 */
function RegionHandle({ side, style, onPointerDown, ...rest }: RegionHandleProps) {
  const begin = useContext(RegionContext)
  if (!begin) throw new Error('Waveform.RegionHandle must be inside <Waveform.Region>')
  return (
    <div
      {...rest}
      data-sillon-handle={side}
      style={{ position: 'absolute', top: 0, bottom: 0, [side === 'start' ? 'left' : 'right']: 0, ...style }}
      onPointerDown={(e) => {
        onPointerDown?.(e)
        if (!e.defaultPrevented) begin(e, side)
      }}
    />
  )
}

export interface TimeProps extends HTMLAttributes<HTMLSpanElement> {
  /** What to show. `hover` is blank when the pointer isn't over the waveform. */
  kind?: 'current' | 'duration' | 'remaining' | 'hover'
  format?: (seconds: number) => string
}

/** Text that keeps itself current without re-rendering. Writes only when the text changes. */
function Time({ kind = 'current', format = formatTime, ...rest }: TimeProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef<string | null>(null)
  useStoreEffect((s, _c, t) => {
    const total = s.player?.duration || s.end
    const text =
      kind === 'duration' ? format(total)
      : kind === 'hover' ? (s.hover === null ? '' : format(s.hover))
      : kind === 'remaining' ? '-' + format(total - t)
      : format(t)
    if (text !== last.current) ref.current!.textContent = last.current = text
  }, { time: kind === 'current' || kind === 'remaining', hover: kind === 'hover' }, [kind, format])
  return <span {...rest} ref={ref} data-sillon-time={kind} />
}

export interface MarkerProps extends HTMLAttributes<HTMLDivElement> {
  /** Seconds. */
  time: number
}

/**
 * A moment in time: a zero-width box at `time`, as tall as the waveform.
 * Put an avatar, a pin or a label inside. Hidden when outside the view, and
 * until the duration is known.
 */
function Marker({ time, style, ...rest }: MarkerProps) {
  const ref = useRef<HTMLDivElement>(null)
  useStoreEffect((s, change) => {
    if (change === 'data') return
    const el = ref.current!, x = timeToX(s, time)
    el.style.display = x < 0 || x > s.width || !s.width || s.end <= s.start ? 'none' : ''
    el.style.transform = `translateX(${x}px)`
  }, {}, [time])
  return <div {...rest} ref={ref} data-sillon-marker="" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, ...style }} />
}

export const Waveform = { Root, Shape, Skeleton, Track, Progress, Cursor, Hover, Region, RegionHandle, Time, Marker }

/* ---------------------------------------------------------------- Timed items */

const byTime = <T extends { time: number }>(items: readonly T[]) => [...items].sort((a, b) => a.time - b.time)
/** Index of the first item later than `t`. */
const after = (sorted: readonly { time: number }[], t: number) => {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].time <= t) lo = mid + 1; else hi = mid }
  return lo
}

export interface Group<T> {
  /** Stable while the group keeps the same first item and size. */
  key: string
  /** The first item's time; place the group's marker here. */
  time: number
  /** The last item's time. */
  end: number
  items: T[]
}

/**
 * Groups items that would sit closer than `gap` pixels apart at the current
 * zoom and width, so 200 comments on a 3-minute track don't pile up. Zoom in
 * and they split apart. Re-renders only when the grouping changes, not on
 * every zoom frame. Until the duration is known, each item is its own group.
 */
export function useGroups<T extends { time: number }>(items: readonly T[], gap = 24): Group<T>[] {
  const store = useWaveform()
  const sorted = useMemo(() => byTime(items), [items])
  const compute = () => {
    const s = store.state, groups: Group<T>[] = [], placed = s.end > s.start
    let cur: Group<T> | null = null, x0 = 0
    for (const item of sorted) {
      const x = timeToX(s, item.time)
      if (cur && placed && x - x0 < gap) { cur.items.push(item); cur.end = item.time }
      else { groups.push((cur = { key: '', time: item.time, end: item.time, items: [item] })); x0 = x }
    }
    for (const g of groups) g.key = `${g.time}:${g.items.length}`
    return groups
  }
  const [groups, setGroups] = useState(compute)
  const sig = useRef('')
  sig.current = groups.map((g) => g.key).join()
  useLayoutEffect(() => {
    const check = () => {
      const next = compute()
      const k = next.map((g) => g.key).join()
      if (k !== sig.current) { sig.current = k; setGroups(next) }
    }
    check()
    return store.subscribe((c) => c === 'layout' && check())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, sorted, gap])
  return groups
}

/**
 * The items whose time the playhead passed within the last `hold` seconds:
 * what to show "now", like comments popping up as a track plays. Re-renders
 * only when that set changes.
 */
export function useActive<T extends { time: number }>(items: readonly T[], hold = 3): T[] {
  const sorted = useMemo(() => byTime(items), [items])
  const [range, setRange] = useState<readonly [number, number]>([0, 0])
  useStoreEffect((_s, _c, t) => {
    const lo = after(sorted, t - hold), hi = after(sorted, t)
    setRange((r) => (r[0] === lo && r[1] === hi ? r : [lo, hi]))
  }, { time: true }, [sorted, hold])
  return useMemo(() => sorted.slice(range[0], range[1]), [sorted, range])
}
