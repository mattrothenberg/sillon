// An opt-in WebGL2 renderer. It draws the same bars as Shape, and lets you color
// them with your own fragment code: `fragment` is a GLSL function
//
//   vec4 shade(Bar b)
//
// called for every pixel inside a bar, which knows about the waveform and the
// audio (see Bar below). Raw WebGL, no dependencies. Colors come from CSS custom properties
// on the canvas, so themes still live in CSS:
//
//   --wave-color      unplayed bars (waveColor in GLSL)
//   --wave-progress   played bars (progressColor)
//   --wave-glow       halo around played bars, defaults to --wave-progress
import { useLayoutEffect, useRef, type CanvasHTMLAttributes } from 'react'
import { fillBars, isReady, level, timeToX, useWaveform } from './waveform'

export interface GLProps extends CanvasHTMLAttributes<HTMLCanvasElement> {
  /**
   * GLSL for `vec4 shade(Bar b)`, returning the color of one pixel of one bar
   * (straight alpha). The default fills unplayed bars with waveColor and played
   * ones with progressColor. Also in scope: `time` (the audio's current time,
   * seconds), `level` (loudness at the playhead, 0–1) and `size` (CSS pixels).
   */
  fragment?: string
  /** Halo strength around played bars. Off (0) unless you set it. */
  glow?: number
  /** How much bars near the pointer grow. Off (0) unless you set it. */
  swell?: number
  /** Width of the swell, in CSS pixels. Default 56. */
  swellRadius?: number
}

/** What `shade` is given for each pixel. */
const BAR = `struct Bar {
  float index;  // which bar, counting from the left
  vec2 uv;      // inside the bar: x 0–1 across it, y 0–1 from its foot to its tip
  vec2 pos;     // inside the waveform: x 0–1 left to right, y 0–1 bottom to top
  float amp;    // the bar's height, 0–1
  bool played;  // this pixel is behind the playhead
  float age;    // seconds since the playhead passed the bar's center; negative ahead of it
};`

const DEFAULT_SHADE = `vec4 shade(Bar b) { return b.played ? progressColor : waveColor; }`

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const frag = (shade: string) => `#version 300 es
precision highp float;
uniform sampler2D bars;
uniform vec2 size;          // CSS pixels
uniform float dpr, pitch, barW, radius, minH, count, align, scale;
uniform float progress;     // x of the playhead, CSS pixels
uniform float secPerPx, time, level;
uniform float hoverX, hoverAmt, swell, swellR, glow;
uniform vec4 waveColor, progressColor, glowColor;
out vec4 o;

${BAR}

float amp(float i) { return texelFetch(bars, ivec2(int(i), 0), 0).r; }

float height(float i) {
  if (i < 0.0 || i >= count) return -1.0;
  float h = amp(i) * scale * size.y;
  float c = i * pitch + barW * 0.5;
  float d = (c - hoverX) / swellR;
  h *= 1.0 + swell * hoverAmt * exp(-d * d);
  return clamp(max(h, minH), 0.0, size.y);
}

float centerY(float h) { return align > 0.5 ? size.y - h * 0.5 : align < -0.5 ? h * 0.5 : size.y * 0.5; }

// Signed distance to bar i (rounded rect), in CSS pixels.
float bar(vec2 p, float i) {
  float h = height(i);
  if (h < 0.0) return 1e4;
  vec2 c = vec2(i * pitch + barW * 0.5, centerY(h));
  vec2 half_ = vec2(barW, h) * 0.5;
  float r = min(radius, min(half_.x, half_.y));
  vec2 q = abs(p - c) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

${shade}

void main() {
  vec2 p = vec2(gl_FragCoord.x, size.y * dpr - gl_FragCoord.y) / dpr;
  float i = floor(p.x / pitch);
  // The nearest of three neighbors, so antialiased edges belong to the right bar.
  float k = i, d = bar(p, i);
  float dl = bar(p, i - 1.0), dr = bar(p, i + 1.0);
  if (dl < d) { d = dl; k = i - 1.0; }
  if (dr < d) { d = dr; k = i + 1.0; }
  float aa = 0.5 / dpr * 2.0;
  float cover = clamp(0.5 - d / aa, 0.0, 1.0);
  if (cover <= 0.0 && glow <= 0.0) discard;

  float h = max(height(k), 1e-3);
  Bar b;
  b.index = k;
  b.uv = vec2(clamp((p.x - k * pitch) / barW, 0.0, 1.0), clamp(1.0 - (p.y - (centerY(h) - h * 0.5)) / h, 0.0, 1.0));
  b.pos = vec2(p.x / size.x, 1.0 - p.y / size.y);
  b.amp = amp(k);
  b.played = p.x < progress;
  b.age = (progress - (k * pitch + barW * 0.5)) * secPerPx;

  vec4 base = shade(b);
  vec4 col = vec4(base.rgb * base.a, base.a) * cover;
  if (glow > 0.0 && b.played) {
    // Brighter close to the playhead.
    float near = 0.35 + 0.65 * exp(-(progress - p.x) / 120.0);
    float g = glow * near * exp(-max(d, 0.0) / 6.0) * (1.0 - cover);
    col += vec4(glowColor.rgb, 1.0) * glowColor.a * g * 0.6;
  }
  o = col;
}`

