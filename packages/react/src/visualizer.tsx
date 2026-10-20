import { useEffect, useRef, type CanvasHTMLAttributes, type Ref } from 'react'
import type { Player } from './player'
import { colorParser } from './gl'

// An <audio> element can feed only one MediaElementSource, ever, so the
// analyser is shared per element. It's created on the first `play`, inside
// the user's gesture, because once the element is routed through an
// AudioContext it plays only while that context is running. Every element
// shares one AudioContext: browsers limit how many a page can have.
const graphs = new WeakMap<HTMLAudioElement, AnalyserNode>()
let shared: AudioContext | null = null

function analyserFor(audio: HTMLAudioElement): AnalyserNode {
  let analyser = graphs.get(audio)
  if (analyser) return analyser
  const ctx = (shared ??= new AudioContext())
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
  /** The player to listen to. Its audio is routed through Web Audio on the first play. */
  player: Player | null
  /** Number of rays around the circle. Default 96. */
  rays?: number
  /** Where the rays start, as a fraction of the outer radius. Default 0.34. */
  innerRadius?: number
  /** Ray thickness, in CSS pixels. Default 1.4. */
  rayWidth?: number
  /** Ray length in silence, as a fraction of the space between the inner and outer radius. Default 0.1. */
  idle?: number
  /** Averages each ray with this many neighbors on each side, for a smoother shape. Default 2. */
  smoothing?: number
  /** Lowest frequency shown, in Hz. Default 50. */
  minHz?: number
  /** Highest frequency shown, in Hz. Default 10000. */
  maxHz?: number
  /**
   * Fits the display to the music: the range widens to the lowest and
   * highest frequencies the audio has reached (within `minHz`–`maxHz`), so a
   * track with no bass or no treble leaves no rays dead, and each band is measured against its own
   * recent peak, so quiet bands still move. On by default; off shows
   * `minHz`–`maxHz` at true relative loudness.
   */
  autoLevel?: boolean
  /**
   * GLSL for `vec4 shade(Ray r)`: draws with WebGL2 instead, calling it for every
   * pixel with the spectrum around it (see Ray below). Also in scope: `level`
   * (overall loudness, 0–1), `time` (the audio's current time, seconds),
   * `color` (the canvas's CSS color) and `rayWidth`. Without it, rays are drawn
   * on a 2D canvas.
   */
  fragment?: string
  /** The canvas. Needs React 19, where `ref` is a prop. */
  ref?: Ref<HTMLCanvasElement>
}

/** What a Visualizer `fragment` is given for each pixel. */
const RAY = `struct Ray {
  float index;   // the nearest ray, counting clockwise from 12 o'clock
  float value;   // its level, 0–1
  float contour; // the level at this pixel's exact angle, between rays: a continuous outline
  float angle;   // this pixel's angle, 0–1 clockwise from 12 o'clock
  float radius;  // this pixel's distance from the center, 0–1 of the outer radius
  float inner;   // where rays start, 0–1
  float reach;   // where the nearest ray ends, 0–1
  float across;  // distance from the nearest ray's center line, CSS pixels
};`

/** The 2D drawing's look as a `fragment`: a thin ray of the CSS color. A place to start your own. */
export const visualizerRays = `vec4 shade(Ray r) {
  float w = rayWidth * 0.5;
  float side = 1.0 - smoothstep(w - 0.5, w + 0.5, r.across);
  float len = step(r.inner, r.radius) * (1.0 - smoothstep(r.reach - 0.004, r.reach, r.radius));
  return vec4(color.rgb, color.a * side * len);
}`

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const frag = (shade: string) => `#version 300 es
precision highp float;
uniform sampler2D rays;
uniform vec2 size;   // CSS pixels
uniform float dpr, count, inner, idle, rayWidth, level, time;
uniform vec4 color;
out vec4 o;

${RAY}

float rayAt(float i) { return texelFetch(rays, ivec2(int(mod(i, count)), 0), 0).r; }

${shade}

void main() {
  vec2 q = gl_FragCoord.xy / dpr - size * 0.5;      // y up
  float R = min(size.x, size.y) * 0.5;
  float a = fract(atan(q.x, q.y) / 6.28318530718); // 0 at 12 o'clock, clockwise
  float x = a * count;
  float k = mod(floor(x + 0.5), count);
  Ray r;
  r.index = k;
  r.value = rayAt(k);
  float i0 = floor(x);
  r.contour = mix(rayAt(i0), rayAt(i0 + 1.0), x - i0);
  r.angle = a;
  r.radius = length(q) / R;
  r.inner = inner;
  r.reach = inner + (1.0 - inner) * (idle + (1.0 - idle) * r.value);
  // Arc length from the ray's center line, at this radius.
  r.across = abs(x - floor(x + 0.5)) / count * 6.28318530718 * length(q);
  vec4 c = shade(r);
  o = vec4(c.rgb * c.a, c.a);
}`

