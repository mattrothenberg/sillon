// Render benchmark: each strategy × scenario, at 1× and 4× CPU throttle
// (4× ≈ a mid-range laptop on battery / a decent phone).
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch({ channel: 'chromium' })
const probe = await browser.newPage()
console.log('GPU:', await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) }))
await probe.close()

const rows = []
for (const throttle of [1, 4]) for (const scenario of ['playback', 'zoom']) for (const strategy of ['wavesurfer', 'canvas2d', 'svg-native', 'svg-clip', 'canvas-mask', 'webgl']) {
  const page = await browser.newPage({ viewport: { width: 1250, height: 200 }, deviceScaleFactor: 2 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await page.goto(`http://localhost:4173/render.html?strategy=${strategy}&scenario=${scenario}&ms=5000`)
  await page.waitForFunction(() => window.__result?.done, null, { timeout: 60000, polling: 200 })
  const r = await page.evaluate(() => window.__result)
  const row = { throttle, scenario, strategy, fps: +r.fps.toFixed(1), p95: +r.p95.toFixed(1), p99: +r.p99.toFixed(1), jankPct: +(r.jank * 100).toFixed(1), workMs: +r.workMean.toFixed(2) }
  console.log(JSON.stringify(row)); rows.push(row)
  await page.close()
}
writeFileSync('bench/render-results.json', JSON.stringify(rows, null, 2))
await browser.close()
