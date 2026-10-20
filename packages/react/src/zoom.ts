import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { WaveformState, WaveformStore } from './waveform'

export interface ZoomOptions {
  /** Shortest view, in seconds. Default `1`. */
  min?: number
  /** Longest view, in seconds. Default: the whole file. */
  max?: number
  /**
   * Keep the playhead in view while playing. `true` turns the page when the
   * playhead reaches an edge; `'center'` keeps it in the middle. Off by default.
   */
  follow?: boolean | 'center'
  /**
   * Pan by dragging with a mouse, pen or one finger. Off by default, since
   * dragging an interactive Root seeks: use it with `interactive={false}`.
   * One-finger drags on touch screens also need `touch-action: pan-y` (or
   * `none`) on the element, or the browser takes them.
   */
  drag?: boolean
}

export interface Zoom {
  /**
   * Attach to the element that takes the gestures: `Waveform.Root`'s `ref`,
   * or a wrapper around it.
   */
  ref: (el: HTMLElement | null) => void
  /** Shows `seconds` of audio, keeping the time `around` (default: the view's center) where it is on screen. */
  zoomTo(seconds: number, around?: number): void
  /** Multiplies the visible span by `factor`: `2` shows twice as much, `0.5` half. */
  zoomBy(factor: number, around?: number): void
  /** Moves the view by `seconds`; negative moves left. */
  panBy(seconds: number): void
  /** Shows the whole file again, following its end as it loads. */
  reset(): void
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
const duration = (s: WaveformState) => s.peaks?.duration || s.player?.duration || 0
// Zoom per pixel of wheel delta: a notch of a mouse wheel (100 px) is about 3.3×.
const WHEEL_ZOOM = 0.012
// A new wheel gesture after this long re-reads the element's position.
const GESTURE_GAP_MS = 250

/**
 * Zooming and panning for a waveform, the way the wavesurfer.js Zoom plugin
 * and `autoScroll` do it. Ctrl or ⌘ with the wheel, and trackpad pinches,
 * zoom around the pointer; a sideways wheel (or Shift with the wheel) pans; a
 * two-finger pinch on a touch screen zooms around the fingers. A plain
 * vertical wheel is left alone, so the page still scrolls.
 *
 * Every step calls `store.setView()`: gestures never re-render React. Views
 * are clamped to the audio, and nothing happens until its duration is known.
 *
 *   const store = useWaveformStore()
 *   const zoom = useZoom(store, { min: 5 })
 *   <Waveform.Root ref={zoom.ref} store={store} peaks={peaks}>…</Waveform.Root>
 */
export function useZoom(store: WaveformStore, options: ZoomOptions = {}): Zoom {
  const opts = useRef(options)
  opts.current = options

  const api = useMemo(() => {
    /** The span the options allow, given the audio's length. */
    const fit = (span: number, total: number) => {
      const longest = Math.min(total, opts.current.max ?? total)
      return clamp(span, Math.min(opts.current.min ?? 1, longest), longest)
    }
    /** Shows `span` seconds from `start`, both clamped. The whole file follows the end of the audio. */
    const show = (start: number, span: number) => {
      const total = duration(store.state)
      if (!total) return
      if (span >= total) return store.setView(0, null)
      store.setView(clamp(start, 0, total - span), clamp(start, 0, total - span) + span)
    }
    const view = () => {
      const s = store.state
      return { start: s.start, span: s.end - s.start || duration(s) }
    }
    const zoomTo = (seconds: number, around?: number) => {
      const total = duration(store.state)
      if (!total || !(seconds > 0)) return
      const v = view(), span = fit(seconds, total)
      const at = around ?? v.start + v.span / 2
      // The time `at` stays at the same fraction of the width.
      const f = v.span ? (at - v.start) / v.span : 0.5
      show(at - f * span, span)
    }
    const zoomBy = (factor: number, around?: number) => zoomTo(view().span * factor, around)
    const panBy = (seconds: number) => {
      const v = view()
      show(v.start + seconds, v.span)
    }
    const reset = () => store.setView(0, null)
    return { fit, show, view, zoomTo, zoomBy, panBy, reset }
  }, [store])

  const detach = useRef<(() => void) | undefined>(undefined)
  const ref = useCallback((el: HTMLElement | null) => {
    detach.current?.()
    detach.current = el ? attach(el, store, api, opts) : undefined
  }, [store, api])

  const follow = options.follow ?? false
  useEffect(() => {
    if (!follow) return
    let player: WaveformState['player'] = null
    let off: (() => void) | undefined
    const onTime = (t: number) => {
      if (!player?.playing) return
      const s = store.state, span = s.end - s.start
      if (!span || span >= duration(s)) return
      if (follow === 'center') api.show(t - span / 2, span)
      else if (t >= s.end || t < s.start) api.show(t, span)
    }
    const bind = () => {
      if (store.state.player === player) return
      off?.()
      player = store.state.player
      off = player?.onTime(onTime)
    }
    bind()
    const unsub = store.subscribe((c) => c === 'layout' && bind())
    return () => { unsub(); off?.() }
  }, [store, api, follow])

  return useMemo(() => ({ ref, zoomTo: api.zoomTo, zoomBy: api.zoomBy, panBy: api.panBy, reset: api.reset }), [ref, api])
}

type Api = {
  fit: (span: number, total: number) => number
  show: (start: number, span: number) => void
  view: () => { start: number; span: number }
  zoomBy: (factor: number, around?: number) => void
  panBy: (seconds: number) => void
}

/** Native listeners: wheel and touchmove must be non-passive to stop the page zooming or scrolling sideways. */
function attach(el: HTMLElement, store: WaveformStore, api: Api, opts: { current: ZoomOptions }): () => void {
  // The element's position, read once per gesture rather than on every event.
  let rect: DOMRect | null = null, lastWheel = -Infinity
  const rectAt = (now: number, fresh = false) => {
    if (fresh || !rect || now - lastWheel > GESTURE_GAP_MS) rect = el.getBoundingClientRect()
    return rect
  }
  /** The time under a viewport x. */
  const timeAt = (r: DOMRect, clientX: number) => {
    const v = api.view()
    return v.start + clamp((clientX - r.left) / (r.width || 1), 0, 1) * v.span
  }

  const onWheel = (e: WheelEvent) => {
    const s = store.state
    if (!duration(s) || !s.width) return
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? s.width : 1
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const r = rectAt(e.timeStamp)
      lastWheel = e.timeStamp
      api.zoomBy(Math.exp(e.deltaY * unit * WHEEL_ZOOM), timeAt(r, e.clientX))
      return
    }
    // Shift turns a vertical wheel sideways, as browsers do for scrolling.
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? 0 : e.deltaY
    if (Math.abs(dx) <= Math.abs(dy)) return
    e.preventDefault()
    lastWheel = e.timeStamp
    api.panBy(((dx * unit) / s.width) * api.view().span)
  }

