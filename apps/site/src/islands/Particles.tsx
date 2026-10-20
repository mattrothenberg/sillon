import { useEffect, useRef } from 'react'
import { timeToX, useWaveform } from '@sillon/react'

// Particles thrown off the playhead, built on sillon's public data: the store
// (size, view, peaks, gain), the player's time, and the peaks' loudness right
// at the playhead. A canvas of its own, a little taller than the waveform so
// particles can leave it. It runs only while the song plays, plus the moment
// it takes the last particles to fade.

export interface ParticleLook {
  /** Particles per second at full loudness. */
  rate: number
  /** Seconds a particle lives, as [min, max]. */
  life: [number, number]
  /** Upward speed at full loudness, px/s, as [min, max]. */
  rise: [number, number]
  /** Sideways speed, px/s, as [min, max]; negative trails behind the playhead. */
  drift: [number, number]
  /** Downward pull, px/s². Negative floats up. */
  gravity: number
  /** Radius in px, as [min, max]. */
  size: [number, number]
  /** Where on the bar particles start: 1 is the tip, 0 anywhere along it. */
  fromTip: number
  /** A CSS color, or a custom property name like '--color-ink' to follow the theme. */
  color: string
  /** Add light where particles overlap. */
  glow?: boolean
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

interface P { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number }

/** `over` and `under`: room in px above and below the waveform that particles may fly into. */
export function Particles({ look, over = 70, under = 30 }: { look: ParticleLook; over?: number; under?: number }) {
  const store = useWaveform()
  const canvas = useRef<HTMLCanvasElement>(null)
  const lookRef = useRef(look)
  lookRef.current = look

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    const ps: P[] = []
    let raf = 0, last = 0, owed = 0, fill = '', fillAt = -Infinity
    let player = store.state.player

    const frame = (now: number) => {
      const s = store.state, L = lookRef.current
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0)
      last = now
      const dpr = Math.min(2, devicePixelRatio || 1)
      const w = s.width, h = s.height + over + under
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr) }

      // New particles, as many as the loudness at the playhead calls for.
      const p = s.player
      if (p?.playing && s.peaks && w) {
        const t = p.time
        const loud = Math.min(1, s.peaks.peak(Math.max(0, t - 0.03), t + 0.03) * s.gain)
        // A soft curve with a small floor: quiet passages still give a few, loud ones many.
        owed += L.rate * (0.12 + Math.pow(loud, 1.5)) * dt
        const x = timeToX(s, t), half = (loud * s.height) / 2
        const mid = s.align === 'bottom' ? s.height - half : s.align === 'top' ? half : s.height / 2
        for (; owed >= 1; owed--) {
          const along = L.fromTip + (1 - L.fromTip) * Math.random()
          const up = Math.random() < 0.5 || s.align !== 'center'
          ps.push({
            x: x + rand(-1, 1) * s.barWidth,
            y: over + (up ? mid - half * along : mid + half * along),
            vx: rand(L.drift[0], L.drift[1]),
            vy: -rand(L.rise[0], L.rise[1]) * (0.35 + 0.65 * loud) * (up ? 1 : -0.4),
            age: 0, life: rand(L.life[0], L.life[1]), r: rand(L.size[0], L.size[1]),
          })
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = L.glow ? 'lighter' : 'source-over'
      // A theme color is read from CSS twice a second, not every frame.
      if (now - fillAt > 500) { fillAt = now; fill = L.color.startsWith('--') ? getComputedStyle(el).getPropertyValue(L.color).trim() : L.color }
      ctx.fillStyle = fill
      for (let i = ps.length - 1; i >= 0; i--) {
        const q = ps[i]
        q.age += dt
        if (q.age >= q.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue }
        q.vy += L.gravity * dt
        q.vx *= 1 - 0.8 * dt
        q.x += q.vx * dt
        q.y += q.vy * dt
        const f = 1 - q.age / q.life
        ctx.globalAlpha = f * f
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.r * (0.4 + 0.6 * f), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (p?.playing || ps.length) raf = requestAnimationFrame(frame)
      else { raf = 0; last = 0; owed = 0 }
    }
    const wake = () => { if (!raf && store.state.player?.playing) raf = requestAnimationFrame(frame) }
    let unPlayer = player?.subscribe(wake)
    const unStore = store.subscribe((c) => {
      if (c === 'layout' && store.state.player !== player) { unPlayer?.(); player = store.state.player; unPlayer = player?.subscribe(wake); wake() }
    })
    wake()
    return () => { cancelAnimationFrame(raf); unPlayer?.(); unStore() }
  }, [store, over, under])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, top: -over, width: '100%', height: `calc(100% + ${over + under}px)`, pointerEvents: 'none' }}
    />
  )
}
