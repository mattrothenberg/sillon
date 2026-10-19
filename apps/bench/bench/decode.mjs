// Decode benchmark: fresh browser per run, peak RSS of the whole browser
// process tree sampled from the OS every 50ms (catches AudioBuffer memory that
// JS heap metrics miss).
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const rss = () => execSync('ps -axo rss=,command=').toString().split('\n')
  .filter((l) => l.includes('ms-playwright') && !l.includes('grep')).reduce((s, l) => s + Number(l.trim().split(/\s+/)[0]) * 1024, 0)

async function run(impl, file, throttleMbps) {
  const browser = await chromium.launch({ channel: 'chromium' })
  const page = await browser.newPage()
  if (throttleMbps) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: (throttleMbps * 1e6) / 8, uploadThroughput: 1e6 })
  }
  await page.goto('http://localhost:4173/blank.html').catch(() => {})
  const baseline = rss()
  let peak = baseline
  const timer = setInterval(() => { peak = Math.max(peak, rss()) }, 50)
  await page.goto(`http://localhost:4173/decode.html?impl=${impl}&file=${file}`)
  let r
  try {
    await page.waitForFunction(() => window.__result?.done, null, { timeout: 240000, polling: 100 })
    r = await page.evaluate(() => window.__result)
  } catch (e) { r = { error: 'timeout/crash: ' + e.message.split('\n')[0] } }
  clearInterval(timer)
  await browser.close()
  return { ...r, peakMB: (peak - baseline) / 1048576 }
}

const corr = (a, b) => { const m = (x) => x.reduce((s, v) => s + v, 0) / x.length; const ma = m(a), mb = m(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 } return n / Math.sqrt(da * db) }

const reps = Number(process.env.REPS ?? 3)
const rows = []
for (const file of ['podcast-5m', 'podcast-60m', 'podcast-180m']) for (const impl of ['ours', 'wavesurfer']) for (let i = 0; i < reps; i++) {
  const r = await run(impl, file)
  const row = { file, impl, firstPaint: r.firstPaint, complete: r.complete, peakMB: r.peakMB, error: r.error }
  if (r.envelope && file !== 'podcast-180m') {
    const truth = JSON.parse(readFileSync(`bench/truth-${file}.json`))
    row.corr = corr(r.envelope, truth); row.maxErr = Math.max(...r.envelope.map((v, k) => Math.abs(v - truth[k])))
  }
  console.log(JSON.stringify(row)); rows.push(row)
}
for (const impl of ['ours', 'wavesurfer']) {
  const r = await run(impl, 'podcast-60m', 50)
  const row = { file: 'podcast-60m @50Mbps', impl, firstPaint: r.firstPaint, complete: r.complete, peakMB: r.peakMB, error: r.error }
  console.log(JSON.stringify(row)); rows.push(row)
}
writeFileSync('bench/decode-results.json', JSON.stringify(rows, null, 2))
