// Correctness: our streamed peaks vs ffmpeg ground truth (2000-bucket envelope).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const b = await chromium.launch({ channel: 'chromium' })
for (const file of ['podcast-5m', 'podcast-60m']) {
  const p = await b.newPage()
  await p.goto(`http://localhost:5173/decode.html?impl=ours&file=${file}`)
  await p.waitForFunction(() => window.__result?.done, null, { timeout: 120000 })
  const r = await p.evaluate(() => window.__result)
  const t = JSON.parse(readFileSync(`bench/truth-${file}.json`))
  const err = r.envelope.map((v, i) => Math.abs(v - t[i]))
  console.log(file, 'seconds', r.worker.seconds, 'maxErr', Math.max(...err).toFixed(4), 'buckets >0.01 off:', err.filter((e) => e > 0.01).length, '/ 2000')
  await p.close()
}
await b.close()
