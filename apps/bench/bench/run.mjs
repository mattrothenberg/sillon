// Benchmark runner. Fresh browser process per run, cold cache, randomized order.
//   node bench/run.mjs [main] [encodings] [network] [browsers] [--date YYYY-MM-DD] [--smoke] [--allow-battery]
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
const suites = args.filter((a) => !a.startsWith('--') && a !== date)
const dir = `bench/results/${date}`
mkdirSync(dir, { recursive: true })
const rawPath = `${dir}/raw.jsonl`
const gen = JSON.parse(readFileSync('bench/results/gen-cost.json'))

const ALL = ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'naive']
const NETS = { local: { port: 4180 }, '50mbps': { port: 4181, mbps: 50, latency: 40 }, '10mbps': { port: 4182, mbps: 10, latency: 60 } }

// Cells: browser × network × file × contender, with a run count.
const cells = []
const add = (browser, net, files, contenders, n) => { for (const file of files) for (const c of contenders) cells.push({ browser, net, file, c, n }) }
const want = (s) => suites.length === 0 || suites.includes(s)
if (want('main')) add('chromium', 'local', ['d30s', 'd5m', 'd1h', 'd3h'], ALL, 10)
if (want('encodings')) add('chromium', 'local', ['d5m-320', 'd5m-vbr', 'd5m-48m', 'd1h-320', 'd1h-vbr', 'd1h-48m'], ['sillon', 'sillon-fallback', 'ws', 'naive'], 7)
if (want('network')) for (const net of ['50mbps', '10mbps']) add('chromium', net, ['d5m', 'd1h'], ALL, 7)
if (want('browsers')) for (const b of ['firefox', 'webkit']) add(b, 'local', ['d5m', 'd1h'], ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'naive'], 7)
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
  const server = await bt.launchServer(cell.browser === 'chromium' ? { channel: 'chromium' } : {})
  const rootPid = server.process().pid
  const browser = await bt.connect(server.wsEndpoint())
  const pathMatch = cell.browser === 'webkit' ? bt.executablePath().replace(/(\/webkit-\d+)\/.*$/, '$1/') : null
  const context = await browser.newContext({ viewport: { width: 1300, height: 400 } })
  const page = await context.newPage()
  const sr = gen[cell.file].sampleRate
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
    await page.goto(`${base}/compare.html?c=${cell.c}&file=${cell.file}&sr=${sr}`, { waitUntil: 'commit' })
    await page.waitForFunction(() => window.__r?.timing || window.__r?.error, null, { timeout, polling: 100 })
    stop = true
    await Promise.all([sampler, mover])
    const end = snapshot(rootPid, pathMatch)
    await within(page.evaluate(() => window.__go?.()), 30000, 'release')
    await page.waitForFunction(() => window.__r?.done, null, { timeout: 240000, polling: 200 })
    const r = await within(page.evaluate(() => window.__r), 30000, 'collect')
    Object.assign(out, r, {
      peakRssMB: (peak - base0.rss) / 1048576,
      peakRssAbsMB: peak / 1048576,
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
  const r = await runOnce(cell)
  appendFileSync(rawPath, JSON.stringify(r) + '\n')
  i++
  const eta = ((Date.now() - t0) / i) * (queue.length - i) / 60000
  console.log(`[${i}/${queue.length} eta ${eta.toFixed(0)}m] ${key(cell)} first=${r.firstBars?.toFixed?.(0)} complete=${r.complete?.toFixed?.(0)} mem=${r.peakRssMB?.toFixed?.(0)}MB ${r.method ?? ''} ${r.error ?? ''}`)
  await sleep(1000)
}
servers.forEach((s) => s.kill())
process.exit(0)
