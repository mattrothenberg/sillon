// Aggregates bench/results/<date>/raw.jsonl into summary.json and markdown tables.
//   node bench/report.mjs <date>           → bench/summary.json, bench/results/<date>/tables.md
//   node bench/report.mjs <date> --smoke   → smoke rows only, written next to them (never bench/summary.json)
import { readFileSync, writeFileSync } from 'node:fs'

const date = process.argv[2]
const dir = `bench/results/${date}`
const smoke = process.argv.includes('--smoke')
const rows = readFileSync(`${dir}/raw.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.smoke === !smoke)
const env = JSON.parse(readFileSync(`${dir}/env.json`))
const gen = JSON.parse(readFileSync('bench/results/gen-cost.json'))

const q = (xs, p) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }
const stat = (xs, keep = false) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? { median: q(v, 0.5), p25: q(v, 0.25), p75: q(v, 0.75), min: Math.min(...v), max: Math.max(...v), n: v.length, ...(keep ? { values: v.map((x) => +x.toFixed(2)) } : {}) } : null }
// Every run's value is kept for these, so a chart can show each run, not only the median.
const KEEP = new Set(['firstBars', 'complete', 'peakMemoryMB', 'retainedMB', 'tbt', 'mainMsPerSec', 'frameP95', 'slowFrames'])
// Rows from before suites existed are load runs.
const suiteOf = (r) => r.suite ?? 'load'

const METRICS = {
  firstBars: (r) => r.firstBars,
  complete: (r) => r.complete,
  // sillon streams left to right; others draw everything at once (same as complete).
  half: (r) => (r.c === 'sillon' && r.method === 'webcodecs' ? r.drawn50 : r.complete),
  // How far the stream had drawn at a quarter and three quarters, for replaying its progress.
  drawn25: (r) => (r.c === 'sillon' && r.method === 'webcodecs' ? r.drawn25 : null),
  drawn75: (r) => (r.c === 'sillon' && r.method === 'webcodecs' ? r.drawn75 : null),
  peakMemoryMB: (r) => r.peakRssMB,
  // Memory while open: after loading, 3 s idle and (Chromium) a garbage collection.
  retainedMB: (r) => r.retainedMB,
  jsKB: (r) => r.jsKB,
  cpuSec: (r) => r.cpuSec,
  tbt: (r) => r.longtask?.tbt,
  maxLag: (r) => r.lag?.max,
  inputP95: (r) => r.input?.p95,
  inputMax: (r) => r.input?.max,
  jsHeapMB: (r) => r.jsHeapMB,
  corr: (r) => r.accuracy?.corr20000,
  maxErr: (r) => r.accuracy?.maxErr20000,
  shiftMs: (r) => r.accuracy?.lagMs,
}

// Runtime: Chromium's main-thread counters are only trusted unthrottled (see bench/metrics-check.mjs).
const unthrottled = (f) => (r) => (r.throttle === 1 ? f(r) : null)
const RUNTIME = {
  mainMsPerSec: unthrottled((r) => r.mainMsPerSec),
  scriptMsPerSec: unthrottled((r) => r.scriptMsPerSec),
  layoutMsPerSec: unthrottled((r) => r.layoutMsPerSec),
  styleMsPerSec: unthrottled((r) => r.styleMsPerSec),
  fps: (r) => r.fps,
  frameP50: (r) => r.frameP50,
  frameP95: (r) => r.frameP95,
  frameP99: (r) => r.frameP99,
  slowFrames: (r) => r.slowFrames,
  redraws: (r) => r.redraws,
  commits: (r) => r.commits,
  played: (r) => r.played,
}

function aggregate(suite, metrics) {
  const groups = new Map()
  for (const r of rows.filter((r) => suiteOf(r) === suite)) {
    const k = `${r.browser}|${r.net}|${r.file}|${r.c}`
    ;(groups.get(k) ?? groups.set(k, []).get(k)).push(r)
  }
  const out = []
  for (const [k, rs] of groups) {
    const [browser, net, file, c] = k.split('|')
    const ok = rs.filter((r) => !r.error)
    const cell = { browser, net, file, contender: c, runs: rs.length, errors: rs.length - ok.length, method: [...new Set(ok.map((r) => r.method).filter(Boolean))].join(','), version: rs[0].version }
    for (const [m, f] of Object.entries(metrics)) cell[m] = stat(ok.map(f), KEEP.has(m))
    if (rs.length - ok.length) cell.errorSamples = [...new Set(rs.filter((r) => r.error).map((r) => r.error))].slice(0, 3)
    out.push(cell)
  }
  return out
}
const ORDER = ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'peaksjs', 'peaksjs-webaudio', 'naive']
const FILES = ['d30s', 'd5m', 'd1h', 'd3h', 'm2m', 'd5m-320', 'd5m-vbr', 'd5m-48m', 'd1h-320', 'd1h-vbr', 'd1h-48m']
const SCENARIOS = ['playback@1x', 'playback@4x', 'playback@8x', 'zoom@1x', 'zoom@4x', 'zoom@8x', 'resize@1x', 'resize@4x', 'resize@8x']
const byOrder = (list) => (a, b) => (a.browser + a.net).localeCompare(b.browser + b.net) || list.indexOf(a.file) - list.indexOf(b.file) || ORDER.indexOf(a.contender) - ORDER.indexOf(b.contender)
const cells = aggregate('load', METRICS).sort(byOrder(FILES))
const feed = aggregate('feed', METRICS).sort(byOrder([]))
const runtime = aggregate('runtime', RUNTIME).sort(byOrder(SCENARIOS)).map((c) => {
  const [scenario, rate] = c.file.split('@')
  return { ...c, scenario, throttle: parseFloat(rate) }
})
// What the machine was doing. Older rows have no per-run record; fall back to the power source at start.
const powers = Object.entries(rows.reduce((m, r) => ((m[r.power ?? env.power] = (m[r.power ?? env.power] ?? 0) + 1), m), {}))
const loads = rows.map((r) => r.load1).filter((x) => x != null)
const conditions = (powers.length === 1 ? `on ${powers[0][0].replace(/'/g, '')}` : `mixed power (${powers.map(([p, n]) => `${n} runs on ${p}`).join(', ')})`)
  + (loads.length ? `, 1-min load average before each run ${q(loads, 0.5).toFixed(1)} median / ${Math.max(...loads).toFixed(1)} max` : '')
const plain = { 'AC Power': 'plugged in', 'Battery Power': 'on battery' }
const power = powers.length === 1 ? (plain[powers[0][0].replace(/'/g, '')] ?? powers[0][0]) : 'partly on battery'
// Short method notes, for captions wherever these numbers are shown.
const notes = {
  contenders: {
    sillon: '@sillon/react parts over streamPeaks(): fetch-streamed MP3, WebCodecs decode in a worker, 256-sample max-abs peaks; plus a preload=metadata <audio> as usePlayer creates.',
    'sillon-fallback': 'sillon with its worker forced to report unsupported: whole-file fetch + OfflineAudioContext.decodeAudioData at 44.1 kHz, peaks on the main thread.',
    ws: 'wavesurfer.js 8.0.2 defaults (url only): fetch + decodeAudioData into an 8 kHz AudioContext.',
    'ws-peaks': 'wavesurfer.js 8.0.2 with precomputed 8000-point peaks JSON + duration (its long-file advice); JSON fetch timed, server step in serverPeaksCost.',
    naive: 'fetch + new AudioContext().decodeAudioData + per-pixel max on the main thread + canvas.',
    peaksjs: 'peaks.js 4.0.0 overview with precomputed data in the layout `audiowaveform -b 8` writes (256 samples per pixel, channels averaged), made here from ffmpeg; the .dat fetch is timed, served uncompressed.',
    'peaksjs-webaudio': 'peaks.js 4.0.0 overview with its Web Audio path: XHR for the whole file, decodeAudioData, waveform data on the main thread.',
  },
  feed: '20 waveforms of 20 different 3-minute speech files (CBR 128 kbps) on one page, each with something that can play it. sillon: one useAudio() per item with library defaults (each waveform draws once its file is read; all 20 stream at once). wavesurfer.js: one WaveSurfer.create per item (defaults, or precomputed peaks). peaks.js: one overview per item (precomputed .dat, or Web Audio with one shared AudioContext). "Complete" is when the last of the 20 is on screen.',
  runtime: [
    'Both libraries draw the same 1-hour file from the same precomputed data (ffmpeg, 256-sample max-abs), so nothing is decoded during the test. 1200 px wide, 2 px bars, 1 px gaps.',
    'Each scenario runs 8 s: playback (the audio plays, muted; played part and cursor follow it), zoom (the view sweeps from the whole hour to 5 s at 30:00 and back, set every frame), resize (container width swings 600–1200 px every frame).',
    'Main-thread time is Chromium\'s Performance.getMetrics TaskDuration (plus its script, layout and style parts), in ms per second of wall time, unthrottled only: under CDP CPU throttling those counters went down for light work (bench/metrics-check.mjs), so throttled runs report frame timing only.',
    'CPU throttling (CDP Emulation.setCPUThrottlingRate) slows the page\'s main thread only. That is fine here, since neither library uses a worker after loading.',
    'Slow frames: share of animation frames longer than 1.5× the median frame. Redraws: sillon, changes to its clip path; wavesurfer.js, its redrawcomplete events. Commits: React commits during the window, counted through the React DevTools hook.',
    'wavesurfer.js waits for resizing to pause (100 ms) before redrawing, so during a continuous resize it does less work and shows its old drawing stretched; sillon redraws every frame.',
  ],
  memory: 'Peak memory: most RSS of the browser\'s whole process tree while loading, minus the same tree idle on a blank page. Memory while open: the same, measured 3 s after loading finished plus 1 s after a forced garbage collection (Chromium only). RSS is what the OS has handed the browser; memory freed inside the browser is not always returned right away, so "while open" can include memory the page no longer uses.',
  method: [
    'Fresh browser process per run, cold cache, seeded-random interleaved order, 1 s pause between runs.',
    'Times are ms since navigation start (bundle load counts). Drawn = second rAF after the first draw with real data.',
    'Network shaped at the server with one shared token bucket (DevTools emulation may skip worker fetches). JS/HTML/JSON gzipped.',
    'Memory: RSS of the whole browser process tree sampled every 100 ms, minus the same tree idle on a blank page.',
    'CPU: CPU seconds of that tree from navigation to complete, all threads. TBT: Chromium long tasks only.',
    'Accuracy: vs ffmpeg decode (gapless-trimmed), ~20 000 bins aligned to 256-sample reference buckets.',
    'sillon bundle includes React + ReactDOM (~65 kB gz), counted against it. JS transferred: every JavaScript response as served (gzipped), worker scripts included.',
  ],
  caveats: [
    `One machine, headless browsers, ${conditions}; absolute numbers will differ elsewhere.`,
    'Speech corpus (TTS); wavesurfer decodes at 8 kHz by default, so its peak accuracy is lower by design and the difference is invisible at overview zoom.',
    'sillon "first bars" is the start of a left-to-right stream, not the whole waveform; compare "complete" or "half" for the full shape.',
    'Load suites are not CPU-throttled: Chromium\'s throttling does not reach workers (bench/throttle-check.mjs), so a throttled run would slow the others\' decoding but not sillon\'s.',
    'Music is one 2-minute file (m2m, 192 kbps); the rest of the corpus is speech.',
  ],
}
// Only a dated run feeds the site; smoke and lab runs (any other name) stay in their own folder.
const site = !smoke && /^\d{4}-\d{2}-\d{2}$/.test(date)
writeFileSync(site ? 'bench/summary.json' : `${dir}/summary.json`, JSON.stringify({ date, env, power, conditions, generated: new Date().toISOString(), raw: `apps/bench/${dir}/raw.jsonl`, notes, serverPeaksCost: gen, cells, feed, runtime }, null, 2))

/* ------------------------------------------------------------ markdown */

const NAMES = { sillon: 'sillon', 'sillon-fallback': 'sillon (fallback)', ws: 'wavesurfer', 'ws-peaks': 'wavesurfer + peaks', naive: 'naive', peaksjs: 'peaks.js + .dat', 'peaksjs-webaudio': 'peaks.js (Web Audio)' }
const ms = (s) => s == null ? '–' : s.median >= 1000 ? `${(s.median / 1000).toFixed(2)} s` : `${Math.round(s.median)} ms`
const msR = (s) => s == null ? '–' : `${ms(s)} <sub>${fmtMs(s.p25)}–${fmtMs(s.p75)}</sub>`
const fmtMs = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}`)
const mb = (s) => s == null ? '–' : s.median >= 1024 ? `${(s.median / 1024).toFixed(2)} GB` : `${Math.round(s.median)} MB`
const sec = (s) => s == null ? '–' : `${s.median.toFixed(2)} s`
const acc = (c) => c.corr == null ? '–' : `${c.corr.median.toFixed(4)} / ${c.maxErr.median.toFixed(3)}${Math.abs(c.shiftMs?.median ?? 0) > 0 ? ` / shift ${c.shiftMs.median.toFixed(1)} ms` : ''}`

const kb = (s) => s == null ? '–' : `${Math.round(s.median)} kB`
function table(filter, title, from = cells) {
  const sel = from.filter(filter)
  if (!sel.length) return ''
  let out = `### ${title}\n\n| file | contender | first bars | half drawn | complete | peak memory | while open | CPU | TBT | max lag | input p95 / max | JS | accuracy (corr / max err) | runs |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`
  for (const c of sel) {
    out += `| ${c.file} | ${NAMES[c.contender]} | ${msR(c.firstBars)} | ${ms(c.half)} | ${msR(c.complete)} | ${mb(c.peakMemoryMB)} | ${mb(c.retainedMB)} | ${sec(c.cpuSec)} | ${ms(c.tbt)} | ${ms(c.maxLag)} | ${ms(c.inputP95)} / ${ms(c.inputMax)} | ${kb(c.jsKB)} | ${acc(c)} | ${c.runs - c.errors}/${c.runs}${c.errors ? ' ⚠' : ''} |\n`
  }
  return out + '\n'
}

const n1 = (s, d = 1) => s == null ? '–' : s.median.toFixed(d)
const pct = (s) => s == null ? '–' : `${(s.median * 100).toFixed(1)}%`
function runtimeTable() {
  if (!runtime.length) return ''
  let out = `### Runtime, Chromium, 1-hour file from precomputed data\n\n| scenario | CPU throttle | contender | main thread ms/s | script / layout / style ms/s | frame p50 / p95 / p99 | slow frames | redraws | React commits | runs |\n|---|---|---|---|---|---|---|---|---|---|\n`
  for (const c of runtime) {
    out += `| ${c.scenario} | ${c.throttle}× | ${NAMES[c.contender]} | ${n1(c.mainMsPerSec)} | ${n1(c.scriptMsPerSec)} / ${n1(c.layoutMsPerSec)} / ${n1(c.styleMsPerSec)} | ${n1(c.frameP50)} / ${n1(c.frameP95)} / ${n1(c.frameP99)} | ${pct(c.slowFrames)} | ${n1(c.redraws, 0)} | ${c.commits ? n1(c.commits, 0) : '–'} | ${c.runs - c.errors}/${c.runs}${c.errors ? ' ⚠' : ''} |\n`
  }
  return out + '\n'
}

let md = `<!-- generated by bench/report.mjs from ${dir}/raw.jsonl -->\n\n`
md += table((c) => c.browser === 'chromium' && c.net === 'local' && !c.file.includes('-'), 'Chromium, local server, CBR 128 kbps stereo 44.1 kHz')
md += table((c) => c.browser === 'chromium' && c.net === 'local' && c.file.includes('-'), 'Chromium, local server, other encodings')
md += table((c) => c.browser === 'chromium' && c.net === '50mbps', 'Chromium, 50 Mbps / 40 ms (shaped at the server)')
md += table((c) => c.browser === 'chromium' && c.net === '10mbps', 'Chromium, 10 Mbps / 60 ms (shaped at the server)')
md += table((c) => c.browser === 'firefox', `Firefox ${cells.find((c) => c.browser === 'firefox')?.version ?? ''}, local server`)
md += table((c) => c.browser === 'webkit', `WebKit ${cells.find((c) => c.browser === 'webkit')?.version ?? ''}, local server`)
md += table(() => true, 'Feed: 20 different 3-minute files on one page, Chromium, local server', feed)
md += runtimeTable()
const errs = [...cells, ...feed, ...runtime].filter((c) => c.errors)
if (errs.length) md += `### Failed runs\n\n${errs.map((c) => `- ${c.browser} ${c.net} ${c.file} ${NAMES[c.contender]}: ${c.errors}/${c.runs} — ${c.errorSamples.join('; ')}`).join('\n')}\n`
writeFileSync(`${dir}/tables.md`, md)
console.log(md)
