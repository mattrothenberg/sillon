// Exact check: ffmpeg max-abs per 128-sample bucket vs ours, bucket for bucket.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const pcm = await new Promise((res) => { const p = spawn('ffmpeg', ['-v', 'error', '-i', 'public/audio/podcast-5m.mp3', '-f', 'f32le', '-ac', '2', 'pipe:1']); const bufs = []; p.stdout.on('data', (d) => bufs.push(d)); p.on('close', () => res(new Float32Array(Buffer.concat(bufs).buffer.slice(0)))) })
const truth = []; for (let i = 0; i < pcm.length / 2; i += 128) { let m = 0; for (let k = i; k < Math.min(i + 128, pcm.length / 2); k++) m = Math.max(m, Math.abs(pcm[2 * k]), Math.abs(pcm[2 * k + 1])); truth.push(m) }
const b = await chromium.launch({ channel: 'chromium' }); const p = await b.newPage()
await p.goto('http://localhost:5173/decode.html?impl=ours&file=podcast-5m&raw'); await p.waitForFunction(() => window.__result?.done, null, { timeout: 60000 })
const ours = await p.evaluate(() => window.__result.raw); await b.close()
const err = truth.map((t, i) => Math.abs(t - (ours[i] ?? 0)))
console.log('buckets ours', ours.length, 'truth', truth.length, 'maxErr', Math.max(...err).toExponential(2), 'meanErr', (err.reduce((a, c) => a + c, 0) / err.length).toExponential(2), 'buckets >1e-3 off:', err.filter((e) => e > 1e-3).length)
