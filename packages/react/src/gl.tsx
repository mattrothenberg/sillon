// An opt-in WebGL2 renderer for effects CSS can't do: glow, and bars that
// swell toward the pointer. Raw WebGL, no dependencies. Colours come from
// CSS custom properties on the canvas, so themes still live in CSS:
//
//   --wave-color      unplayed bars
//   --wave-progress   played bars
//   --wave-glow       halo around played bars (defaults to --wave-progress)
import { useLayoutEffect, useRef, type CanvasHTMLAttributes } from 'react'
import { level, timeToX, useWaveform } from './waveform'

export interface GLProps extends CanvasHTMLAttributes<HTMLCanvasElement> {
  /** Halo strength around played bars, 0 to switch off. */
  glow?: number
  /** How much bars near the pointer grow. 0 to switch off. */
  swell?: number
  /** Width of the swell, in pixels. */
  swellRadius?: number
}

const VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D bars;
uniform vec2 size;          // CSS pixels
uniform float dpr, pitch, barW, radius, minH, count, bottom;
uniform float progress;     // x of the playhead, CSS pixels
uniform float hoverX, hoverAmt, swell, swellR, glow;
uniform vec4 cWave, cPlayed, cGlow;
out vec4 o;

float height(float i) {
  if (i < 0.0 || i >= count) return -1.0;
  float h = texelFetch(bars, ivec2(int(i), 0), 0).r * size.y;
  float c = i * pitch + barW * 0.5;
  float d = (c - hoverX) / swellR;
  h *= 1.0 + swell * hoverAmt * exp(-d * d);
  return clamp(max(h, minH), 0.0, size.y);
}

// Signed distance to bar i (rounded rect), in CSS pixels.
float bar(vec2 p, float i) {
  float h = height(i);
  if (h < 0.0) return 1e4;
  vec2 c = vec2(i * pitch + barW * 0.5, bottom > 0.5 ? size.y - h * 0.5 : size.y * 0.5);
  vec2 half_ = vec2(barW, h) * 0.5;
  float r = min(radius, min(half_.x, half_.y));
  vec2 q = abs(p - c) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, size.y * dpr - gl_FragCoord.y) / dpr;
  float i = floor(p.x / pitch);
  float d = min(bar(p, i), min(bar(p, i - 1.0), bar(p, i + 1.0)));
  float aa = 0.5 / dpr * 2.0;
  float cover = clamp(0.5 - d / aa, 0.0, 1.0);
  bool played = p.x < progress;
  vec4 base = played ? cPlayed : cWave;
  vec4 col = vec4(base.rgb * base.a, base.a) * cover;
  if (glow > 0.0 && played) {
    // Brighter close to the playhead, like light catching a groove.
    float near = 0.35 + 0.65 * exp(-(progress - p.x) / 120.0);
    float g = glow * near * exp(-max(d, 0.0) / 6.0) * (1.0 - cover);
    col += vec4(cGlow.rgb, 1.0) * cGlow.a * g * 0.6;
  }
  o = col;
}`

/** Parses any CSS colour to premultiplied-ready RGBA in 0–1, via a 1×1 canvas. */
function colorParser() {
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

const UNIFORMS = ['bars', 'size', 'dpr', 'pitch', 'barW', 'radius', 'minH', 'count', 'bottom', 'progress', 'hoverX', 'hoverAmt', 'swell', 'swellR', 'glow', 'cWave', 'cPlayed', 'cGlow'] as const

/**
 * Drop-in replacement for `Shape` that draws with WebGL2. One full-screen
 * triangle; bar heights live in a 1-pixel-tall float texture, so a frame is
 * a single draw call however many bars there are. Draws only when
 * something changes.
 */
export function GL({ glow = 1, swell = 0.8, swellRadius = 56, style, ...rest }: GLProps) {
  const store = useWaveform()
  const ref = useRef<HTMLCanvasElement>(null)
  const opts = useRef({ glow, swell, swellRadius })
  opts.current = { glow, swell, swellRadius }
  const invalidateRef = useRef(() => {})

  useLayoutEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
    if (!gl) return
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
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
    const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>

    const parse = colorParser()
    const css = getComputedStyle(canvas)
    let raf = 0, count = 0, heights = new Float32Array(0)
    let dataVersion = -1, dataGain = -1, layoutDirty = true
    let hoverAmt = 0, hoverX = -1e4
    let colorsAt = -Infinity

    const layout = () => {
      const s = store.state
      const dpr = Math.min(2, devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(s.width * dpr))
      canvas.height = Math.max(1, Math.round(s.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      const pitch = s.barWidth + s.barGap
      const n = Math.max(1, Math.floor((s.width + s.barGap) / pitch))
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
      gl.uniform1f(U.bottom, s.align === 'bottom' ? 1 : 0)
      dataVersion = -1
      layoutDirty = false
    }

    const frame = (now: number) => {
      raf = 0
      const s = store.state
      if (!s.width || !s.height) return
      if (layoutDirty) layout()
      const { peaks } = s
      // Re-upload on new data, and while the store eases the gain after streaming.
      if (peaks && (peaks.version !== dataVersion || s.gain !== dataGain)) {
        dataVersion = peaks.version
        dataGain = s.gain
        peaks.bars(s.start, s.end, heights)
        const k = s.gain
        for (let i = 0; i < count; i++) heights[i] = level(heights[i] * k, s.contrast)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, count, 1, gl.RED, gl.FLOAT, heights)
      }
      const target = s.hover === null ? 0 : 1
      if (s.hover !== null) hoverX = timeToX(s, s.hover)
      // Ease the swell in and out rather than snapping.
      hoverAmt += (target - hoverAmt) * 0.18
      if (Math.abs(target - hoverAmt) < 0.002) hoverAmt = target
      // Theme colours rarely change; re-read them twice a second, not every frame.
      if (now - colorsAt > 500) {
        colorsAt = now
        const played = parse(css.getPropertyValue('--wave-progress').trim(), [0.1, 0.1, 0.1, 1])
        gl.uniform4fv(U.cWave, parse(css.getPropertyValue('--wave-color').trim(), [0.6, 0.6, 0.6, 1]))
        gl.uniform4fv(U.cPlayed, played)
        gl.uniform4fv(U.cGlow, parse(css.getPropertyValue('--wave-glow').trim(), played))
      }
      gl.uniform1f(U.progress, timeToX(s, s.player?.time ?? 0))
      gl.uniform1f(U.hoverX, hoverX)
      gl.uniform1f(U.hoverAmt, hoverAmt)
      gl.uniform1f(U.swell, opts.current.swell)
      gl.uniform1f(U.swellR, opts.current.swellRadius)
      gl.uniform1f(U.glow, opts.current.glow)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (hoverAmt !== target) invalidate()
    }
    const invalidate = () => { if (!raf) raf = requestAnimationFrame(frame) }
    invalidateRef.current = () => { colorsAt = -Infinity; invalidate() }
    invalidate()

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
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [store])

  // New effect settings (or a new className, which may change colours) redraw immediately.
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
