# Contributing

Thanks for helping. Setup and the everyday commands are in the [README](README.md#develop).

## How it fits together

```
audio file ──▶ @sillon/core: streamPeaks ──▶ Peaks ──▶ @sillon/react: WaveformStore ──▶ parts write their own DOM
                 ├ .peaks file: read as is        (a pyramid of maxima,     (size, view, geometry,       (an SVG clip path, transforms,
                 ├ short file: decodeAudioData     filled as data arrives)    hover; no React state)        text)
                 └ long MP3: worker + WebCodecs
```

- **`packages/core/src/peaks.ts`**: `Peaks`, a growable array of maxima with a level for every halving, so any range at any bar count reads a few values per bar. Also the `.peaks` file format (`encode` / `decode`).
- **`packages/core/src/stream.ts`**: `streamPeaks`, which picks how to read a URL: `.peaks` file, whole-file `decodeAudioData`, or the streaming worker.
- **`packages/core/src/worker.ts`** and **`mp3.ts`**: the worker that fetches an MP3, splits it into frames, decodes them with WebCodecs and reduces each frame to maxima straight away, trimming encoder delay and padding from the LAME header.
- **`packages/react/src/waveform.tsx`**: `WaveformStore`, `Waveform.Root` and every DOM part, `useGroups`, `useActive`, and the drawing (`barsPath`, `fitBars`).
- **`packages/react/src/gl.tsx`** and **`visualizer.tsx`**: the WebGL waveform and the spectrum visualizer, each with a user-supplied GLSL `shade` function.
- **`packages/react/src/player.ts`**, **`use-peaks.ts`**, **`use-audio.ts`**: the `<audio>` wrapper with a per-frame clock and loops, and the hooks.

The site (`apps/site`) is the main way to see changes: every part has a live demo there.

## Rules the components keep

A change that breaks one of these needs a reason in the pull request.

- **Styling belongs to the user.** Parts set only the inline styles they need to work: position, insets, the clip path, and the transforms (and, for regions, widths) that place them in time. Never colors, borders, cursors, centering or any size the user picks: inline styles beat the user's CSS. Looks come from `className`, `style` and CSS custom properties.
- **No re-renders while playing.** Parts render once. After that they subscribe to the store or the player and write to their own DOM node: a transform for the playhead, `d` for the clip path, `textContent` for times. Hooks that do re-render (`usePlayerState`, `useGroups`, `useActive`) only do so when their result changes.
- **Per-frame work is transforms only.** No layout reads in a frame or a pointer move: Root caches its rectangle between pointer events.
- **No animation by default.** Nothing is drawn until the peaks are complete, then everything at once. Streaming draws (`progressive`), sweeps (`reveal`) and effects (`glow`, `swell`) are opt-in props, off by default.
- **Interactive content is the user's.** Interactive things on a waveform (popovers, buttons) are the user's components; sillon supplies times and groups. Events that bubble up from portals must never seek.
- **Parity before invention.** Before adding a look or an option, check what wavesurfer.js offers, and match it where that's enough.

Comments, docs and identifiers use US English (`color`, `center`, `normalize`). Web API names stay as they are (`AnalyserNode`).

## Tests

```sh
pnpm test                                  # everything
pnpm --filter @sillon/core test            # Node's test runner, on the TypeScript source
pnpm --filter @sillon/react test           # Vitest in headless Chromium
pnpm --filter @sillon/react test:watch
```

The React tests render into a real browser, because layout, `ResizeObserver`, pointer capture and `<audio>` don't behave like the real thing in a simulated DOM. Tests that need audio generate a silent WAV in memory (`test/helpers.ts`), so no files are fetched. When you fix a bug, add a test that fails without the fix.

## Docs

The package READMEs ([`@sillon/react`](packages/react/README.md), [`@sillon/core`](packages/core/README.md)) are the reference, and every exported name has a doc comment that shows in editors. Change them with the code: a prop's default in the table should match the default in the source. Code in the READMEs should compile against the current types.

## Audio and assets

- **The demo song** (`apps/site/public/audio/avril.mp3`) is committed. It's recorded from a [Strudel](https://strudel.cc) pattern, `scripts/strudel/avril.strudel.js`, by playing it in headless Chromium and capturing the output: `node scripts/strudel/render.mjs avril 120` (needs network the first time, for the samples). `--voice` swaps the instrument line to try another sound without editing the pattern.
- **`.peaks` files** for the site come from `node scripts/peaks.mjs <audio> <out.peaks> [samplesPerValue] [bits]` (needs ffmpeg). Make them again whenever the audio changes: the site draws its waveforms from them and loads the MP3 only to play.
- **The social card** (`apps/site/public/og.png`, 1200×630) is drawn from the song's peaks in the site's fonts: `pnpm og`. Run it again when the song, the mark or the fonts change.
- **Test and benchmark audio** is generated, not committed: `pnpm audio` (needs macOS `say` and ffmpeg) writes it to `apps/bench/public/audio`.

## Benchmarks

`apps/bench` compares load time, CPU and memory with wavesurfer.js and peaks.js. Run it before and after changes to decoding or drawing; see [its README](apps/bench/README.md). When you report numbers, give the machine, the browser, the file and the number of runs, and show any losses next to the wins.

## Changes and releases

Add a changeset for anything users should hear about (`pnpm changeset`); see [.changeset/README.md](.changeset/README.md). Releases are described in the [README](README.md#releasing).
