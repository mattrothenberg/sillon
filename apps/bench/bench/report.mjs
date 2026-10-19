// Aggregates bench/results/<date>/raw.jsonl into summary.json and markdown tables.
//   node bench/report.mjs <date>   → bench/summary.json, bench/results/<date>/tables.md
import { readFileSync, writeFileSync } from 'node:fs'

const date = process.argv[2]
const dir = `bench/results/${date}`
const rows = readFileSync(`${dir}/raw.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => !r.smoke)
const env = JSON.parse(readFileSync(`${dir}/env.json`))
const gen = JSON.parse(readFileSync('bench/results/gen-cost.json'))

const q = (xs, p) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }
const stat = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? { median: q(v, 0.5), p25: q(v, 0.25), p75: q(v, 0.75), min: Math.min(...v), max: Math.max(...v), n: v.length } : null }

const METRICS = {
  firstBars: (r) => r.firstBars,
  complete: (r) => r.complete,
  // sillon streams left to right; others draw everything at once (same as complete).
  half: (r) => (r.c === 'sillon' && r.method === 'webcodecs' ? r.drawn50 : r.complete),
  peakMemoryMB: (r) => r.peakRssMB,
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

const groups = new Map()
for (const r of rows) {
  const k = `${r.browser}|${r.net}|${r.file}|${r.c}`
  ;(groups.get(k) ?? groups.set(k, []).get(k)).push(r)
}
const cells = []
for (const [k, rs] of groups) {
  const [browser, net, file, c] = k.split('|')
  const ok = rs.filter((r) => !r.error)
  const cell = { browser, net, file, contender: c, runs: rs.length, errors: rs.length - ok.length, method: [...new Set(ok.map((r) => r.method))].join(','), version: rs[0].version }
  for (const [m, f] of Object.entries(METRICS)) cell[m] = stat(ok.map(f))
  if (rs.length - ok.length) cell.errorSamples = [...new Set(rs.filter((r) => r.error).map((r) => r.error))].slice(0, 3)
  cells.push(cell)
}
const ORDER = ['sillon', 'sillon-fallback', 'ws', 'ws-peaks', 'naive']
const FILES = ['d30s', 'd5m', 'd1h', 'd3h', 'd5m-320', 'd5m-vbr', 'd5m-48m', 'd1h-320', 'd1h-vbr', 'd1h-48m']
cells.sort((a, b) => (a.browser + a.net).localeCompare(b.browser + b.net) || FILES.indexOf(a.file) - FILES.indexOf(b.file) || ORDER.indexOf(a.contender) - ORDER.indexOf(b.contender))
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
  },
  method: [
    'Fresh browser process per run, cold cache, seeded-random interleaved order, 1 s pause between runs.',
    'Times are ms since navigation start (bundle load counts). Drawn = second rAF after the first draw with real data.',
    'Network shaped at the server with one shared token bucket (DevTools emulation may skip worker fetches). JS/HTML/JSON gzipped.',
    'Memory: RSS of the whole browser process tree sampled every 100 ms, minus the same tree idle on a blank page.',
    'CPU: CPU seconds of that tree from navigation to complete, all threads. TBT: Chromium long tasks only.',
    'Accuracy: vs ffmpeg decode (gapless-trimmed), ~20 000 bins aligned to 256-sample reference buckets.',
    'sillon bundle includes React + ReactDOM (~65 kB gz), counted against it.',
  ],
  caveats: [
    `One machine, headless browsers, ${conditions}; absolute numbers will differ elsewhere.`,
    'Speech corpus (TTS); wavesurfer decodes at 8 kHz by default, so its peak accuracy is lower by design and the difference is invisible at overview zoom.',
    'sillon "first bars" is the start of a left-to-right stream, not the whole waveform; compare "complete" or "half" for the full shape.',
  ],
}
writeFileSync('bench/summary.json', JSON.stringify({ date, env, power, conditions, generated: new Date().toISOString(), notes, serverPeaksCost: gen, cells }, null, 2))

/* ------------------------------------------------------------ markdown */

const NAMES = { sillon: 'sillon', 'sillon-fallback': 'sillon (fallback)', ws: 'wavesurfer', 'ws-peaks': 'wavesurfer + peaks', naive: 'naive' }
const ms = (s) => s == null ? '–' : s.median >= 1000 ? `${(s.median / 1000).toFixed(2)} s` : `${Math.round(s.median)} ms`
const msR = (s) => s == null ? '–' : `${ms(s)} <sub>${fmtMs(s.p25)}–${fmtMs(s.p75)}</sub>`
const fmtMs = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}`)
const mb = (s) => s == null ? '–' : s.median >= 1024 ? `${(s.median / 1024).toFixed(2)} GB` : `${Math.round(s.median)} MB`
const sec = (s) => s == null ? '–' : `${s.median.toFixed(2)} s`
const acc = (c) => c.corr == null ? '–' : `${c.corr.median.toFixed(4)} / ${c.maxErr.median.toFixed(3)}${Math.abs(c.shiftMs?.median ?? 0) > 0 ? ` / shift ${c.shiftMs.median.toFixed(1)} ms` : ''}`

function table(filter, title) {
  const sel = cells.filter(filter)
  if (!sel.length) return ''
  let out = `### ${title}\n\n| file | contender | first bars | half drawn | complete | peak memory | CPU | TBT | max lag | input p95 / max | accuracy (corr / max err) | runs |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`
  for (const c of sel) {
    out += `| ${c.file} | ${NAMES[c.contender]} | ${msR(c.firstBars)} | ${ms(c.half)} | ${msR(c.complete)} | ${mb(c.peakMemoryMB)} | ${sec(c.cpuSec)} | ${ms(c.tbt)} | ${ms(c.maxLag)} | ${ms(c.inputP95)} / ${ms(c.inputMax)} | ${acc(c)} | ${c.runs - c.errors}/${c.runs}${c.errors ? ' ⚠' : ''} |\n`
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
const errs = cells.filter((c) => c.errors)
if (errs.length) md += `### Failed runs\n\n${errs.map((c) => `- ${c.browser} ${c.net} ${c.file} ${NAMES[c.contender]}: ${c.errors}/${c.runs} — ${c.errorSamples.join('; ')}`).join('\n')}\n`
writeFileSync(`${dir}/tables.md`, md)
console.log(md)