  // Two-finger pinch: the time under the fingers' first midpoint stays under their midpoint.
  let pinch: { distance: number; at: number; span: number; rect: DOMRect } | null = null
  const two = (t: TouchList) => ({ distance: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), mid: (t[0].clientX + t[1].clientX) / 2 })
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !duration(store.state)) return
    drag = null
    const r = rectAt(e.timeStamp, true), { distance, mid } = two(e.touches)
    pinch = { distance: distance || 1, at: timeAt(r, mid), span: api.view().span, rect: r }
  }
  const onTouchMove = (e: TouchEvent) => {
    if (!pinch || e.touches.length !== 2) return
    e.preventDefault()
    const { distance, mid } = two(e.touches)
    const span = api.fit((pinch.span * pinch.distance) / (distance || 1), duration(store.state))
    const f = clamp((mid - pinch.rect.left) / (pinch.rect.width || 1), 0, 1)
    api.show(pinch.at - f * span, span)
  }
  const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null }

  // Optional drag to pan.
  let drag: { x: number; start: number; span: number; width: number } | null = null
  const onPointerDown = (e: PointerEvent) => {
    if (!opts.current.drag || e.button !== 0 || pinch || !duration(store.state)) return
    const v = api.view()
    drag = { x: e.clientX, start: v.start, span: v.span, width: rectAt(e.timeStamp, true).width || 1 }
    el.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return
    api.show(drag.start - ((e.clientX - drag.x) / drag.width) * drag.span, drag.span)
  }
  const onPointerUp = () => { drag = null }

  const passive = { passive: false } as const
  el.addEventListener('wheel', onWheel, passive)
  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, passive)
  el.addEventListener('touchend', onTouchEnd)
  el.addEventListener('touchcancel', onTouchEnd)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
  return () => {
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchEnd)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('pointercancel', onPointerUp)
  }
}
