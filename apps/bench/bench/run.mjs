// Benchmark runner. Fresh browser process per run, cold cache, randomized order.
//   node bench/run.mjs [main] [encodings] [network] [browsers] [feed] [runtime] [--date YYYY-MM-DD] [--quick] [--only a,b] [--files x,y] [--smoke] [--allow-battery]
// Refuses to start on battery: macOS may lower clocks, and runs must be comparable.
// Appends one JSON line per run to bench/results/<date>/raw.jsonl and resumes
// from it, so an interrupted run picks up where it stopped.
import { chromium, firefox, webkit } from 'playwright'
import { execSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, totalmem, release, loadavg } from 'node:os'

const args = process.argv.slice(2)
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const date = flag('--date') ?? new Date().toISOString().slice(0, 10)
const smoke = args.includes('--smoke')
const suites = args.filter((a, i) => !a.startsWith('--') && !['--date', '--only', '--files'].includes(args[i - 1]))
const dir = `bench/results/${date}`
mkdirSync(dir, { recursive: true })
const rawPath = `${dir}/raw.jsonl`
const gen = JSON.parse(readFileSync('bench/results/gen-cost.json'))

const ALL = ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'naive', 'peaksjs', 'peaksjs-webaudio']
const NETS = { local: { port: 4180 }, '50mbps': { port: 4181, mbps: 50, latency: 40 }, '10mbps': { port: 4182, mbps: 10, latency: 60 } }

// Cells: suite × browser × network × file × contender, with a run count.
// Load suites open compare.html (one file) or feed.html (20 files); runtime opens runtime.html.
const cells = []
const add = (browser, net, files, contenders, n, suite = 'load') => { for (const file of files) for (const c of contenders) cells.push({ suite, browser, net, file, c, n }) }
const want = (s) => suites.length === 0 || suites.includes(s)
if (want('main')) add('chromium', 'local', ['d30s', 'd5m', 'd1h', 'd3h', 'm2m'], ALL, 10)
if (want('encodings')) add('chromium', 'local', ['d5m-320', 'd5m-vbr', 'd5m-48m', 'd1h-320', 'd1h-vbr', 'd1h-48m'], ['sillon', 'sillon-fallback', 'ws', 'naive'], 7)
if (want('network')) for (const net of ['50mbps', '10mbps']) add('chromium', net, ['d5m', 'd1h'], ALL, 7)
if (want('browsers')) for (const b of ['firefox', 'webkit']) add(b, 'local', ['d5m', 'd1h'], ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'naive'], 7)
if (want('feed')) add('chromium', 'local', ['feed20'], ['sillon', 'ws', 'ws-peaks', 'peaksjs', 'peaksjs-webaudio'], 7, 'feed')
// Runtime "files" are scenario@throttle: CPU throttling (CDP) slows the page's main thread only.
if (want('runtime')) add('chromium', 'local', ['playback', 'zoom', 'resize'].flatMap((s) => [`${s}@1x`, `${s}@4x`, `${s}@8x`]), ['sillon', 'ws'], 5, 'runtime')
// --quick: only what the site shows, in about half an hour. Fewer contenders and runs;
// no throttled networks, other browsers, other encodings or 4× throttling.
if (args.includes('--quick')) {
  cells.length = 0
  add('chromium', 'local', ['d30s', 'd5m', 'd1h', 'd3h', 'm2m'], ['sillon', 'sillon-fallback', 'ws', 'ws-peaks'], 5)
  add('chromium', 'local', ['feed20'], ['sillon', 'ws', 'ws-peaks'], 5, 'feed')
  add('chromium', 'local', ['playback', 'zoom', 'resize'].flatMap((s) => [`${s}@1x`, `${s}@8x`]), ['sillon', 'ws'], 3, 'runtime')
}
// --only sillon,ws and --files d5m,feed20 narrow any preset, to check one change in minutes.
const only = flag('--only')?.split(','), files = flag('--files')?.split(',')
for (let i = cells.length - 1; i >= 0; i--) if ((only && !only.includes(cells[i].c)) || (files && !files.includes(cells[i].file))) cells.splice(i, 1)
if (smoke) for (const cell of cells) cell.n = 1

const key = (x) => `${x.browser}|${x.net}|${x.file}|${x.c}`
// Failed runs are retried, up to three extra attempts per cell.
const done = {}, failed = {}
if (existsSync(rawPath)) for (const l of readFileSync(rawPath, 'utf8').split('\n')) if (l) {
  const r = JSON.parse(l)
  if (r.smoke && !smoke) continue
  if (r.error?.startsWith('harness')) failed[key(r)] = (failed[key(r)] ?? 0) + 1
  else done[key(r)] = (done[key(r)] ?? 0) + 1
}

