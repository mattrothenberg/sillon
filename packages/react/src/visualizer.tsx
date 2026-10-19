import { useEffect, useRef, type CanvasHTMLAttributes, type Ref } from 'react'
import type { Player } from './player'

// An <audio> element can feed only one MediaElementSource, ever, so the
// analyser is shared per element. It's created on the first `play`, inside
// the user's gesture, because once the element is routed through an
// AudioContext it plays only while that context is running.
const graphs = new WeakMap<HTMLAudioElement, AnalyserNode>()

function analyserFor(audio: HTMLAudioElement): AnalyserNode {
  let analyser = graphs.get(audio)
  if (analyser) return analyser
  const ctx = new AudioContext()
  analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.7
  analyser.minDecibels = -90
  analyser.maxDecibels = -22
  ctx.createMediaElementSource(audio).connect(analyser)
  analyser.connect(ctx.destination)
  audio.addEventListener('play', () => void ctx.resume())
  void ctx.resume()
  graphs.set(audio, analyser)
  return analyser
}

export interface VisualizerProps extends CanvasHTMLAttributes<HTMLCanvasElement> {
  player: Player | null
  /** Number of rays around the circle. */
  rays?: number
  /** Where the rays start, as a fraction of the outer radius. */
  innerRadius?: number
  /** Ray thickness, in CSS pixels. */
  rayWidth?: number
  /** Ray length in silence, as a fraction of the space between the inner and outer radius. */
  idle?: number
  /** Averages each ray with this many neighbours on each side, for a rounder blob. */
  smoothing?: number
  ref?: Ref<HTMLCanvasElement>
}

/**
 * A live spectrum, drawn as rays around a circle. Low frequencies sit at
 * the lower left and high ones at the upper right, mirrored, so the outline
 * is one continuous blob. Colour is the canvas's CSS `color`. Draws only
 * while playing, and while settling back to rest after a pause.
 */
export function Visualizer({ player, rays = 96, innerRadius = 0.34, rayWidth = 1.4, idle = 0.1, smoothing = 2, style, ref, ...props }: VisualizerProps) {
  const own = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = own.current!
    const g = canvas.getContext('2d')!
    let raf = 0, w = 0, h = 0, dpr = 1, color = '', colorAt = -Infinity
    let analyser: AnalyserNode | null = player && graphs.get(player.audio) || null
    const half = Math.ceil(rays / 2)
    const level = new Float32Array(rays)
    const target = new Float32Array(rays)
    const blurred = new Float32Array(rays)
    let freq = new Uint8Array(0)
    // Log-spaced bands, 50 Hz to 14 kHz: bin ranges, filled once the sample rate is known.
    let bands: Int32Array | null = null

    const measure = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      colorAt = -Infinity
      draw()
    }

    const draw = () => {
      const now = performance.now()
      if (now - colorAt > 500) { color = getComputedStyle(canvas).color; colorAt = now }
      const R = Math.min(w, h) / 2, r0 = R * innerRadius, L = R - r0
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      g.strokeStyle = color
      g.lineWidth = rayWidth
      g.lineCap = 'round'
      g.beginPath()
      // Rays start at 12 o'clock and run clockwise.
      for (let i = 0; i < rays; i++) {
        const th = (i / rays) * 2 * Math.PI - Math.PI / 2
        const len = L * (idle + (1 - idle) * blurred[i])
        const c = Math.cos(th), s = Math.sin(th)
        g.moveTo(w / 2 + c * r0, h / 2 + s * r0)
        g.lineTo(w / 2 + c * (r0 + len), h / 2 + s * (r0 + len))
      }
      g.stroke()
    }

    const frame = () => {
      raf = 0
      const playing = !!player?.playing
      if (playing && analyser) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freq)
        if (!bands) {
          bands = new Int32Array(half + 1)
          const hz = analyser.context.sampleRate / analyser.fftSize
          for (let k = 0; k <= half; k++) bands[k] = Math.min(freq.length - 1, Math.round((50 * Math.pow(14000 / 50, k / half)) / hz))
        }
        for (let k = 0; k < half; k++) {
          let m = 0
          for (let b = bands[k]; b <= Math.max(bands[k], bands[k + 1] - 1); b++) m = Math.max(m, freq[b])
          const v = Math.pow(m / 255, 1.6)
          // Band k on both sides of a tilted axis, so the outline closes up smoothly and leans.
          const a = (k + Math.round(rays * 0.62)) % rays, b = (Math.round(rays * 0.62) - 1 - k + rays) % rays
          target[a] = v; target[b] = v
        }
      } else target.fill(0)
      // Quick to rise, slow to fall, so it breathes rather than flickers.
      let moving = false
      for (let i = 0; i < rays; i++) {
        const d = target[i] - level[i]
        level[i] += d * (d > 0 ? 0.45 : 0.1)
        if (Math.abs(d) > 0.002) moving = true
        else level[i] = target[i]
      }
      for (let i = 0; i < rays; i++) {
        let sum = 0
        for (let j = -smoothing; j <= smoothing; j++) sum += level[(i + j + rays) % rays]
        blurred[i] = sum / (2 * smoothing + 1)
      }
      draw()
      if (playing || moving) raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (player?.playing && !analyser) analyser = analyserFor(player.audio)
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    measure()
    // `play` follows the click that started playback, so the page has user activation and the context can start.
    const onPlay = () => { analyser ??= analyserFor(player!.audio); start() }
    player?.audio.addEventListener('play', onPlay)
    const unsub = player?.subscribe(start)
    if (player?.playing) onPlay()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      player?.audio.removeEventListener('play', onPlay)
      unsub?.()
    }
  }, [player, rays, innerRadius, rayWidth, idle, smoothing])

  return (
    <canvas
      {...props}
      ref={(node) => {
        own.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      data-sillon-visualizer=""
      style={{ display: 'block', width: '100%', height: '100%', ...style }}
    />
  )
}
