import { useLayoutEffect, useRef, useState } from 'react'
import { Waveform, formatTime, usePeaks, useWaveformStore, useZoom } from '@sillon/react'
import { Seg } from '../ui'
import { HEIGHT, ZOOM_MIN, ZOOM_ROOT, ZOOM_SPANS, ZOOM_TRACK } from '../snippets'
import { meta, shape, skeleton } from '../cls'

// Peaks made ahead of time (scripts/peaks.mjs), a small fraction of the audio's size.
const HOUR = '/audio/hour.peaks'

const SPANS = ZOOM_SPANS.map((s) => ({ value: String(s.seconds), label: s.label }))
type Span = string

const ease = (t: number) => 1 - Math.pow(1 - t, 4)
const fmtSpan = (s: number) => (s >= 120 ? formatTime(s) : `${s.toFixed(s < 10 ? 1 : 0)} s`)

// The gestures are useZoom's, as in the snippet. The site adds eased span buttons
// and an overview; every frame of either is a `setView`, with no re-render, and
// the readout and the overview's window are written straight to the DOM.
export function Zoom() {
  const { peaks } = usePeaks(HOUR)
  const store = useWaveformStore()
  const zoom = useZoom(store, { min: ZOOM_MIN, drag: true })
  const [active, setActive] = useState<Span>('3600')
  const anim = useRef(0)
  const windowEl = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLElement>(null)
  // The span a button asked for, while it eases there; a gesture clears the pressed button.
  const target = useRef<number | null>(3600)

  useLayoutEffect(() => {
    const paint = () => {
      const s = store.state, total = s.peaks?.duration || 3600, span = s.end - s.start
      if (!s.end) return
      const w = windowEl.current!.style
      w.left = `${(s.start / total) * 100}%`
      w.width = `max(2px, ${(span / total) * 100}%)`
      readout.current!.textContent = `Showing ${fmtSpan(span)} of ${formatTime(total)}`
      if (target.current === null) return
      const asked = Math.min(target.current, total)
      if (!anim.current && Math.abs(span - asked) > 0.01) { target.current = null; setActive('') }
    }
    paint()
    return store.subscribe((c) => c === 'layout' && paint())
  }, [store])

  const animateTo = (span: number) => {
    cancelAnimationFrame(anim.current)
    target.current = span
    const from = Math.log(store.state.end - store.state.start || span), to = Math.log(span), t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 900)
      anim.current = t < 1 ? requestAnimationFrame(step) : 0
      zoom.zoomTo(Math.exp(from + (to - from) * ease(t)))
    }
    anim.current = requestAnimationFrame(step)
  }

  // The overview: press or drag to move the view there.
  const dragging = useRef(false)
  const centerAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), s = store.state
    const at = ((e.clientX - r.left) / r.width) * (s.peaks?.duration || 3600)
    zoom.panBy(at - (s.start + s.end) / 2)
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Seg label="Visible span" value={active} onChange={(v) => { setActive(v); if (v) animateTo(Number(v)) }} options={SPANS} />
        <span className={meta}><b ref={readout} /></span>
      </div>
      <Waveform.Root
        ref={zoom.ref}
        store={store}
        peaks={peaks}
        barWidth={2}
        barGap={1}
        barRadius={1}
        interactive={false}
        className={`${HEIGHT.zoom} ${ZOOM_ROOT} cursor-grab active:cursor-grabbing`}
        onPointerDown={() => { cancelAnimationFrame(anim.current); anim.current = 0 }}
      >
        <Waveform.Skeleton className={skeleton} />
        <Waveform.Shape className={shape}>
          <Waveform.Track className={ZOOM_TRACK} />
        </Waveform.Shape>
      </Waveform.Root>
      <div
        className="relative mt-6 cursor-pointer touch-none [&_[data-sillon]]:cursor-[inherit]"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); cancelAnimationFrame(anim.current); anim.current = 0; dragging.current = true; centerAt(e) }}
        onPointerMove={(e) => dragging.current && centerAt(e)}
        onPointerUp={() => (dragging.current = false)}
      >
        <Waveform.Root peaks={peaks} barWidth={1} barGap={1} interactive={false} style={{ height: 32 }}>
          <Waveform.Skeleton className={skeleton} />
          <Waveform.Shape className={shape}>
            <Waveform.Track className="bg-track" />
          </Waveform.Shape>
        </Waveform.Root>
        <div ref={windowEl} className="pointer-events-none absolute -inset-y-1 left-0 w-full rounded-md bg-accent/14 shadow-[inset_0_0_0_1.5px_var(--color-accent)]" />
      </div>
    </div>
  )
}