type Draw = (blurred: Float32Array, now: number) => void

const UNIFORMS = ['size', 'dpr', 'count', 'inner', 'idle', 'rayWidth', 'level', 'time', 'color'] as const
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>

/**
 * Sets up WebGL on `canvas` for `shade`; returns the draw call and a cleanup, or null without
 * WebGL2. If the browser drops the context, everything is rebuilt when it comes back, and
 * `restored` is called so the caller can draw again.
 */
function glDrawer(canvas: HTMLCanvasElement, shade: string, opts: () => { dpr: number; w: number; h: number; rays: number; inner: number; idle: number; rayWidth: number; time: number }, restored: () => void): { draw: Draw; dispose: () => void } | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
  if (!gl) return null
  const shader = (type: number, src: string) => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    return sh
  }
  const build = () => {
    const prog = gl.createProgram()!
    const fs = shader(gl.FRAGMENT_SHADER, frag(shade))
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { prog, error: gl.getShaderInfoLog(fs) ?? gl.getProgramInfoLog(prog) }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    // Looked up once per program, not every frame.
    const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Uniforms
    return { prog, buf, tex, U }
  }
  const first = build()
  // A shader that doesn't compile is reported, and the canvas stays blank rather than taking the page down.
  if ('error' in first) {
    console.error(`Visualizer: the fragment shader didn't compile.\n${first.error}`)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }
  let res: Exclude<ReturnType<typeof build>, { error: unknown }> | null = first
  const parse = colorParser()
  let count = 0, rgba = [0, 0, 0, 1], colorAt = -Infinity
  const draw: Draw = (blurred, now) => {
    if (!res) return
    const { U } = res
    const o = opts()
    const w = Math.round(o.w * o.dpr), h = Math.round(o.h * o.dpr)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    gl.viewport(0, 0, canvas.width, canvas.height)
    if (count !== o.rays) { count = o.rays; gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, count, 1, 0, gl.RED, gl.FLOAT, null) }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, count, 1, gl.RED, gl.FLOAT, blurred)
    if (now - colorAt > 500) { colorAt = now; rgba = parse(getComputedStyle(canvas).color, rgba) }
    let sum = 0
    for (let i = 0; i < count; i++) sum += blurred[i]
    gl.uniform2f(U.size, o.w, o.h)
    gl.uniform1f(U.dpr, o.dpr)
    gl.uniform1f(U.count, count)
    gl.uniform1f(U.inner, o.inner)
    gl.uniform1f(U.idle, o.idle)
    gl.uniform1f(U.rayWidth, o.rayWidth)
    gl.uniform1f(U.level, count ? sum / count : 0)
    gl.uniform1f(U.time, o.time)
    gl.uniform4fv(U.color, rgba)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  const onLost = (e: Event) => { e.preventDefault(); res = null }
  const onRestored = () => {
    const next = build()
    res = 'error' in next ? null : next
    count = 0
    colorAt = -Infinity
    restored()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)
  return {
    draw,
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      if (res) { gl.deleteTexture(res.tex); gl.deleteBuffer(res.buf); gl.deleteProgram(res.prog) }
    },
  }
}

/**
 * A live spectrum, drawn as rays around a circle. Low frequencies sit at
 * the lower left and high ones at the upper right, mirrored, so the outline
 * is one continuous blob. Color is the canvas's CSS `color`. Draws only
 * while playing, and while settling back to rest after a pause. With
 * `fragment`, draws with WebGL and your shader instead.
 *
 * Routes the player's `<audio>` through an `AnalyserNode` on the first play,
 * permanently; every player shares one `AudioContext`. Audio from another origin then needs CORS headers and
 * `crossOrigin` set before it loads, or it plays silent.
 */
