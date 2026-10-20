// Generates the benchmark corpus and its references.
//   public/audio/bench/<id>.mp3      the test files
//   public/truth/<id>.bin            ffmpeg ground truth: max-abs over channels, 256 samples per bucket (float32)
//   public/peaks-ws/<id>.json        wavesurfer-format precomputed peaks (what its docs say to ship for long files)
//   public/peaks-dat/<id>.dat        peaks.js precomputed data, laid out as `audiowaveform -b 8` writes it (256 samples per pixel, channels averaged)
//   bench/results/gen-cost.json      how long the server-side peaks step took per file
// ffmpeg applies the LAME gapless trim on decode, so the truth is aligned to the real audio.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const A = 'public/audio'
mkdirSync(`${A}/bench`, { recursive: true })
mkdirSync('public/truth', { recursive: true })
mkdirSync('public/peaks-ws', { recursive: true })
mkdirSync('public/peaks-dat', { recursive: true })
mkdirSync('bench/results', { recursive: true })

// id → [source, ffmpeg args]. Main encoding: CBR 128k stereo 44.1k.
const FILES = {
  'd30s': [`${A}/podcast-5m.mp3`, ['-t', '30', '-ar', '44100', '-ac', '2', '-b:a', '128k']],
  'd5m': [`${A}/podcast-5m.mp3`, null],
  'd1h': [`${A}/podcast-60m.mp3`, null],
  'd3h': [`${A}/podcast-180m.mp3`, null],
  'd5m-320': [`${A}/podcast-5m.mp3`, ['-ar', '44100', '-ac', '2', '-b:a', '320k']],
  'd5m-vbr': [`${A}/podcast-5m.mp3`, ['-ar', '44100', '-ac', '2', '-q:a', '2']],
  'd5m-48m': [`${A}/podcast-5m.mp3`, ['-ar', '48000', '-ac', '1', '-b:a', '96k']],
  'd1h-320': [`${A}/podcast-60m.mp3`, ['-ar', '44100', '-ac', '2', '-b:a', '320k']],
  'd1h-vbr': [`${A}/podcast-60m.mp3`, ['-ar', '44100', '-ac', '2', '-q:a', '2']],
  'd1h-48m': [`${A}/podcast-60m.mp3`, ['-ar', '48000', '-ac', '1', '-b:a', '96k']],
  // Music: the site's song (a Strudel rendering, 192 kbps), so accuracy isn't only measured on speech.
  'm2m': [`${A}/avril.mp3`, null],
}
// The feed: 20 different 3-minute slices of the hour, encoded like the main files.
for (let i = 0; i < 20; i++) FILES[`f${String(i).padStart(2, '0')}`] = [`${A}/podcast-60m.mp3`, ['-ss', String(i * 180), '-t', '180', '-ar', '44100', '-ac', '2', '-b:a', '128k']]

const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate,size:stream=sample_rate,channels', '-of', 'json', f]).toString())

function decodePeaks(file, channels) {
  // Streams f32 PCM out of ffmpeg. Returns 256-sample max-abs buckets, plus per-channel
  // signed max-abs at 64 samples, fine enough to rebuild wavesurfer's 8000-point peaks.
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), 'pipe:1'])
    const buckets = new Grow(), fine = Array.from({ length: channels }, () => new Grow())
    // audiowaveform's reading: channels averaged to mono, then min and max per 256 samples.
    const monoMin = new Grow(), monoMax = new Grow()
    let lo = Infinity, hi = -Infinity
    const fineCur = new Float32Array(channels)
    let cur = 0, count = 0, fineCount = 0, total = 0, leftover = Buffer.alloc(0)
    ff.stdout.on('data', (d) => {
      const b = leftover.length ? Buffer.concat([leftover, d]) : d
      const n = Math.floor(b.length / (4 * channels))
      const f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + n * 4 * channels))
      for (let i = 0; i < n; i++) {
        let m = 0, sum = 0
        for (let c = 0; c < channels; c++) {
          const v = f[i * channels + c], a = Math.abs(v)
          if (a > m) m = a
          if (a > Math.abs(fineCur[c])) fineCur[c] = v
          sum += v
        }
        if (m > cur) cur = m
        const mono = sum / channels
        if (mono < lo) lo = mono
        if (mono > hi) hi = mono
        if (++count === 256) { buckets.push(cur); monoMin.push(lo); monoMax.push(hi); cur = 0; count = 0; lo = Infinity; hi = -Infinity }
        if (++fineCount === 64) { for (let c = 0; c < channels; c++) { fine[c].push(fineCur[c]); fineCur[c] = 0 } fineCount = 0 }
      }
      total += n
      leftover = b.subarray(n * 4 * channels)
    })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code) return reject(new Error('ffmpeg ' + code))
      if (count) { buckets.push(cur); monoMin.push(lo); monoMax.push(hi) }
      if (fineCount) for (let c = 0; c < channels; c++) fine[c].push(fineCur[c])
      resolve({ buckets: buckets.done(), fine: fine.map((g) => g.done()), mono: [monoMin.done(), monoMax.done()], total })
    })
  })
}

