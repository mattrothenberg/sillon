# Benchmarks

Benchmarks of sillon against [wavesurfer.js](https://wavesurfer.xyz) and [peaks.js](https://github.com/bbc/peaks.js), kept for regression checks. They're internal: the site doesn't show them. The numbers describe one machine and aren't a ranking.

Each run opens a fresh browser with a cold cache, in a random order, and appends one JSON line to `bench/results/<date>/raw.jsonl`. An interrupted run resumes from that file. The runner refuses to start on battery power, since macOS may lower clock speeds; pass `--allow-battery` to override.

## Setup

Needs ffmpeg, plus the Chromium that Playwright pins:

```sh
pnpm audio                  # in the repo root: the test audio (macOS `say` and ffmpeg)
cd apps/bench
node bench/gen-files.mjs    # the corpus, ffmpeg reference peaks, and precomputed peaks for the other libraries
```

The commands below run in `apps/bench` too.

## Running

```sh
node bench/run.mjs --quick --date 2026-10-20   # the main cells in Chromium, fewer runs: about 30 minutes
node bench/run.mjs --only sillon,ws --files d5m,feed20   # narrow any run to a few cells: a few minutes
node bench/run.mjs --smoke                     # one run of each cell, to check the harness
node bench/report.mjs 2026-10-20               # bench/summary.json and results/<date>/tables.md
```

Suites (name some to run only those): `main` (one file, load to first and full waveform), `encodings`, `network`, `browsers`, `feed` (twenty files on one page) and `runtime` (CPU and memory while playing). `--only` takes contenders (`sillon`, `sillon-fallback`, `ws`, `ws-peaks`, …) and `--files` takes file ids from `bench/gen-files.mjs` (`d30s`, `d5m`, `d1h`, `d3h`, `m2m`, `feed20`, …). `report.mjs` writes `bench/summary.json` only for dated result folders.

## Pages

`pnpm bench` from the repo root serves the pages the runner opens, for looking at by hand: `compare.html` (one file, each library), `feed.html` (twenty files), `runtime.html` (playback), `decode.html` and `render.html` (decode and draw timings), and `lab.html` (each stage of decoding, timed).

Chromium's CPU throttling slows only the page's main thread, not workers, so the load suites aren't throttled: sillon decodes in a worker, and throttling would flatter it. `bench/throttle-check.mjs` shows this, and `bench/metrics-check.mjs` checks which of Chromium's counters can be trusted.
