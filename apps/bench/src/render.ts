// Render benchmark. ?strategy=canvas2d|svg-native|svg-clip|canvas-mask|webgl|wavesurfer&scenario=playback|zoom
import WaveSurfer from 'wavesurfer.js'

const q = new URLSearchParams(location.search)
const strategy = q.get('strategy') ?? 'svg-clip'
const scenario = q.get('scenario') ?? 'playback'
const runMs = Number(q.get('ms') ?? 5000)
const W = 1200, H = 128, BAR = 2, GAP = 1, BARS = Math.floor(W / (BAR + GAP))
const SAMPLES_PER_BUCKET = 256, SR = 44100
const result: Record<string, unknown> = { strategy, scenario }
;(window as any).__result = result
const stage = document.getElementById('stage')!
const css = getComputedStyle(document.documentElement)
const v = (name: string) => css.getPropertyValue(name).trim()

const base = new Float32Array(await (await fetch('/peaks/podcast-60m.bin')).arrayBuffer())
const duration = (base.length * SAMPLES_PER_BUCKET) / SR

// Max-abs mipmap: level k has buckets of 2^k base buckets.
const levels: Float32Array[] = [base]
while (levels[levels.length - 1].length > 1) {
  const prev = levels[levels.length - 1], next = new Float32Array(Math.ceil(prev.length / 2))
  for (let i = 0; i < next.length; i++) next[i] = Math.max(prev[2 * i], prev[2 * i + 1] ?? 0)
  levels.push(next)
}
let globalMax = 0
for (const x of base) if (x > globalMax) globalMax = x

const bars = new Float32Array(BARS)
/** Bar heights (0..1) for a view of [start, start+span) base buckets. */
function computeBars(start: number, span: number) {
  const perBar = span / BARS
  const lvl = Math.max(0, Math.min(levels.length - 1, Math.floor(Math.log2(Math.max(1, perBar)))))
  const L = levels[lvl], scale = 2 ** lvl
  for (let b = 0; b < BARS; b++) {
    const a = Math.floor((start + b * perBar) / scale), z = Math.max(a + 1, Math.floor((start + (b + 1) * perBar) / scale))
    let m = 0
    for (let i = a; i < z && i < L.length; i++) if (L[i] > m) m = L[i]
    bars[b] = m / globalMax
  }
  return bars
}
function barsPath(b: Float32Array) {
  let d = ''
  for (let i = 0; i < b.length; i++) {
    const h = Math.max(1, b[i] * H), x = i * (BAR + GAP), y = (H - h) / 2
    d += `M${x} ${y.toFixed(1)}h${BAR}v${h.toFixed(1)}h-${BAR}z`
  }
  return d
}

interface Strategy { view(start: number, span: number): void; progress(p: number): void }
type Make = () => Strategy | Promise<Strategy>