export function Visualizer({ player, rays = 96, innerRadius = 0.34, rayWidth = 1.4, idle = 0.1, smoothing = 2, minHz = 50, maxHz = 10000, autoLevel = true, fragment, style, ref, ...props }: VisualizerProps) {
  const own = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = own.current!
    // One context per canvas: the canvas is keyed on the renderer, so switching gets a fresh one.
    const webgl = fragment ? glDrawer(canvas, fragment, () => ({ dpr, w, h, rays, inner: innerRadius, idle, rayWidth, time: player?.time ?? 0 }), () => draw()) : null
    // Null when the canvas already holds a WebGL context that failed: then it stays blank.
    const g = webgl ? null : canvas.getContext('2d')
    let raf = 0, w = 0, h = 0, dpr = 1, color = '', colorAt = -Infinity
    let analyser: AnalyserNode | null = player && graphs.get(player.audio) || null
    const half = Math.ceil(rays / 2)
    const level = new Float32Array(rays)
    const target = new Float32Array(rays)
    const blurred = new Float32Array(rays)
    let freq = new Uint8Array(0)
    // Log-spaced bands from lowHz to topHz: bin ranges, filled once the sample rate is known.
    let bands: Int32Array | null = null
    // With autoLevel, the range starts at 200 Hz–2 kHz and widens to what the audio reaches.
    let lowHz = autoLevel ? Math.max(minHz, 200) : minHz
    let topHz = autoLevel ? Math.min(maxHz, 2000) : maxHz
    // Each band's recent peak, fading slowly, for autoLevel.
    const peak = new Float32Array(half).fill(0.15)

    const measure = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      w = canvas.clientWidth; h = canvas.clientHeight
      if (!webgl) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }
      colorAt = -Infinity
      draw()
    }

    const draw = () => {
      const now = performance.now()
      if (webgl) return webgl.draw(blurred, now)
      if (!g) return
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
        const hz = analyser.context.sampleRate / analyser.fftSize
        if (autoLevel) {
          // Lowest and highest bins above about -80 dB. Only widens, by 5% steps, so bands don't shuffle every frame.
          const last = Math.min(freq.length - 1, Math.round(maxHz / hz))
          let lo = Math.max(1, Math.round(minHz / hz)), hi = last
          while (lo < last && freq[lo] < 32) lo++
          while (hi > 0 && freq[hi] < 32) hi--
          const loHz = Math.max(minHz, lo * hz), hiHz = Math.min(maxHz, hi * hz)
          if (hi >= lo && loHz < lowHz / 1.05) { lowHz = loHz; bands = null }
          if (hi >= lo && hiHz > topHz * 1.05) { topHz = hiHz; bands = null }
        }
        if (!bands) {
          bands = new Int32Array(half + 1)
          for (let k = 0; k <= half; k++) bands[k] = Math.min(freq.length - 1, Math.round((lowHz * Math.pow(topHz / lowHz, k / half)) / hz))
        }
        for (let k = 0; k < half; k++) {
          let m = 0
          for (let b = bands[k]; b <= Math.max(bands[k], bands[k + 1] - 1); b++) m = Math.max(m, freq[b])
          let v: number
          if (autoLevel) {
            // Music loses energy as pitch rises: lift bands by 3 dB per octave above 1 kHz (the byte scale spans 68 dB),
            // then compare each with its own recent peak. Silence isn't lifted, or empty bands would sit at a fixed length.
            const hzMid = lowHz * Math.pow(topHz / lowHz, (k + 0.5) / half)
            const x = m ? Math.min(1, Math.max(0, m / 255 + (3 * Math.log2(hzMid / 1000)) / 68)) : 0
            peak[k] = Math.max(x, peak[k] * 0.999, 0.15)
            v = Math.pow(x / peak[k], 2.4)
          } else v = Math.pow(m / 255, 1.6)
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
      webgl?.dispose()
      player?.audio.removeEventListener('play', onPlay)
      unsub?.()
    }
  }, [player, rays, innerRadius, rayWidth, idle, smoothing, minHz, maxHz, autoLevel, fragment])

  return (
    <canvas
      {...props}
      key={fragment ? 'gl' : '2d'}
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