/** Parses any CSS color to premultiplied-ready RGBA in 0–1, via a 1×1 canvas. Shared with the Visualizer. */
export function colorParser() {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const cache = new Map<string, number[]>()
  return (css: string, fallback: number[]) => {
    if (!css) return fallback
    let v = cache.get(css)
    if (!v) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      cache.set(css, (v = [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255]))
    }
    return v
  }
}

const UNIFORMS = ['bars', 'size', 'dpr', 'pitch', 'barW', 'radius', 'minH', 'count', 'align', 'scale', 'progress', 'secPerPx', 'time', 'level', 'hoverX', 'hoverAmt', 'swell', 'swellR', 'glow', 'waveColor', 'progressColor', 'glowColor'] as const

/**
 * Draws the bars with WebGL2 in place of `Shape`, colored by `fragment`. Colors
 * come from `--wave-color`, `--wave-progress` and `--wave-glow`. Applies
 * `smoothing` like Shape, but not the `reveal` sweep. Without WebGL2, or if the shader doesn't
 * compile, the canvas stays empty (and the compiler's message is logged). If the
 * browser drops the WebGL context, it's rebuilt when the context comes back. One full-screen
 * triangle; bar heights live in a 1-pixel-tall float texture, so a frame is
 * a single draw call however many bars there are. Draws only when
 * something changes.
 */
