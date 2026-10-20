// Checks whether CDP CPU throttling slows dedicated workers, or only the page's main thread.
// Finding (2026-10-19): it does not reach workers (4×: main 642 ms, worker 158 ms for the same loop),
// and Emulation.setCPUThrottlingRate on a worker target fails ("only supported for pages").
// So load suites, where sillon decodes in a worker, are not throttled: it would flatter sillon.
//   node bench/throttle-check.mjs   (needs bench/server.mjs on :4180)
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium' })
for (const rate of [1, 4, 1, 4]) {
  const p = await b.newPage()
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await p.goto('http://localhost:4180/blank.html')
  const r = await p.evaluate(async () => {
    const work = () => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e8; i++) x += i % 7; return [performance.now() - t, x] }
    const main = work()[0]
    const src = `const work = ${work.toString()}; postMessage(work()[0])`
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    const worker = await new Promise((r) => (w.onmessage = (e) => r(e.data)))
    return { main: Math.round(main), worker: Math.round(worker) }
  })
  console.log(rate, JSON.stringify(r))
  await p.close()
}
await b.close()
