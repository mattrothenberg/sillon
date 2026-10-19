// Renders a Strudel pattern to MP3: plays it in headless Chromium, taps
// everything that reaches the speakers, and writes the PCM out via ffmpeg.
//   node strudel/render.mjs [name] [seconds]
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] ?? 'loop'
const seconds = Number(process.argv[3] ?? 32)
const out = join(here, '../../apps/bench/public/audio', `${name}.mp3`)
const code = readFileSync(join(here, `${name}.strudel.js`), 'utf8')
const bundle = readFileSync(join(here, '../node_modules/@strudel/web/dist/index.js'))

const page = `<!doctype html><script>
  // Mirror every connection to the speakers into a recorder.
  const connect = AudioNode.prototype.connect
  window.__chunks = [[], []]
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const ctx = dest.context
      if (!ctx.__tap) {
        const sp = ctx.createScriptProcessor(4096, 2, 2)
        sp.onaudioprocess = (e) => { if (window.__rec) for (let c = 0; c < 2; c++) __chunks[c].push(e.inputBuffer.getChannelData(c).slice()) }
        const mute = ctx.createGain(); mute.gain.value = 0
        connect.call(sp, mute); connect.call(mute, ctx.destination)
        ctx.__tap = sp
        window.__sampleRate = ctx.sampleRate
      }
      connect.call(this, ctx.__tap)
    }
    return connect.call(this, dest, ...rest)
  }
</script><script src="/strudel.js"></script>`

const server = createServer((req, res) => {
  if (req.url === '/strudel.js') return res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(bundle)
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
}).listen(0)
const url = `http://localhost:${server.address().port}/`

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const p = await browser.newPage()
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()))
p.on('pageerror', (e) => console.error('[pageerror]', e.message))
const init = () => p.evaluate(async () => {
  await strudel.initStrudel({
    prebake: () => Promise.all([
      samples('github:tidalcycles/dirt-samples'),
      samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json'),
    ]),
  })
  await getAudioContext().resume()
})
// The silent pass fills the HTTP cache with samples; the scheduler's cycle
// count survives hush(), so the real take happens on a fresh page.
await p.goto(url)
await init()
// Samples load on first use, so run the whole piece silently at 16x first.
await p.evaluate((c) => evaluate(c.trimEnd() + '.fast(16).gain(0)'), code)
await p.waitForTimeout((seconds / 16 + 3) * 1000)
await p.goto(url)
await init()
await p.evaluate((c) => { window.__rec = true; return evaluate(c) }, code)
await p.waitForTimeout(seconds * 1000)
await p.evaluate(() => hush())
await p.waitForTimeout(2500)
const { sampleRate, left, right } = await p.evaluate(() => {
  window.__rec = false
  const join = (cs) => { const n = cs.reduce((s, c) => s + c.length, 0), a = new Float32Array(n); let o = 0; for (const c of cs) { a.set(c, o); o += c.length } return Array.from(a) }
  return { sampleRate: window.__sampleRate, left: join(__chunks[0]), right: join(__chunks[1]) }
})
await browser.close()
server.close()

// Strudel emits a short burst as the page wakes, then silence until the
// first scheduled cycle. Start the take at the first onset after a gap.
const win = Math.round(sampleRate / 100)
const loud = (w) => { let m = 0; for (let k = w * win; k < (w + 1) * win && k < left.length; k++) m = Math.max(m, Math.abs(left[k]), Math.abs(right[k])); return m > 0.01 }
let from = 0
for (let w = 0, quiet = 0; w * win < Math.min(left.length, sampleRate * 6); w++) {
  if (!loud(w)) quiet++
  else { if (quiet >= 50 || (from === 0 && w === 0)) from = w * win; quiet = 0 }
}
const n = left.length - from
// Peak-normalise to -1 dBFS and nothing else: loudness normalisation and a
// limiter would flatten the quiet passages, and the waveform with them.
let peak = 0
for (let i = from; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
const gain = peak ? 0.89 / peak : 1
const pcm = Buffer.alloc(n * 8)
for (let i = 0; i < n; i++) { pcm.writeFloatLE(left[from + i] * gain, i * 8); pcm.writeFloatLE(right[from + i] * gain, i * 8 + 4) }
const raw = join(here, `.${name}.f32`)
writeFileSync(raw, pcm)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(sampleRate), '-ac', '2', '-i', raw,
  '-af', `atrim=0:${seconds + 2},afade=t=out:st=${seconds}:d=2`,
  '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', out])
execFileSync('rm', [raw])
console.log(`${name}: ${(n / sampleRate).toFixed(1)}s from ${(from / sampleRate).toFixed(2)}s → ${out}`)