export function GL({ fragment = DEFAULT_SHADE, glow = 0, swell = 0, swellRadius = 56, style, ...rest }: GLProps) {
  const store = useWaveform()
  const ref = useRef<HTMLCanvasElement>(null)
  const opts = useRef({ glow, swell, swellRadius })
  opts.current = { glow, swell, swellRadius }
  const invalidateRef = useRef(() => {})

  useLayoutEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
    if (!gl) return
    type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
    // Everything the GPU holds. Built once, and again if the context is lost and restored.
    let res: { prog: WebGLProgram; buf: WebGLBuffer | null; tex: WebGLTexture | null; U: Uniforms } | null = null
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const build = () => {
      const prog = gl.createProgram()!
      const fs = shader(gl.FRAGMENT_SHADER, frag(fragment))
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      // A shader that doesn't compile is reported and draws nothing, rather than taking the page down.
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        if (!gl.isContextLost()) console.error(`Waveform.GL: the fragment shader didn't compile.\n${gl.getShaderInfoLog(fs) ?? gl.getProgramInfoLog(prog)}`)
        return null
      }
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
      const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Uniforms
      return { prog, buf, tex, U }
    }
    res = build()
    if (!res) return

    const parse = colorParser()
    const css = getComputedStyle(canvas)
    const scratch: { bars?: Float32Array; raw?: Float32Array } = {}
    const near = new Float32Array(1)
    let raf = 0, count = 0
    let heights: Float32Array = new Float32Array(0)
    let dataVersion = -1, dataGain = -1, layoutDirty = true
    let hoverAmt = 0, hoverX = -1e4, loud = 0
    let colorsAt = -Infinity

    const layout = (U: Uniforms) => {
      const s = store.state
      const dpr = Math.min(2, devicePixelRatio || 1)
      // Assigning a canvas's size reallocates its buffer, even to the same value: only on a real change.
      const w = Math.max(1, Math.round(s.width * dpr)), h = Math.max(1, Math.round(s.height * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      gl.viewport(0, 0, w, h)
      const pitch = s.barWidth + s.barGap
      const n = Math.max(1, Math.floor((s.width + s.barGap) / pitch + 1e-6))
      if (n !== count) {
        count = n
        heights = new Float32Array(n)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, 1, 0, gl.RED, gl.FLOAT, null)
      }
      gl.uniform2f(U.size, s.width, s.height)
      gl.uniform1f(U.dpr, dpr)
      gl.uniform1f(U.pitch, pitch)
      gl.uniform1f(U.barW, s.barWidth)
      gl.uniform1f(U.radius, s.barRadius)
      gl.uniform1f(U.minH, s.minBarHeight)
      gl.uniform1f(U.count, count)
      gl.uniform1f(U.align, s.align === 'bottom' ? 1 : s.align === 'top' ? -1 : 0)
      // Like Shape: heights scaled after normalize and contrast, then clamped to the waveform.
      gl.uniform1f(U.scale, s.scale)
      dataVersion = -1
      layoutDirty = false
    }

    const frame = (now: number) => {
      raf = 0
      const s = store.state
      if (!res || !s.width || !s.height) return
      const { U } = res
      if (layoutDirty) layout(U)
      // Like Shape: nothing at all until the bars are ready, not a row of minimum-height bars.
      if (!isReady(s)) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return }
      const { peaks } = s
      // Re-upload on new data, and while the store eases the gain after streaming.
      if (peaks && (peaks.version !== dataVersion || s.gain !== dataGain)) {
        dataVersion = peaks.version
        dataGain = s.gain
        // The same bars as Shape, smoothing included.
        scratch.bars = heights
        heights = fillBars(s, count, scratch)
        const k = s.gain
        for (let i = 0; i < count; i++) heights[i] = level(heights[i] * k, s.contrast)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, count, 1, gl.RED, gl.FLOAT, heights)
      }
      const target = s.hover === null ? 0 : 1
      if (s.hover !== null) hoverX = timeToX(s, s.hover)
      // Ease the swell in and out rather than snapping.
      hoverAmt += (target - hoverAmt) * 0.18
      if (Math.abs(target - hoverAmt) < 0.002) hoverAmt = target
      // Theme colors rarely change; re-read them twice a second, not every frame.
      if (now - colorsAt > 500) {
        colorsAt = now
        const played = parse(css.getPropertyValue('--wave-progress').trim(), [0.1, 0.1, 0.1, 1])
        gl.uniform4fv(U.waveColor, parse(css.getPropertyValue('--wave-color').trim(), [0.6, 0.6, 0.6, 1]))
        gl.uniform4fv(U.progressColor, played)
        gl.uniform4fv(U.glowColor, parse(css.getPropertyValue('--wave-glow').trim(), played))
      }
      // Loudness at the playhead, eased so it reads as a level rather than flicker.
      const t = s.player?.time ?? 0
      const want = peaks && s.player?.playing ? level(peaks.bars(Math.max(0, t - 0.04), t + 0.04, near)[0] * s.gain, s.contrast) : 0
      loud += (want - loud) * 0.35
      if (Math.abs(want - loud) < 0.002) loud = want
      gl.uniform1f(U.progress, timeToX(s, t))
      gl.uniform1f(U.secPerPx, s.width ? (s.end - s.start) / s.width : 0)
      gl.uniform1f(U.time, t)
      gl.uniform1f(U.level, loud)
      gl.uniform1f(U.hoverX, hoverX)
      gl.uniform1f(U.hoverAmt, hoverAmt)
      gl.uniform1f(U.swell, opts.current.swell)
      gl.uniform1f(U.swellR, opts.current.swellRadius)
      gl.uniform1f(U.glow, opts.current.glow)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (hoverAmt !== target || loud !== want) invalidate()
    }
    const invalidate = () => { if (!raf && res) raf = requestAnimationFrame(frame) }
    invalidateRef.current = () => { colorsAt = -Infinity; invalidate() }
    invalidate()

    // The browser can drop the context (too many on a page, a GPU reset). Ask for it back,
    // and rebuild everything when it returns: the old program, buffer and texture are gone.
    const lost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      raf = 0
      res = null
    }
    const restored = () => {
      res = build()
      count = 0
      layoutDirty = true
      colorsAt = -Infinity
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)

    let player = store.state.player
    let unTime = player?.onTime(invalidate)
    const unsub = store.subscribe((c) => {
      if (c === 'layout') {
        layoutDirty = true
        if (store.state.player !== player) { unTime?.(); player = store.state.player; unTime = player?.onTime(invalidate) }
      }
      invalidate()
    })
    return () => {
      cancelAnimationFrame(raf)
      unsub()
      unTime?.()
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      if (res) {
        gl.deleteTexture(res.tex)
        gl.deleteBuffer(res.buf)
        gl.deleteProgram(res.prog)
      }
    }
  }, [store, fragment])

  // New effect settings (or a new className, which may change colors) redraw immediately.
  useLayoutEffect(() => invalidateRef.current(), [glow, swell, swellRadius, rest.className, style])

  return (
    <canvas
      {...rest}
      ref={ref}
      data-sillon-gl=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}
    />
  )
}
