// Shows how Chromium's Performance.getMetrics counters behave under CDP CPU throttling.
// Finding (2026-10-19): at 4×, TaskDuration/ScriptDuration went DOWN for light work while ThreadTime
// rose to ~6 s per 8 s (the throttler's own busy time), so throttled runs report frame timing only.
//   node bench/metrics-check.mjs   (needs bench/server.mjs on :4180 and a built dist/)
import { chromium } from 'playwright'
for (const [c, sc, rate] of [['sillon','playback',1],['sillon','playback',4],['sillon','playback',1],['sillon','playback',4],['ws','zoom',1],['ws','zoom',4]]) {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1300, height: 400 } })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
  await page.goto(`http://localhost:4180/runtime.html?c=${c}&scenario=${sc}`)
  await page.waitForFunction(() => window.__r?.ready)
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  const a = await m(); await page.evaluate(() => window.__start()); const b = await m()
  const d = {}; for (const k of ['TaskDuration','TaskOtherDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','ThreadTime','ProcessTime','Timestamp']) d[k] = +((b[k]-a[k])*1000).toFixed(0)
  console.log(c, sc, rate, JSON.stringify(d))
  await browser.close()
}