const strategies: Record<string, Make> = {
  canvas2d() {
    const c = document.createElement('canvas'); c.width = W * devicePixelRatio; c.height = H * devicePixelRatio
    c.style.cssText = `width:${W}px;height:${H}px`; stage.append(c)
    const ctx = c.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio)
    const grad = (a: string, b: string) => { const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, v(a)); g.addColorStop(1, v(b)); return g }
    const unplayed = grad('--wave-a', '--wave-b'), played = grad('--played-a', '--played-b')
    let p = 0
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const [fill, clip] of [[unplayed, W], [played, p * W]] as const) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, clip, H); ctx.clip(); ctx.fillStyle = fill; ctx.beginPath()
        for (let i = 0; i < BARS; i++) { const h = Math.max(1, bars[i] * H); ctx.roundRect(i * (BAR + GAP), (H - h) / 2, BAR, h, 1) }
        ctx.fill(); ctx.restore()
      }
    }
    return { view(s, sp) { computeBars(s, sp); draw() }, progress(x) { p = x; draw() } }
  },
  'svg-native'() {
    stage.insertAdjacentHTML('beforeend', `<svg width="${W}" height="${H}">
      <defs><linearGradient id="g1"><stop offset="0" stop-color="var(--wave-a)"/><stop offset="1" stop-color="var(--wave-b)"/></linearGradient>
      <linearGradient id="g2"><stop offset="0" stop-color="var(--played-a)"/><stop offset="1" stop-color="var(--played-b)"/></linearGradient>
      <clipPath id="pc"><rect id="pr" width="0" height="${H}"/></clipPath></defs>
      <path id="p1" fill="url(#g1)"/><path id="p2" fill="url(#g2)" clip-path="url(#pc)"/></svg>`)
    const p1 = document.getElementById('p1')!, p2 = document.getElementById('p2')!, pr = document.getElementById('pr')!
    return { view(s, sp) { const d = barsPath(computeBars(s, sp)); p1.setAttribute('d', d); p2.setAttribute('d', d) }, progress(x) { pr.setAttribute('width', String(x * W)) } }
  },
  'svg-clip'() {
    // The SVG only supplies a shape; fills are ordinary CSS backgrounds.
    stage.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><clipPath id="wc"><path id="wp"/></clipPath></svg>
      <div style="position:absolute;inset:0;clip-path:url(#wc)"><div class="track"></div><div class="played" id="pl"></div></div>`)
    const wp = document.getElementById('wp')!, pl = document.getElementById('pl')!
    return { view(s, sp) { wp.setAttribute('d', barsPath(computeBars(s, sp))) }, progress(x) { pl.style.transform = `scaleX(${x})` } }
  },
  'canvas-mask'() {
    stage.insertAdjacentHTML('beforeend', `<div id="mk" style="position:absolute;inset:0;mask-size:100% 100%"><div class="track"></div><div class="played" id="pl"></div></div>`)
    const mk = document.getElementById('mk')!, pl = document.getElementById('pl')!
    const c = document.createElement('canvas'); c.width = W * devicePixelRatio; c.height = H * devicePixelRatio
    const ctx = c.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.fillStyle = '#fff'
    return {
      view(s, sp) {
        computeBars(s, sp); ctx.clearRect(0, 0, W, H); ctx.beginPath()
        for (let i = 0; i < BARS; i++) { const h = Math.max(1, bars[i] * H); ctx.roundRect(i * (BAR + GAP), (H - h) / 2, BAR, h, 1) }
        ctx.fill(); mk.style.maskImage = `url(${c.toDataURL()})`
      },
      progress(x) { pl.style.transform = `scaleX(${x})` },
    }
  },
  webgl() {
    const c = document.createElement('canvas'); c.width = W * devicePixelRatio; c.height = H * devicePixelRatio
    c.style.cssText = `width:${W}px;height:${H}px`; stage.append(c)
    const gl = c.getContext('webgl2')!
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
      in vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }`))
    // Every pixel decides for itself: which bar, inside it?, played?, gradient color.
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; uniform sampler2D bars; uniform vec2 res; uniform float progress, nbars, bar, gap, dpr;
      uniform vec3 a1, b1, a2, b2; out vec4 o;
      void main(){
        vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / dpr; float pitch = bar + gap;
        float i = floor(px.x / pitch); if (i >= nbars || mod(px.x, pitch) >= bar) discard;
        float h = max(1.0, texelFetch(bars, ivec2(int(i), 0), 0).r * res.y / dpr);
        float H = res.y / dpr; if (abs(px.y - H * 0.5) > h * 0.5) discard;
        float t = px.x / (res.x / dpr);
        vec3 col = px.x < progress * res.x / dpr ? mix(a2, b2, t) : mix(a1, b1, t);
        float alpha = px.x < progress * res.x / dpr ? 1.0 : 0.35;
        o = vec4(col * alpha, alpha);
      }`))
    gl.linkProgram(prog); gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, BARS, 1, 0, gl.RED, gl.FLOAT, null)
    const U = (n: string) => gl.getUniformLocation(prog, n)
    const rgb = (name: string) => { const s = v(name); return [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16) / 255) }
    gl.uniform2f(U('res'), c.width, c.height); gl.uniform1f(U('nbars'), BARS); gl.uniform1f(U('bar'), BAR); gl.uniform1f(U('gap'), GAP); gl.uniform1f(U('dpr'), devicePixelRatio)
    gl.uniform3fv(U('a1'), rgb('--wave-a')); gl.uniform3fv(U('b1'), rgb('--wave-b')); gl.uniform3fv(U('a2'), rgb('--played-a')); gl.uniform3fv(U('b2'), rgb('--played-b'))
    const draw = () => { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3) }
    return {
      view(s, sp) { computeBars(s, sp); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BARS, 1, gl.RED, gl.FLOAT, bars); draw() },
      progress(x) { gl.uniform1f(U('progress'), x); draw() },
    }
  },
  async wavesurfer() {
    const el = document.createElement('div'); stage.append(el)
    const ws = WaveSurfer.create({ container: el, url: '/audio/podcast-60m.mp3', peaks: [base], duration, height: H, barWidth: BAR, barGap: GAP, barRadius: 1, waveColor: v('--wave-a'), progressColor: v('--played-a'), interact: false, normalize: true, autoScroll: false, autoCenter: false })
    await new Promise((r) => ws.once('ready', r))
    return {
      view(s, sp) {
        const secs = (sp * SAMPLES_PER_BUCKET) / SR
        ws.zoom(W / secs)
        ws.setScrollTime(((s * SAMPLES_PER_BUCKET) / SR))
      },
      progress(x) { ws.setTime(x * duration) },
    }
  },
}

const s = await strategies[strategy]()
const N = base.length
s.view(0, N); s.progress(0.3)
await new Promise((r) => setTimeout(r, 500))

if (q.has('still')) { result.done = true } else {
  const deltas: number[] = [], work: number[] = []
  const start = performance.now(); let last = start
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      deltas.push(now - last); last = now
      const t = (now - start) / runMs
      const w0 = performance.now()
      if (scenario === 'playback') s.progress(t % 1)
      else {
        // Continuous zoom from the whole hour down to ~5 seconds, centered at 30:00.
        const minSpan = (5 * SR) / SAMPLES_PER_BUCKET
        const span = N * Math.pow(minSpan / N, (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2)
        s.view(Math.max(0, N / 2 - span / 2), span)
      }
      work.push(performance.now() - w0)
      if (now - start < runMs) requestAnimationFrame(tick); else resolve()
    }
    requestAnimationFrame(tick)
  })
  deltas.shift()
  const sorted = [...deltas].sort((a, b) => a - b), pct = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]
  Object.assign(result, {
    frames: deltas.length, fps: deltas.length / (runMs / 1000),
    p50: pct(0.5), p95: pct(0.95), p99: pct(0.99),
    jank: deltas.filter((d) => d > 25).length / deltas.length,
    workMean: work.reduce((a, b) => a + b, 0) / work.length,
    done: true,
  })
}
