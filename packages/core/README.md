# @sillon/core

Audio peaks for waveforms: decode a file in the browser, streaming long MP3s as they download, or read peaks made ahead of time. No framework, no dependencies.

```sh
npm install @sillon/core
```

Most apps use this through [`@sillon/react`](../react/README.md), which re-exports `Peaks` and `streamPeaks`. Use it directly to load peaks outside React, to draw them yourself, or to make `.peaks` files.

## Contents

- [Usage](#usage)
- [`Peaks`](#peaks)
- [`streamPeaks`](#streampeaks)
- [`.peaks` files](#peaks-files)
- [`@sillon/core/mp3`](#silloncoremp3)
- [Environment](#environment)

## Usage

```ts
import { streamPeaks, type Peaks } from '@sillon/core'

const { peaks, first, done, cancel } = streamPeaks('/episode.mp3')

peaks.subscribe(() => draw(peaks)) // called as data arrives
await first                        // something to draw
const stats = await done           // all of it
```

```ts
// Draw 300 bars of the whole file.
function draw(peaks: Peaks) {
  const bars = peaks.bars(0, peaks.duration, new Float32Array(300))
  for (let i = 0; i < bars.length; i++) {
    const height = bars[i] / (peaks.max || 1) // 0–1, normalized
    // …
  }
}
```

## `Peaks`

The loudness of a recording over time. Each value is the largest absolute sample in a bucket of `bucketSize` samples, across all channels: 0 for silence, 1 for full scale. Values are stored as they are, not normalized; divide by `max` to normalize.

A `Peaks` object grows as values are appended, and keeps a pyramid of maxima (each level halving the one below), so reading a range touches a few values per bar, however long the range is.

### Creating

```ts
new Peaks(init: PeaksInit)

interface PeaksInit {
  sampleRate: number
  bucketSize: number  // samples per value
  expected?: number   // values expected in total, if known
}
```

An empty `Peaks`, to fill with `append` and close with `finish`. `expected` lets a streaming waveform know its length before the data arrives, so it can fill in left to right.

```ts
Peaks.from(values: ArrayLike<number> | ArrayLike<number>[], init: PeaksFromInit): Peaks

type PeaksFromInit =
  | { sampleRate: number; bucketSize: number } // samples behind each value
  | { duration: number }                       // seconds the values span
```

Wraps values you already have (from a server, a cache, `toArray()`, or wavesurfer.js's `exportPeaks()`), already complete. `values` is one array, or one array per channel. Values may be signed: each bucket keeps the largest absolute value across channels, and a channel shorter than the others counts as 0 past its end.

`{ duration }` spreads the values evenly over that many seconds, as wavesurfer.js's `peaks` and `duration` options do, and `peaks.duration` reads it back exactly. Peaks made this way have a fractional sample rate, so they can't be `encode`d; pass `{ sampleRate, bucketSize }` for that.

```ts
// wavesurfer.js-style peaks: one signed array per channel, plus the duration.
const peaks = Peaks.from([left, right], { duration: 213.7 })
```

```ts
Peaks.decode(buf: ArrayBuffer, into?: Peaks): Peaks
```

Reads a [`.peaks` file](#peaks-files). With `into`, which must be empty, fills that object instead of creating one. Throws if the buffer isn't a `.peaks` file, is a version or bit depth this release doesn't read, or is shorter than its header says (`truncated .peaks file`).

### Reading

| Member | Type | Description |
|---|---|---|
| `sampleRate` | `number` | Samples per second of the source audio. |
| `bucketSize` | `number` | Samples per value. |
| `max` | `number` | The largest value so far. |
| `complete` | `boolean` | True once every value has arrived. |
| `version` | `number` | Increases on every change, so a renderer can skip work when nothing changed. |
| `length` | `number` | Values received so far. |
| `span` | `number` | Values the recording spans: the expected total while streaming, the real total once complete. |
| `duration` | `number` | Seconds the recording spans. An estimate until `complete`. |
| `loaded` | `number` | Seconds received so far. |
| `bars(start, end, out)` | `Float32Array` | Fills `out` with one value per bar for the range `start`–`end` seconds, and returns it. `out.length` is the number of bars. Every value in the range belongs to exactly one bar; past one value per bar, each bar takes the value under its center. Ranges past what has loaded read as 0. |
| `peak(start, end)` | `number` | The largest value between `start` and `end` seconds. |
| `toArray()` | `Float32Array` | A copy of every value received. |
| `subscribe(listener)` | `() => void` | Calls `listener()` on every change. Returns an unsubscribe function. |

### Writing

| Method | Description |
|---|---|
| `begin(sampleRate, expected, bucketSize?)` | Sets the format and expected length once a stream knows them. Call it before the first `append`. |
| `append(values)` | Adds values to the end. Notifies subscribers. |
| `finish()` | Marks the peaks complete. Notifies subscribers. |
| `encode(options?)` | Packs the values into a [`.peaks` file](#peaks-files) and returns its `ArrayBuffer`. `options.bits` is `8` (default) or `16`. Throws if the sample rate or bucket size isn't a whole number, as with `Peaks.from(values, { duration })`. |

## `streamPeaks`

```ts
function streamPeaks(url: string, options?: StreamOptions): PeakStream

interface PeakStream {
  peaks: Peaks                  // usable right away; fills in as the file loads
  first: Promise<number>        // ms until the first values arrived
  done: Promise<StreamStats>    // resolves once complete, rejects on failure
  cancel(): void                // stops downloading and decoding
}

interface StreamOptions {
  bucketSize?: number   // samples per value; default 256
  postEveryMs?: number  // how often a streaming worker hands over values; default 50
  wholeBelow?: number   // bytes; default 8 MB (8 × 1024 × 1024)
  fetch?: RequestInit   // headers, credentials, mode, cache, …; for every request
}

interface StreamStats {
  firstPeaksMs: number
  totalMs: number
  method: 'webcodecs' | 'decodeAudioData' | 'file'
}
```

Peaks for an audio file, or a `.peaks` file. `url` is resolved against the page's URL. How it's read depends on the file:

1. **A `.peaks` file** (the path ends in `.peaks`, before any `?` or `#`) is fetched and read with `Peaks.decode`. Method `file`.
2. **Audio up to `wholeBelow` bytes**, going by the response's `Content-Length`, is fetched and decoded whole with `decodeAudioData`. The browser resamples it to 44.1 kHz, so `peaks.sampleRate` is 44100. At most four of these decodes run at once, so a page of many short files doesn't hold them all in memory together. Method `decodeAudioData`.
3. **Larger files**, or any file when the server sends no `Content-Length`, or when `wholeBelow` is `0`, are streamed into a Web Worker, which parses MP3 frames as they arrive and decodes them with WebCodecs `AudioDecoder`. Values reach `peaks` every `postEveryMs`, so a waveform can draw before the download finishes, and only one frame of decoded audio exists at a time. Encoder delay and padding are trimmed using the file's LAME/Info header, so times match the decoded audio to the sample. `peaks.sampleRate` is the file's own. Method `webcodecs`.
4. If the worker can't stream the file (no `AudioDecoder`, no MP3 support in it, or no MP3 frame in the first 64 kB), the file is fetched again and decoded whole, as in 2.

`fetch` is passed to every request the stream makes, for signed URLs, cookies (`credentials: 'include'`) or auth headers. The streaming worker gets a copy, with the headers as a plain object. `signal` is ignored: `cancel()` has its own.

```ts
streamPeaks('/private/episode.mp3', { fetch: { headers: { Authorization: `Bearer ${token}` } } })
```

`bucketSize` sets the resolution: at the default 256 samples and 44.1 kHz, there's a value every 5.8 ms. It applies to decoded audio; a `.peaks` file has its own.

`done` rejects if the request fails (`fetch <url>: <status>`), the audio can't be decoded, or the `.peaks` file is invalid. `cancel()` aborts the request and stops the worker; the promises are then left pending or rejected with the abort.

## `.peaks` files

A compact binary file of peaks made ahead of time. For long audio, it saves the browser downloading and decoding the whole file just to draw it: an hour at 44.1 kHz and 512 samples per value is about 310,000 values, which is 300 kB at 8 bits.

### Making them

With the repository's script, from a clone ([ffmpeg](https://ffmpeg.org) and ffprobe must be installed; any format ffmpeg reads works):

```sh
node scripts/peaks.mjs <audio> <out.peaks> [samplesPerValue] [bits]
node scripts/peaks.mjs episode.mp3 episode.peaks 512 8
```

`samplesPerValue` defaults to 1024 and `bits` to 8. The sample rate is the file's own.

Or with `Peaks.encode`, in the browser or in Node:

```ts
// From audio, in the browser.
import { streamPeaks } from '@sillon/core'

const { peaks, done } = streamPeaks('/episode.mp3', { bucketSize: 512 })
await done
const file = peaks.encode() // ArrayBuffer
```

```ts
// From values you computed elsewhere, in Node.
import { writeFileSync } from 'node:fs'
import { Peaks } from '@sillon/core'

const peaks = Peaks.from(values, { sampleRate: 44100, bucketSize: 512 })
writeFileSync('episode.peaks', new Uint8Array(peaks.encode({ bits: 16 })))
```

Serve the file with any content type. `streamPeaks` (and so `usePeaks`) reads any URL ending in `.peaks` as one.

### Choosing a resolution

Values are `duration × sampleRate ÷ samplesPerValue`; the file is 24 bytes plus one byte per value at 8 bits, or two at 16. Fewer samples per value lets a waveform zoom further before bars repeat the same value: at 512 samples and 44.1 kHz, one value covers 11.6 ms. 8 bits store each value to within 1/255 of the loudest one: less than a pixel in a waveform up to 255 pixels tall. Use 16 for taller waveforms, or if you read the values for something else.

### Format

Little-endian.

| Offset | Type | Field |
|---|---|---|
| 0 | 4 bytes | Magic: ASCII `SLPK` |
| 4 | u8 | Version: `1` |
| 5 | u8 | Bits per value: `8` or `16` |
| 6 | u16 | Reserved, `0` |
| 8 | u32 | Sample rate, Hz |
| 12 | u32 | Samples per value (`bucketSize`) |
| 16 | u32 | Number of values |
| 20 | f32 | Scale: the largest value |
| 24 | u8[] or u16[] | Values, as fractions of the scale: `value = stored × scale ÷ 255` (or `÷ 65535`) |

Stored values are rounded up, so a quiet value that isn't zero never reads back as silence.

## `@sillon/core/mp3`

The MP3 frame parsing the streaming worker uses, for other tools that need it.

```ts
import { parseHeader, id3Size, parseGapless, type Frame, type Gapless } from '@sillon/core/mp3'
```

| Export | Description |
|---|---|
| `parseHeader(bytes, i): Frame \| null` | Reads the MPEG audio Layer III frame header at `bytes[i]`. Null if there isn't a valid one. MPEG-1, 2 and 2.5. |
| `id3Size(bytes): number` | Length of a leading ID3v2 tag in bytes, including its header and footer, or 0. Needs at least 10 bytes. |
| `parseGapless(bytes, i, frame): Gapless \| null` | Reads the Xing/Info header (and LAME tag) in the first frame, at `bytes[i]`. Null if the frame isn't one. |
| `Frame` | `{ len, sampleRate, channels, samples, bitrate }`: frame length in bytes, Hz, 1 or 2, samples per frame (1152 or 576), bits per second. |
| `Gapless` | `{ frames, delay, padding }`: the frame count the header records (0 if it doesn't), and the encoder's delay and padding in samples (0 without a LAME tag). |

A frame with a Xing/Info header holds metadata, not audio; skip it when decoding.

## Environment

- `Peaks`, `Peaks.from`, `Peaks.decode`, `encode` and the `mp3` functions are plain JavaScript and run anywhere, including Node and workers.
- `streamPeaks` needs a browser: `fetch`, `location`, `OfflineAudioContext`, and for streaming, `Worker` and WebCodecs `AudioDecoder`. It loads its worker with `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`, a pattern bundlers pick up and emit as a separate file: Vite does with no configuration, in development and in production builds, and so does webpack 5.