// Seeded shuffle, so the order is random but reproducible.
let seed = 0x5111011
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const queue = cells.flatMap((cell) => Array.from({ length: (failed[key(cell)] ?? 0) > 3 ? 0 : Math.max(0, cell.n - (done[key(cell)] ?? 0)) }, () => cell))
for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]] }

/* ------------------------------------------------------------ processes */

const parseTime = (s) => s.split(':').reduce((a, x) => a * 60 + Number(x), 0)
function snapshot(rootPid, pathMatch) {
  const rows = execSync('ps -axo pid=,ppid=,rss=,time=,command=', { maxBuffer: 1 << 26 }).toString().trim().split('\n').map((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)
    return m && { pid: +m[1], ppid: +m[2], rss: +m[3] * 1024, cpu: parseTime(m[4]), cmd: m[5] }
  }).filter(Boolean)
  // The browser's process tree, plus (for WebKit, whose web processes are XPC
  // services parented by launchd) anything running from its install directory.
  const kids = new Map()
  for (const r of rows) (kids.get(r.ppid) ?? kids.set(r.ppid, []).get(r.ppid)).push(r)
  const set = new Map()
  const walk = (pid) => { for (const k of kids.get(pid) ?? []) if (!set.has(k.pid)) { set.set(k.pid, k); walk(k.pid) } }
  const root = rows.find((r) => r.pid === rootPid)
  if (root) { set.set(root.pid, root); walk(root.pid) }
  if (pathMatch) for (const r of rows) if (r.cmd.includes(pathMatch)) set.set(r.pid, r)
  let rss = 0, cpu = 0
  for (const r of set.values()) { rss += r.rss; cpu += r.cpu }
  return { rss, cpu, procs: set.size }
}

/* ------------------------------------------------------------ servers */

const servers = Object.values(NETS).map((n) => spawn('node', ['bench/server.mjs', String(n.port), String(n.mbps ?? 0), String(n.latency ?? 0)], { stdio: 'ignore' }))
process.on('exit', () => servers.forEach((s) => s.kill()))
await new Promise((r) => setTimeout(r, 800))

const TYPES = { chromium, firefox, webkit }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Playwright calls into a busy browser can stall; nothing here may wait forever.
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))])

async function runOnce(cell) {
  const bt = TYPES[cell.browser]
  const net = NETS[cell.net]
  const base = `http://localhost:${net.port}`
  // launchServer exposes the browser's pid, so memory and CPU cover exactly this browser's processes.
  // Chromium exposes gc(), so memory "while open" is measured after a collection.
  const server = await bt.launchServer(cell.browser === 'chromium' ? { channel: 'chromium', args: ['--js-flags=--expose-gc'] } : {})
  const rootPid = server.process().pid
  const browser = await bt.connect(server.wsEndpoint())
  const pathMatch = cell.browser === 'webkit' ? bt.executablePath().replace(/(\/webkit-\d+)\/.*$/, '$1/') : null
  const feed = cell.suite === 'feed'
  const context = await browser.newContext({ viewport: { width: 1300, height: feed ? 1100 : 400 } })
  const page = await context.newPage()
  // JavaScript as served (gzipped), workers' scripts included.
  let jsBytes = 0
  context.on('response', async (res) => {
    // Only what crossed the network: blob: workers (peaks.js makes some) are not downloads.
    if (!/javascript/.test(res.headers()['content-type'] ?? '') || !res.url().startsWith('http')) return
    jsBytes += Number(res.headers()['content-length'] ?? (await res.body().catch(() => Buffer.alloc(0))).length)
  })
  const sr = gen[cell.file]?.sampleRate ?? 44100
  // Power source and load before each run, so the report can show what the machine was doing.
  const out = { ...cell, n: undefined, version: browser.version(), at: new Date().toISOString(), smoke: smoke || undefined, power: power(), load1: loadavg()[0] }
  try {
    await page.goto(`${base}/blank.html`)
    await sleep(500)
    const base0 = snapshot(rootPid, pathMatch)
    let peak = base0.rss, samples = 0, stop = false
    const sampler = (async () => { while (!stop) { const s = snapshot(rootPid, pathMatch); if (s.rss > peak) peak = s.rss; samples++; await sleep(100) } })()
    // Pointer movement over the waveform during load, for input-delay measurement.
    const mover = (async () => { let x = 0; while (!stop) { await within(page.mouse.move(60 + (x++ % 20) * 50, 100), 2000, 'mouse').catch(() => {}); await sleep(100) } })()
    const timeout = cell.net === '10mbps' ? 300000 : 180000
    await page.goto(feed ? `${base}/feed.html?c=${cell.c}` : `${base}/compare.html?c=${cell.c}&file=${cell.file}&sr=${sr}`, { waitUntil: 'commit' })
    await page.waitForFunction(() => window.__r?.timing || window.__r?.error, null, { timeout, polling: 100 })
    stop = true
    await Promise.all([sampler, mover])
    const end = snapshot(rootPid, pathMatch)
    // Memory while open: what the page still holds once loading is over and the page is idle.
    await sleep(3000)
    await within(page.evaluate(() => window.gc?.()), 10000, 'gc').catch(() => {})
    await sleep(1000)
    const open = snapshot(rootPid, pathMatch)
    await within(page.evaluate(() => window.__go?.()), 30000, 'release')
    await page.waitForFunction(() => window.__r?.done, null, { timeout: 240000, polling: 200 })
    const r = await within(page.evaluate(() => window.__r), 30000, 'collect')
    Object.assign(out, r, {
      peakRssMB: (peak - base0.rss) / 1048576,
      peakRssAbsMB: peak / 1048576,
      retainedMB: (open.rss - base0.rss) / 1048576,
      jsKB: jsBytes / 1024,
      cpuSec: end.cpu - base0.cpu,
      procs: end.procs,
      memSamples: samples,
    })
  } catch (e) {
    out.error = 'harness: ' + String(e.message).split('\n')[0]
  }
  await within(browser.close(), 15000, 'close').catch(() => {})
  await within(server.close(), 15000, 'server close').catch(() => {})
  try { process.kill(rootPid, 'SIGKILL') } catch {}
  return out
}

