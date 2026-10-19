import { useEffect, useRef, useState } from 'react'
import { Waveform, formatTime, usePeaks, useWaveformStore } from '@sillon/react'
import { CodeTabs, Seg } from '../ui'

const HOUR = '/audio/hour.mp3'

const SPANS = [
  { value: '3600', label: '1 h' },
  { value: '600', label: '10 min' },
  { value: '60', label: '1 min' },
  { value: '5', label: '5 s' },
] as const
type Span = (typeof SPANS)[number]['value'] | ''

const MIN_SPAN = 2

const JSX = `import { Waveform, useAudio, useWaveformStore } from '@sillon/react'

export function Zoomable() {
  const { peaks } = useAudio('/hour.mp3')
  const store = useWaveformStore()

  // Show one minute, from 12:00. Cheap enough to call on every frame of a gesture.
  const zoomIn = () => store.setView(720, 780)

  return (
    <Waveform.Root store={store} peaks={peaks} onDoubleClick={zoomIn}>
      <Waveform.Shape>
        <Waveform.Track className="track" />
      </Waveform.Shape>
    </Waveform.Root>
  )
}`
const ease = (t: number) => 1 - Math.pow(1 - t, 4)
const fmtSpan = (s: number) => (s >= 120 ? formatTime(s) : `${s.toFixed(s < 10 ? 1 : 0)} s`)

// Every frame of a zoom calls `store.setView()` directly: no state, no
// re-render. The readout is written to its text node the same way.
export function Zoom() {
  const { peaks } = usePeaks(HOUR)
  const store = useWaveformStore()
  const [active, setActive] = useState<Span>('3600')
  const view = useRef({ center: 1800, span: 3600 })
  const anim = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const windowEl = useRef<HTMLDivElement>(null)
  const out = { span: useRef<HTMLElement>(null) }
  const applyRef = useRef(() => {})

  useEffect(() => {
    const apply = () => {
      const total = peaks?.duration || 3600
      const v = view.current
      v.span = Math.min(total, Math.max(MIN_SPAN, v.span))
      v.center = Math.min(total - v.span / 2, Math.max(v.span / 2, v.center))
      store.setView(v.center - v.span / 2, v.center + v.span / 2)
      const w = windowEl.current!.style
      w.left = `${((v.center - v.span / 2) / total) * 100}%`
      w.width = `max(2px, ${(v.span / total) * 100}%)`
      out.span.current!.textContent = `Showing ${fmtSpan(v.span)} of ${formatTime(total)}`
    }
    applyRef.current = apply
    apply()
    return peaks?.subscribe(() => { if (!peaks.complete) return; apply() })
  }, [peaks, store])

  const animateTo = (span: number) => {
    cancelAnimationFrame(anim.current)
    const from = Math.log(view.current.span), to = Math.log(span), t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 900)
      view.current.span = Math.exp(from + (to - from) * ease(t))
      applyRef.current()
      if (t < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }

  // Pinch (ctrl+wheel on trackpads) zooms around the pointer; sideways scroll pans.
  // Plain vertical scrolling is left alone so the page still scrolls.
  useEffect(() => {
    const el = stage.current!
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect()
      const v = view.current
      if (e.ctrlKey) {
        e.preventDefault()
        cancelAnimationFrame(anim.current)
        const at = v.center - v.span / 2 + ((e.clientX - r.left) / r.width) * v.span
        const k = Math.exp(e.deltaY * 0.012)
        const next = Math.min(3600, Math.max(MIN_SPAN, v.span * k))
        v.center = at + (v.center - at) * (next / v.span)
        v.span = next
        setActive('')
        applyRef.current()
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        v.center += (e.deltaX / r.width) * v.span
        applyRef.current()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const drag = useRef<{ x: number; center: number; overview: boolean } | null>(null)
  const pan = (e: React.PointerEvent<HTMLDivElement>, overview: boolean) => {
    const r = e.currentTarget.getBoundingClientRect()
    const v = view.current
    if (overview) v.center = ((e.clientX - r.left) / r.width) * (peaks?.duration || 3600)
    else if (drag.current) v.center = drag.current.center - ((e.clientX - drag.current.x) / r.width) * v.span
    applyRef.current()
  }
  const pointer = (overview: boolean) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      cancelAnimationFrame(anim.current)
      drag.current = { x: e.clientX, center: view.current.center, overview }
      if (overview) pan(e, true)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => drag.current && pan(e, overview),
    onPointerUp: () => (drag.current = null),
  })

  return (
    <section id="zoom">
      <div className="lede">
        <h2>Long files</h2>
        <p>An hour-long recording. Pinch or scroll sideways to zoom, drag to pan. <code>store.setView(start, end)</code> sets the visible range.</p>
      </div>
      <div className="wide">
        <div className="plate">
          <div className="plate-head">
            <Seg label="Visible span" value={active} onChange={(v) => { setActive(v); if (v) animateTo(Number(v)) }} options={SPANS} />
            <span className="meta zoom-readout">
              <span><b ref={out.span} /></span>
            </span>
          </div>
          <div ref={stage} className="zoom-stage" {...pointer(false)}>
            <Waveform.Root store={store} peaks={peaks} barWidth={2} barGap={1} barRadius={1} interactive={false} style={{ height: 160 }}>
              <Waveform.Skeleton className="skeleton" />
              <Waveform.Shape>
                <Waveform.Track style={{ background: 'var(--ink)' }} />
              </Waveform.Shape>
            </Waveform.Root>
          </div>
          <div className="overview" {...pointer(true)}>
            <Waveform.Root peaks={peaks} barWidth={1} barGap={1} interactive={false} style={{ height: 32 }}>
              <Waveform.Skeleton className="skeleton" />
              <Waveform.Shape>
                <Waveform.Track style={{ background: 'var(--track)' }} />
              </Waveform.Shape>
            </Waveform.Root>
            <div ref={windowEl} className="overview-window" />
          </div>
        </div>
        <div className="demo-code">
          <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }]} />
        </div>
      </div>
    </section>
  )
}