class Grow {
  a = new Float32Array(1 << 16); n = 0
  push(v) { if (this.n === this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b } this.a[this.n++] = v }
  done() { return this.a.slice(0, this.n) }
}

// waveform-data format version 2, 8-bit, one channel: a 24-byte header, then a min and a max per pixel.
function dat([min, max], sampleRate) {
  const b = Buffer.alloc(24 + min.length * 2)
  b.writeInt32LE(2, 0); b.writeUInt32LE(1, 4); b.writeInt32LE(sampleRate, 8); b.writeInt32LE(256, 12); b.writeInt32LE(min.length, 16); b.writeInt32LE(1, 20)
  const q = (v) => Math.max(-128, Math.min(127, Math.floor(v * 127)))
  for (let i = 0; i < min.length; i++) { b.writeInt8(q(min[i]), 24 + i * 2); b.writeInt8(q(max[i]), 25 + i * 2) }
  return b
}

const cost = {}
for (const [id, [src, args]] of Object.entries(FILES)) {
  const out = `${A}/bench/${id}.mp3`
  if (!existsSync(out)) {
    if (args) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...args, '-c:a', 'libmp3lame', out])
    else execFileSync('cp', [src, out])
  }
  const p = probe(out)
  const sampleRate = Number(p.streams[0].sample_rate), channels = Number(p.streams[0].channels)
  if (!existsSync(`public/truth/${id}.bin`) || !existsSync(`public/peaks-ws/${id}.json`) || !existsSync(`public/peaks-dat/${id}.dat`)) {
    const { buckets, fine, mono, total } = await decodePeaks(out, channels)
    writeFileSync(`public/truth/${id}.bin`, Buffer.from(buckets.buffer))
    // wavesurfer's exportPeaks(): 8000 points per channel, the sample with the largest |value|, 4 decimals.
    const peaks = fine.map((ch) => {
      const L = 8000, size = total / L / 64, data = new Array(L)
      for (let j = 0; j < L; j++) {
        let max = 0
        for (let x = Math.floor(j * size), e = Math.ceil((j + 1) * size); x < e && x < ch.length; x++) if (Math.abs(ch[x]) > Math.abs(max)) max = ch[x]
        data[j] = Math.round(max * 10000) / 10000
      }
      return data
    })
    writeFileSync(`public/peaks-ws/${id}.json`, JSON.stringify({ duration: total / sampleRate, peaks }))
    writeFileSync(`public/peaks-dat/${id}.dat`, dat(mono, sampleRate))
  }
  // The server step wavesurfer's precomputed-peaks path needs is at least a full decode.
  // Timed as ffmpeg decoding to nowhere: a floor for any real peaks tool.
  const t0 = performance.now()
  execFileSync('ffmpeg', ['-v', 'error', '-threads', '1', '-i', out, '-f', 'null', '-'])
  cost[id] = { serverDecodeMs: Math.round(performance.now() - t0) }
  const info = { id, sampleRate, channels, duration: Number(p.format.duration), bytes: Number(p.format.size), bitrate: Number(p.format.bit_rate) }
  cost[id] = { ...(cost[id] ?? {}), ...info }
  console.log(JSON.stringify(cost[id]))
}
const prev = existsSync('bench/results/gen-cost.json') ? JSON.parse(readFileSync('bench/results/gen-cost.json')) : {}
for (const k in cost) prev[k] = { ...prev[k], ...cost[k] }
writeFileSync('bench/results/gen-cost.json', JSON.stringify(prev, null, 2))