// Runtime: one scenario, measured from Chromium's own main-thread counters around window.__start().
async function runRuntime(cell) {
  const [scenario, rate] = cell.file.split('@')
  const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage({ viewport: { width: 1300, height: 400 } })
  const out = { ...cell, n: undefined, version: browser.version(), at: new Date().toISOString(), smoke: smoke || undefined, power: power(), load1: loadavg()[0], throttle: parseFloat(rate) }
  try {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: parseFloat(rate) })
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
    await page.goto(`http://localhost:${NETS.local.port}/runtime.html?c=${cell.c}&scenario=${scenario}`)
    await page.waitForFunction(() => window.__r?.ready, null, { timeout: 120000, polling: 200 })
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const m0 = await metrics()
    await within(page.evaluate(() => window.__start()), 60000, 'scenario')
    const m1 = await metrics()
    const r = await page.evaluate(() => window.__r)
    const secs = m1.Timestamp - m0.Timestamp
    const per = (k) => ((m1[k] - m0[k]) * 1000) / secs
    // Milliseconds of main-thread work per second of wall time.
    Object.assign(out, r, { mainMsPerSec: per('TaskDuration'), scriptMsPerSec: per('ScriptDuration'), layoutMsPerSec: per('LayoutDuration'), styleMsPerSec: per('RecalcStyleDuration'), windowSec: secs })
  } catch (e) {
    out.error = 'harness: ' + String(e.message).split('\n')[0]
  }
  await within(browser.close(), 15000, 'close').catch(() => {})
  return out
}

/* ------------------------------------------------------------ go */

function power() { return /'(.*)'/.exec(execSync('pmset -g batt').toString())?.[1] ?? 'unknown' }
if (power() !== 'AC Power' && !args.includes('--allow-battery') && !smoke) {
  console.error(`On ${power()}. Plug in, or pass --allow-battery to run anyway (the report will say so).`)
  process.exit(1)
}

const env = {
  date, cpu: cpus()[0].model, cores: cpus().length, memGB: totalmem() / 2 ** 30, os: `macOS ${execSync('sw_vers -productVersion').toString().trim()} (Darwin ${release()})`,
  power: power(),
  node: process.version, playwright: JSON.parse(readFileSync('node_modules/playwright/package.json')).version,
}
writeFileSync(`${dir}/env.json`, JSON.stringify(env, null, 2))
console.log(`${queue.length} runs queued (${cells.length} cells)`, env.power)
let i = 0
const t0 = Date.now()
for (const cell of queue) {
  const r = cell.suite === 'runtime' ? await runRuntime(cell) : await runOnce(cell)
  appendFileSync(rawPath, JSON.stringify(r) + '\n')
  i++
  const eta = ((Date.now() - t0) / i) * (queue.length - i) / 60000
  const line = cell.suite === 'runtime'
    ? `main=${r.mainMsPerSec?.toFixed?.(1)}ms/s p95=${r.frameP95?.toFixed?.(1)} slow=${((r.slowFrames ?? 0) * 100).toFixed(1)}% redraws=${r.redraws} commits=${r.commits}`
    : `first=${r.firstBars?.toFixed?.(0)} complete=${r.complete?.toFixed?.(0)} mem=${r.peakRssMB?.toFixed?.(0)}MB open=${r.retainedMB?.toFixed?.(0)}MB js=${r.jsKB?.toFixed?.(0)}kB ${r.method ?? ''}`
  console.log(`[${i}/${queue.length} eta ${eta.toFixed(0)}m] ${key(cell)} ${line} ${r.error ?? ''}`)
  await sleep(1000)
}
servers.forEach((s) => s.kill())
process.exit(0)
