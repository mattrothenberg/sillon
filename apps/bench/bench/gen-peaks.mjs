// Ground truth via ffmpeg: max-abs peaks at 256 samples/bucket (for render bench)
// and a 2000-bucket envelope (for checking the streaming decoder's output).
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const file = process.argv[2]
const ff = spawn('ffmpeg', ['-v', 'error', '-i', `public/audio/${file}.mp3`, '-f', 'f32le', '-ac', '2', 'pipe:1'])
const peaks = []
let cur = 0, count = 0, leftover = Buffer.alloc(0)
ff.stdout.on('data', (d) => {
  const b = Buffer.concat([leftover, d]); const n = Math.floor(b.length / 8)
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.abs(b.readFloatLE(i * 8)), Math.abs(b.readFloatLE(i * 8 + 4)))
    if (v > cur) cur = v
    if (++count === 256) { peaks.push(cur); cur = 0; count = 0 }
  }
  leftover = b.subarray(n * 8)
})
ff.on('close', () => {
  if (count) peaks.push(cur)
  const arr = Float32Array.from(peaks)
  writeFileSync(`public/peaks/${file}.bin`, Buffer.from(arr.buffer))
  const env = new Array(2000).fill(0)
  arr.forEach((v, i) => { const k = Math.min(1999, Math.floor((i / arr.length) * 2000)); if (v > env[k]) env[k] = v })
  writeFileSync(`bench/truth-${file}.json`, JSON.stringify(env))
  console.log(file, arr.length, 'buckets')
})
