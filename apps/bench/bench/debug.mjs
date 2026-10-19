import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
// ffmpeg per-1152-sample max-abs (ffmpeg trims encoder delay via the LAME tag; report both)
const ff = await new Promise((res) => {
  const p = spawn('ffmpeg', ['-v', 'error', '-i', 'public/audio/podcast-5m.mp3', '-f', 'f32le', '-ac', '2', 'pipe:1']); const bufs = []
  p.stdout.on('data', (d) => bufs.push(d)); p.on('close', () => res(new Float32Array(Buffer.concat(bufs).buffer.slice(0))))
})
const b = await chromium.launch({ channel: 'chromium' }); const page = await b.newPage()
await page.goto('http://localhost:5173/debug.html'); await page.waitForFunction(() => window.__done, null, { timeout: 60000 })
const dbg = await page.evaluate(() => window.__dbg); await b.close()
const outs = []; for (let i = 0; i < dbg.length; i += 4) outs.push({ ts: dbg[i], n: dbg[i + 1], m: dbg[i + 2], ch: dbg[i + 3] })
const sizes = {}; outs.forEach((o) => (sizes[o.n] = (sizes[o.n] ?? 0) + 1)); console.log('outputs', outs.length, 'frame sizes', sizes, 'channels', [...new Set(outs.map((o) => o.ch))])
let gaps = 0; for (let i = 1; i < outs.length; i++) { const exp = outs[i - 1].ts + (outs[i - 1].n / 44100) * 1e6; if (Math.abs(outs[i].ts - exp) > 50) gaps++ } console.log('timestamp discontinuities', gaps)
const total = outs.reduce((s, o) => s + o.n, 0); console.log('our samples', total, 'ffmpeg samples', ff.length / 2, 'diff', total - ff.length / 2)
// compare per output against ffmpeg at the offset that minimises error
const ffMax = (start, n) => { let m = 0; for (let k = Math.max(0, start); k < Math.min(ff.length / 2, start + n); k++) m = Math.max(m, Math.abs(ff[2 * k]), Math.abs(ff[2 * k + 1])); return m }
for (const off of [0, 529, 1152, 2257]) {
  let pos = -off, bad = 0, badIdx = []
  for (let i = 0; i < outs.length; i++) { const t = ffMax(pos, outs[i].n); if (Math.abs(t - outs[i].m) > 0.05) { bad++; if (badIdx.length < 12) badIdx.push([i, +outs[i].m.toFixed(3), +t.toFixed(3)]) } pos += outs[i].n }
  console.log('offset', off, 'bad frames', bad, '/', outs.length, JSON.stringify(badIdx))
}
