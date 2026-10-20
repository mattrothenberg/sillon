// Makes a .peaks file (peaks made ahead of time) from any audio ffmpeg can read.
//   node scripts/peaks.mjs <audio> <out.peaks> [samplesPerValue=1024] [bits=8]
// The format is described in packages/core/src/peaks.ts; Peaks.decode reads it.
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [input, output, per = '1024', bitsArg = '8'] = process.argv.slice(2)
if (!input || !output) { console.error('usage: node scripts/peaks.mjs <audio> <out.peaks> [samplesPerValue] [bits]'); process.exit(1) }
const bucket = Number(per), bits = Number(bitsArg)
const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', input]))
const { sample_rate: rate, channels } = info.streams[0]

// The loudest sample, across channels, in every `bucket` samples. ffmpeg trims MP3 encoder padding.
const values = []
let cur = 0, n = 0, rest = Buffer.alloc(0)
const ff = spawn('ffmpeg', ['-v', 'error', '-i', input, '-f', 'f32le', '-ac', String(channels), 'pipe:1'])
ff.stdout.on('data', (d) => {
  const b = rest.length ? Buffer.concat([rest, d]) : d
  const frames = Math.floor(b.length / (4 * channels))
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) { const v = Math.abs(b.readFloatLE((i * channels + c) * 4)); if (v > cur) cur = v }
    if (++n === bucket) { values.push(cur); cur = 0; n = 0 }
  }
  rest = b.subarray(frames * 4 * channels)
})
ff.on('close', (code) => {
  if (code) process.exit(code)
  if (n) values.push(cur)
  const top = bits === 8 ? 255 : 65535
  let peak = 0
  for (const v of values) if (v > peak) peak = v
  const buf = Buffer.alloc(24 + values.length * (bits / 8))
  buf.write('SLPK', 0, 'latin1')
  buf.writeUInt8(1, 4)
  buf.writeUInt8(bits, 5)
  buf.writeUInt32LE(Number(rate), 8)
  buf.writeUInt32LE(bucket, 12)
  buf.writeUInt32LE(values.length, 16)
  buf.writeFloatLE(peak, 20)
  const k = peak > 0 ? top / peak : 0
  values.forEach((v, i) => (bits === 8 ? buf.writeUInt8(Math.min(top, Math.ceil(v * k)), 24 + i) : buf.writeUInt16LE(Math.min(top, Math.ceil(v * k)), 24 + i * 2)))
  writeFileSync(output, buf)
  console.log(`${output}: ${values.length} values at ${bucket} samples each, ${(buf.length / 1024).toFixed(0)} kB`)
})
