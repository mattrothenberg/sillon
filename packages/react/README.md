# @sillon/react

Headless waveform components for React. The library draws the shape of the bars; what fills them, and everything placed on them, is your own HTML and CSS.

```sh
npm install @sillon/react
```

React 19 is a peer dependency (`Waveform.Root` and `Visualizer` take `ref` as a regular prop). It installs `@sillon/core`, which decodes audio into peaks. `Peaks`, `streamPeaks` and the `PeakStream`, `StreamOptions` and `StreamStats` types are re-exported here.

## Contents

- [Quick start](#quick-start)
- [Concepts](#concepts)
- [Components](#components): [Root](#waveformroot), [Shape](#waveformshape), [Skeleton](#waveformskeleton), [Track](#waveformtrack), [Progress](#waveformprogress), [Cursor](#waveformcursor), [Hover](#waveformhover), [Region](#waveformregion), [RegionHandle](#waveformregionhandle), [Time](#waveformtime), [Marker](#waveformmarker), [GL](#waveformgl), [Visualizer](#visualizer)
- [Hooks](#hooks): [useAudio](#useaudio), [usePeaks](#usepeaks), [usePlayer](#useplayer), [usePlayerState](#useplayerstate), [useWaveformStore](#usewaveformstore), [useWaveform](#usewaveform), [useGroups](#usegroups), [useActive](#useactive), [useZoom](#usezoom), [useTicks](#useticks), [useRecorder](#userecorder)
- [Player](#player)
- [Store and helpers](#store-and-helpers)
- [Recipes](#recipes)
- [Accessibility](#accessibility)
- [Browser support](#browser-support)
- [Known limitations](#known-limitations)
- [Coming from wavesurfer.js](#coming-from-wavesurferjs)

## Quick start

```tsx
import { Waveform, useAudio, usePlayerState } from '@sillon/react'

export function Episode({ src }: { src: string }) {
  const { peaks, player } = useAudio(src)
  const { playing } = usePlayerState(player)

  return (
    <div>
      <button onClick={player.toggle}>{playing ? 'Pause' : 'Play'}</button>
      <Waveform.Root peaks={peaks} player={player} className="h-16">
        <Waveform.Shape>
          <Waveform.Track className="bg-stone-300" />
          <Waveform.Progress className="bg-stone-900" />
        </Waveform.Shape>
        <Waveform.Cursor className="w-0.5 bg-orange-600" />
        <Waveform.Time className="absolute top-full mt-1" />
      </Waveform.Root>
    </div>
  )
}
```

Every `Waveform.*` part, `Time` included, must be inside `Waveform.Root`. The classes are Tailwind. Nothing is visible without them: the parts ship with no colors, and `Waveform.Root` needs a height (`h-16` here). The bars are drawn once the whole file is decoded. Until then Root has `data-state="loading"`; see [Loading](#loading).

## Concepts

### Peaks and the player are separate

A waveform needs two things, and Root takes them as two props:

- **`peaks`**: the loudness of the audio over time, as a `Peaks` object from `@sillon/core`. `usePeaks(url)` streams them from an audio file or reads a ready-made `.peaks` file. `Peaks.from(values, …)` wraps values you already have.
- **`player`**: what plays the audio, a thin wrapper over an `<audio>` element (`usePlayer`, `createPlayer`). Optional: without one, the waveform is a picture, and seeking is off.

`useAudio(src)` gives you both for one file. Use the halves on their own to draw peaks from a `.peaks` file while the player streams the MP3, or to draw a waveform with no playback at all.

### How the bars are drawn

`Waveform.Shape` is a `div` clipped to an SVG path of rounded bars. `Waveform.Track` and `Waveform.Progress` are plain `div`s inside it, so whatever CSS paints on them (a color, a gradient, an image, a video) shows only through the bars. Bar geometry (`barWidth`, `barGap`, `barRadius`, `align`, …) is set with props on Root.

`Waveform.GL` draws the same bars with WebGL instead, colored by a GLSL function you write. See [GL](#waveformgl).

### The store

Root keeps its state in a `WaveformStore`: size, visible range, peaks, player, hover position and bar geometry. Each part subscribes to it and writes to its own DOM node. Playback, hovering, resizing and zooming don't re-render your components: React renders the parts once, and the playhead moves by CSS transforms.

Your own components re-render only when you ask them to. `usePlayerState` re-renders on play, pause and duration changes; `useGroups` and `useActive` re-render only when their result changes. For anything per-frame, read the store yourself (see [Custom parts](#custom-parts)).

### Inline styles

Parts set only the inline styles they need to work: positioning (`position`, `inset`, `top`/`bottom`/`left`), the transforms that move them, and a few others listed under each part (Shape's `clip-path`, Region's `width`, Hover's `opacity`, …). They never set colors, borders, cursors, or any size you'd choose. Your `style` prop is merged after the part's own, so it can override them, but an override of a property the part writes on every frame (like `transform` on Cursor) won't stick.

### Data attributes

Every part marks its element so you can select it in CSS: `data-sillon` on Root, `data-sillon-shape`, `data-sillon-track`, and so on (listed under each part). Root also has:

| Attribute | Values | Meaning |
|---|---|---|
| `data-state` | `loading`, `ready` | `ready` once there are bars to draw: when the peaks are complete, or with `progressive`, as soon as there are peaks. |

### Loading

By default nothing is drawn until the peaks are complete; then every bar appears in the same frame.

- `Waveform.Skeleton` shows a row of even, low bars while loading, and turns itself invisible (`opacity: 0`) when the real bars are ready. Add a CSS transition on its opacity to fade.
- `data-state` on Root lets you hide or fade anything else, for example `in-data-[state=loading]:opacity-0` on Shape in Tailwind, or `[data-state='loading'] [data-sillon-shape] { opacity: 0 }` in CSS.
- `progressive` draws bars as the file streams in, left to right. `reveal`, with `progressive`, sweeps them in and eases them to their final height when the file completes. Both are off by default.

## Components

All components are properties of `Waveform`, except `Visualizer`. Every part accepts the usual attributes of the element it renders (`className`, `style`, event handlers, `aria-*`), which are passed through.

### `Waveform.Root`

Holds the state, lays out the waveform and handles seeking. Renders one `div` with `position: relative`; give it a size, and every part inside fills it.

```tsx
<Waveform.Root peaks={peaks} player={player} barWidth={3} barGap={1} barRadius={1.5} className="h-24">
  …
</Waveform.Root>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `peaks` | `Peaks \| null` | required | The audio's peaks. `null` while there are none. |
| `player` | `Player \| null` | `null` | Plays the audio. Enables seeking, the playhead, and slider semantics. |
| `start` | `number` | `0` | Start of the visible range, in seconds. Applied on every render when given. |
| `end` | `number` | end of the audio | End of the visible range, in seconds. |
| `store` | `WaveformStore` | Root's own | A store from `useWaveformStore()`, to move the view imperatively with `store.setView()`. |
| `step` | `number` | `5` | Seconds moved by the arrow keys. |
| `interactive` | `boolean` | `true` with a player | Click and drag to seek, and keyboard control. Seeking needs a player. |
| `onDragSelect` | `(start: number, end: number) => void` | | Turns a drag into selecting a span instead of scrubbing. Called on every move with the span so far. A click still seeks. |
| `progressive` | `boolean` | `false` | Draw bars while the file streams in. |
| `reveal` | `boolean` | `false` | With `progressive`, sweep bars in from the left and ease them to their final height when the file completes. |
| `bars` | `number` | | A fixed number of bars. Bar width and gap then scale with Root's width, keeping the proportion of `barWidth` to `barGap`. See [Server rendering](#server-rendering-and-fixed-bar-counts). |
| `barWidth` | `number` | `2` | Bar width, in CSS pixels. |
| `barGap` | `number` | `1` | Space between bars, in CSS pixels. |
| `barRadius` | `number` | `0` | Corner radius of each bar, in CSS pixels. Capped at half the bar's width and height. |
| `minBarHeight` | `number` | `1` | Shortest bar, in CSS pixels, so silence still draws a line. |
| `align` | `'center' \| 'top' \| 'bottom'` | `'center'` | Where bars sit vertically. |
| `normalize` | `boolean` | `true` | Scale bars so the loudest one is full height. |
| `smoothing` | `number` | `0` | Average each bar with this many neighbors on each side, for a softer outline. |
| `contrast` | `number` | `1` | Raise bar heights to this power after normalizing. Above 1, quiet passages drop and loud ones stand out, which helps evenly mastered music. |
| `scale` | `number` | `1` | Multiply bar heights after normalizing and `contrast`. Bars stay within Root's height. |
| `maxPeak` | `number` | `0` (off) | With `normalize`, the value drawn at full height, instead of the file's loudest. Gives several waveforms the same scale. |
| `ref` | `Ref<HTMLDivElement>` | | The Root element. |

Element: `div` with `data-sillon` and `data-state`. Inline styles: `position: relative`, `user-select: none`, and `touch-action: pan-y` when interactive.

With a player and `interactive`, Root is a slider: see [Accessibility](#accessibility).

Pointer behavior: with a mouse or pen, pressing seeks and captures the pointer, so dragging scrubs even outside the element. On a touch screen, a tap seeks and a sideways drag scrubs, while a vertical swipe scrolls the page. With `onDragSelect`, moving more than 3 px after the press selects instead. Hovering sets the hover time that `Hover` and `Time kind="hover"` show.

Root leaves alone presses and keys that belong to something else: presses on buttons, links, form fields and other controls inside it (an avatar button in a `Marker`), keys typed while one of them has focus, and events that bubble from portals (a popover opened from a marker).

### `Waveform.Shape`

Clips its children to the bars. Put `Track` and `Progress` inside, and optionally `Region`s to tint just the bars of a span.

| Prop | Type | Description |
|---|---|---|
| `children` | `ReactNode` | Anything; it shows only through the bars. |

Element: `div` with `data-sillon-shape`. Inline styles: `position: absolute`, `inset: 0`, `clip-path: url(#…)`. It also contains a zero-size, `aria-hidden` SVG holding the clip path.

### `Waveform.Skeleton`

A placeholder while the peaks load: a row of even, low bars in the same geometry, styled like `Track`. Children show through its bars, as with `Shape`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `level` | `number` | `0.16` | Height of the placeholder bars, as a fraction of Root's height. |
| `children` | `ReactNode` | | Optional content clipped to the placeholder bars. |

Element: `div` with `data-sillon-skeleton` and `aria-hidden`. Inline styles: `position: absolute`, `inset: 0`, `pointer-events: none`, `clip-path`, and `opacity: 0` once the bars are ready (removed while loading). Add `transition: opacity` to fade between it and the bars.

```tsx
<Waveform.Skeleton className="bg-stone-300 opacity-50 transition-opacity" />
<Waveform.Shape className="transition-opacity in-data-[state=loading]:opacity-0">…</Waveform.Shape>
```

### `Waveform.Track`

The whole waveform; inside `Shape`, only the bars show.

Element: `div` with `data-sillon-track`. Inline styles: `position: absolute`, `inset: 0`, `pointer-events: none`.

### `Waveform.Progress`

The played part of the waveform, styled like `Track`. Your `className` and `style` go on an inner element that stays put while an outer, `overflow: hidden` element slides with the playhead. Gradients and patterns stay pinned to the waveform rather than stretching as it plays.

Element: an outer `div` with `data-sillon-progress` (`position: absolute`, `inset: 0`, `overflow: hidden`, `transform`), and the inner `div` that receives your props (`position: absolute`, `inset: 0`, `pointer-events: none`, `transform`). To select the styled element in CSS, use `[data-sillon-progress] > div`, or give it a class.

### `Waveform.Cursor`

A line at the playhead. Zero width, as tall as Root; give it a width and a background.

Element: `div` with `data-sillon-cursor`. Inline styles: `position: absolute`, `top: 0`, `bottom: 0`, `left: 0`, `pointer-events: none`, `transform`. To center a 2 px line on the playhead, add `margin-left: -1px`.

### `Waveform.Hover`

A line that follows the pointer, built like `Cursor`. Put `<Waveform.Time kind="hover" />` inside for a time readout.

Element: `div` with `data-sillon-hover`. Inline styles: as `Cursor`, plus `opacity: 0` when the pointer is elsewhere and `1` when it's over the waveform. Add a transition on opacity to fade.

### `Waveform.Region`

A span of time. Inside `Shape`, it tints only the bars; outside, it's a box the full height of Root. With `onChange`, it can be dragged and resized.

| Prop | Type | Default | Description |
|---|---|---|---|
| `start` | `number` | required | Start, in seconds. |
| `end` | `number` | required | End, in seconds. |
| `onChange` | `(start: number, end: number) => void` | | Makes the region editable. Called on every move with the new span; you store it and pass it back. |
| `minLength` | `number` | `0.1` | Shortest span a resize can make, in seconds. |
| `maxLength` | `number` | no limit | Longest span a resize can make, in seconds. |

Element: `div` with `data-sillon-region`. Inline styles: `position: absolute`, `top: 0`, `bottom: 0`, `left: 0`, `transform`, `width`, and `display: none` when the span is outside the visible range.

With `onChange`: dragging the region moves it (kept within the audio), dragging a `RegionHandle` resizes it, and a press that doesn't move more than 3 px seeks, as it would elsewhere on the waveform. Without `onChange`, presses pass through to Root. Call `event.preventDefault()` in your own `onPointerDown` to stop a region from starting a drag.

### `Waveform.RegionHandle`

A grip on one edge of an editable `Region`. Must be inside a `Region`. Zero width and as tall as the region; give it a width, and center it on the edge with a transform if you like.

| Prop | Type | Description |
|---|---|---|
| `side` | `'start' \| 'end'` | Which edge it drags. |

Element: `div` with `data-sillon-handle="start"` or `"end"`. Inline styles: `position: absolute`, `top: 0`, `bottom: 0`, and `left: 0` (start) or `right: 0` (end).

```tsx
<Waveform.Region {...loop} onChange={(start, end) => setLoop({ start, end })} className="bg-orange-600/10">
  <Waveform.RegionHandle side="start" className="w-2 -translate-x-1/2 cursor-ew-resize" />
  <Waveform.RegionHandle side="end" className="w-2 translate-x-1/2 cursor-ew-resize" />
</Waveform.Region>
```

### `Waveform.Time`

A time as text, kept current without re-rendering. It rewrites the text only when it changes.

| Prop | Type | Default | Description |
|---|---|---|---|
| `kind` | `'current' \| 'duration' \| 'remaining' \| 'hover'` | `'current'` | What to show. `remaining` is prefixed with `-`. `hover` is empty when the pointer isn't over the waveform. |
| `format` | `(seconds: number) => string` | `formatTime` | Formats the seconds. |

Element: `span` with `data-sillon-time` set to the kind. It sets no inline styles. `duration` uses the player's duration, or the end of the visible range when there is no player or its metadata hasn't loaded.

### `Waveform.Marker`

A moment in time: a zero-width box at `time`, as tall as Root. Put an avatar, a pin or a label inside, positioned against it.

| Prop | Type | Description |
|---|---|---|
| `time` | `number` | Seconds. |

Element: `div` with `data-sillon-marker`. Inline styles: `position: absolute`, `top: 0`, `bottom: 0`, `left: 0`, `transform`, and `display: none` when `time` is outside the visible range, or before the duration is known.

To keep many markers from overlapping, group them with [`useGroups`](#usegroups).

### `Waveform.GL`

Draws the bars with WebGL2 in place of `Shape`, coloring each pixel with a GLSL function you provide. Use it instead of `Shape`, not inside it.

```tsx
const afterglow = `vec4 shade(Bar b) {
  if (!b.played) return waveColor;
  float heat = exp(-b.age / 14.0);
  return vec4(mix(progressColor.rgb, vec3(1.0, 0.4, 0.15), heat), 1.0);
}`

<Waveform.Root peaks={peaks} player={player} className="h-24 [--wave-color:#d6d3d1] [--wave-progress:#1c1917]">
  <Waveform.GL fragment={afterglow} />
</Waveform.Root>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `fragment` | `string` | played bars `--wave-progress`, others `--wave-color` | GLSL source defining `vec4 shade(Bar b)`, which returns the color of one pixel of one bar (straight, not premultiplied, alpha). |
| `glow` | `number` | `0` | Strength of a halo around played bars, brightest near the playhead. |
| `swell` | `number` | `0` | How much bars near the pointer grow, as a fraction of their height. |
| `swellRadius` | `number` | `56` | Width of the swell, in CSS pixels. |

Element: `canvas` with `data-sillon-gl`. Inline styles: `position: absolute`, `inset: 0`, `width: 100%`, `height: 100%`, `pointer-events: none`. The canvas is drawn at up to 2× device pixel ratio, and only when something changes: a frame while playing, on hover, or on new data.

Colors come from CSS custom properties on the canvas or any ancestor. They're read when the canvas redraws, at most every half second, and right away when GL's `className`, `style`, `glow`, `swell` or `swellRadius` changes. A change elsewhere, like a theme switch on `<html>`, shows on the next redraw (the next frame while playing, or the next hover):

| Property | GLSL uniform | Default |
|---|---|---|
| `--wave-color` | `waveColor` | `rgb(153 153 153)` |
| `--wave-progress` | `progressColor` | `rgb(26 26 26)` |
| `--wave-glow` | `glowColor` | the value of `--wave-progress` |

Any CSS color a canvas accepts works, including `var(…)` references to your theme.

What `shade` receives for each pixel:

```glsl
struct Bar {
  float index;  // which bar, counting from the left
  vec2 uv;      // inside the bar: x 0–1 across it, y 0–1 from its foot to its tip
  vec2 pos;     // inside the waveform: x 0–1 left to right, y 0–1 bottom to top
  float amp;    // the bar's height, 0–1
  bool played;  // this pixel is behind the playhead
  float age;    // seconds since the playhead passed the bar's center; negative ahead of it
};
```

Also in scope:

| Uniform | Type | Meaning |
|---|---|---|
| `time` | `float` | The audio's current time, in seconds. |
| `level` | `float` | Loudness at the playhead, 0–1, eased; 0 while paused. |
| `size` | `vec2` | The waveform's size, in CSS pixels. |
| `waveColor`, `progressColor`, `glowColor` | `vec4` | The colors above, 0–1 RGBA. |
| `progress` | `float` | x of the playhead, in CSS pixels. |
| `count` | `float` | Number of bars. |

The shader also declares the uniforms `bars`, `dpr`, `pitch`, `barW`, `radius`, `minH`, `align`, `scale`, `secPerPx`, `hoverX`, `hoverAmt`, `swell`, `swellR`, `glow` and the functions `amp`, `height`, `centerY` and `bar`; don't reuse those names. A shader that fails to compile logs the compiler's message with `console.error`, and the canvas stays empty. Without WebGL2, the canvas stays empty too.

Like `Shape`, GL draws nothing until the bars are ready, and it draws the same bars, `smoothing` and `scale` included. It doesn't do the `reveal` sweep. If the browser drops the WebGL context (it does past about 16 on a page, or after a GPU reset), GL draws again once the context is restored.

### `Visualizer`

A live spectrum of what's playing, drawn as rays around a circle. Low frequencies are at the lower left and high ones at the upper right, mirrored, so the outline closes up. It is a standalone component, not a `Waveform` part.

```tsx
import { Visualizer, usePlayer, usePlayerState } from '@sillon/react'

function Spectrum() {
  const player = usePlayer('/song.mp3')
  const { playing } = usePlayerState(player)
  return (
    <>
      <button onClick={player.toggle}>{playing ? 'Pause' : 'Play'}</button>
      <Visualizer player={player} className="size-64 text-stone-900" />
    </>
  )
}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `player` | `Player \| null` | required | The player to listen to. |
| `rays` | `number` | `96` | Number of rays around the circle. |
| `innerRadius` | `number` | `0.34` | Where rays start, as a fraction of the outer radius. |
| `rayWidth` | `number` | `1.4` | Ray thickness, in CSS pixels. |
| `idle` | `number` | `0.1` | Ray length in silence, as a fraction of the space between the inner and outer radius. |
| `smoothing` | `number` | `2` | Average each ray with this many neighbors on each side. |
| `minHz` | `number` | `50` | Lowest frequency shown, in Hz. |
| `maxHz` | `number` | `10000` | Highest frequency shown, in Hz. |
| `autoLevel` | `boolean` | `true` | Fit the display to the music: the range starts at 200 Hz–2 kHz and widens towards `minHz`–`maxHz` as the audio reaches them, and each band is measured against its own recent peak, so quiet bands still move. Off shows `minHz`–`maxHz` at true relative loudness. |
| `fragment` | `string` | | GLSL source defining `vec4 shade(Ray r)`. With it, rays are drawn with WebGL2 and your shader; without it, on a 2D canvas. |
| `ref` | `Ref<HTMLCanvasElement>` | | The canvas. |

Element: `canvas` with `data-sillon-visualizer`. Inline styles: `display: block`, `width: 100%`, `height: 100%`; size it with its parent or your own styles. The color is the canvas's CSS `color`. It draws only while playing, and while settling back to rest after a pause.

On the first `play`, the Visualizer routes the player's element through a Web Audio `AnalyserNode`, in one `AudioContext` shared by every Visualizer on the page. This is permanent for that element: the browser allows one such connection per element, so all Visualizers of one player share it. Because the audio then plays through Web Audio, audio from another origin must be served with CORS headers and loaded with `crossOrigin` set; otherwise the browser silences it. See [Known limitations](#known-limitations).

What `shade` receives for each pixel:

```glsl
struct Ray {
  float index;   // the nearest ray, counting clockwise from 12 o'clock
  float value;   // its level, 0–1
  float contour; // the level at this pixel's exact angle, between rays: a continuous outline
  float angle;   // this pixel's angle, 0–1 clockwise from 12 o'clock
  float radius;  // this pixel's distance from the center, 0–1 of the outer radius
  float inner;   // where rays start, 0–1
  float reach;   // where the nearest ray ends, 0–1
  float across;  // distance from the nearest ray's center line, CSS pixels
};
```

Also in scope: `level` (average of all rays, 0–1), `time` (the audio's current time, seconds), `color` (the canvas's CSS color, `vec4`), `rayWidth`, `size` (CSS pixels), `count`, `inner`, `idle`, `dpr`, and the function `rayAt(float i)`. `visualizerRays` is the 2D drawing's look written as a fragment, to start from:

```tsx
import { Visualizer, visualizerRays } from '@sillon/react'

<Visualizer player={player} fragment={visualizerRays} />
```

## Hooks

### `useAudio`

```ts
function useAudio(src: string | null | undefined, options?: StreamOptions): UseAudio

interface UseAudio {
  peaks: Peaks | null
  firstMs: number | null
  stats: StreamStats | null
  error: Error | null
  player: Player
}
```

Peaks and a player for one audio file: `usePeaks(src, options)` and `usePlayer(src)` together. `src` must be audio the browser can play; for a `.peaks` file, use the two hooks separately.

### `usePeaks`

```ts
function usePeaks(url: string | null | undefined, options?: StreamOptions): UsePeaks

interface UsePeaks {
  /** Null on the first render and without a URL; then a Peaks that fills in as the file streams. */
  peaks: Peaks | null
  /** Milliseconds from the request until the first peaks arrived. */
  firstMs: number | null
  /** How the file was read and how long it took, once complete. */
  stats: StreamStats | null
  /** Set if loading failed. */
  error: Error | null
}
```

Streams peaks for an audio file, or reads a `.peaks` file, with `streamPeaks` from `@sillon/core`. `peaks` is set right away and fills in as data arrives. Root redraws on its own as it fills, so the hook doesn't re-render for each chunk: only when the first peaks arrive, when loading finishes, and on an error.

Streams are shared by URL: two waveforms of the same file load it once. `options` (see `StreamOptions` in [`@sillon/core`](../core/README.md)) are read when a URL is first requested, and later callers of the same URL share that stream. When the last component using a URL unmounts, an unfinished stream is canceled after one second; finished ones stay cached for the page's lifetime.

### `usePlayer`

```ts
function usePlayer(src?: string): Player
```

A [`Player`](#player) for this component, pointed at `src`. Changing `src` loads the new file, and no `src` unloads it. On unmount, the player pauses and lets go of the file. On the server it returns a stand-in that is paused at 0 and does nothing, so components that use it can be server-rendered; the browser renders with a real player from the start.

### `usePlayerState`

```ts
function usePlayerState(player: Player | null | undefined): { playing: boolean; duration: number; error: MediaError | null }
```

Whether the player is playing, its duration in seconds (0 until known), and the element's `MediaError` if the file couldn't be loaded or played. Re-renders only when one of them changes, never per frame. For the current time, use `Waveform.Time` or `player.onTime`.

### `useWaveformStore`

```ts
function useWaveformStore(): WaveformStore
```

Creates a store to pass to `Waveform.Root`'s `store` prop, so code outside Root can control the view (`store.setView`) or read its state.

### `useWaveform`

```ts
function useWaveform(): WaveformStore
```

The store of the nearest `Waveform.Root`, for building your own parts. Throws outside a Root.

### `useGroups`

```ts
function useGroups<T extends { time: number }>(items: readonly T[], gap?: number): Group<T>[]

interface Group<T> {
  key: string   // stable while the group keeps the same first item and size
  time: number  // the first item's time: place the group's marker here
  end: number   // the last item's time
  items: T[]    // sorted by time
}
```

Groups timed items (comments, chapters, markers) that would sit closer than `gap` CSS pixels apart (default `24`) at the current width and zoom. Zoom in and groups split apart. Re-renders only when the grouping changes, not on every zoom frame. Until the duration is known, every item is its own group. Must be inside `Waveform.Root`. Pass a stable `items` array (state, or memoized): a new array regroups.

### `useActive`

```ts
function useActive<T extends { time: number; end?: number }>(items: readonly T[], hold?: number): T[]
```

The items under the playhead, sorted by time: what to show "now", like comments appearing as a track plays, or the chapter that's playing. An item with an `end` is active from `time` until `end`; one without, for `hold` seconds (default `3`) after its time. Re-renders only when that set changes. Must be inside `Waveform.Root`.

```tsx
const chapters = [{ time: 0, end: 95, title: 'Intro' }, { time: 95, end: 610, title: 'Interview' }]
const [chapter] = useActive(chapters)
```

### `useZoom`

```ts
function useZoom(store: WaveformStore, options?: ZoomOptions): Zoom

interface ZoomOptions {
  min?: number                 // shortest view, seconds; default 1
  max?: number                 // longest view, seconds; default the whole file
  follow?: boolean | 'center'  // keep the playhead in view while playing; default off
  drag?: boolean               // pan by dragging; default off
}

interface Zoom {
  ref: (el: HTMLElement | null) => void  // Root's ref, or a wrapper's
  zoomTo(seconds: number, around?: number): void
  zoomBy(factor: number, around?: number): void  // 2 shows twice as much, 0.5 half
  panBy(seconds: number): void
  reset(): void                                  // the whole file
}
```

Zoom and pan gestures for a Root with your own store. Ctrl or ⌘ with the scroll wheel, and trackpad pinches, zoom around the pointer. A sideways scroll, or Shift with the wheel, pans. A two-finger pinch on a touch screen zooms around the fingers. A plain vertical scroll is left to the page. Every step calls `store.setView()`, so gestures don't re-render React. Views stay within the audio and within `min` and `max`, and nothing happens until the duration is known.

`follow: true` turns the page when the playhead reaches the edge of the view; `'center'` keeps the playhead in the middle. `drag` pans by dragging, which competes with seeking, so use it with `interactive={false}`; on touch screens it also needs `touch-action: pan-y` or `none` on the element. Pinching isn't discoverable, so add visible controls too, like buttons that call `zoomBy`. See [Zooming long files](#zooming-long-files).

### `useTicks`

```ts
function useTicks(options?: TicksOptions): Tick[]

interface TicksOptions {
  minGap?: number      // fewest CSS pixels between ticks; default 64
  majorEvery?: number  // every this many ticks is major; default chosen from the interval
  format?: (seconds: number, step: number) => string  // default formatTime, tenths below a second
}

interface Tick { time: number; major: boolean; label: string }
```

Times for a timeline under the waveform, at a round interval (0.1 s up to whole hours) that keeps ticks at least `minGap` pixels apart at the current zoom. Majors fall on a longer interval: every 5 s when ticks are a second apart, every minute when they're 10 s apart. Place each tick with `Waveform.Marker`, which moves it during zooming and hides it outside the view; the hook re-renders only when the interval changes or the view moves to a new stretch of ticks. Empty until the duration is known. Must be inside `Waveform.Root`.

```tsx
function Timeline() {
  return useTicks().map((tick) => (
    <Waveform.Marker key={tick.time} time={tick.time}>
      <span className="absolute top-full h-1.5 w-px bg-stone-400" />
      {tick.major && <span className="absolute top-full mt-2 -translate-x-1/2 text-xs">{tick.label}</span>}
    </Waveform.Marker>
  ))
}
```

### `useRecorder`

```ts
function useRecorder(options?: RecorderOptions): Recorder

interface RecorderOptions {
  bucketSize?: number                 // samples per peak; default 256
  audio?: MediaTrackConstraints | true // getUserMedia's audio constraints; default true
  recorder?: MediaRecorderOptions     // mimeType, audioBitsPerSecond; default the browser's choice
}

interface Recorder {
  peaks: Peaks | null   // fills in while recording; complete once stopped
  state: 'idle' | 'starting' | 'recording' | 'paused' | 'stopped'
  blob: Blob | null     // the recorded audio, once stopped
  url: string | null    // an object URL for blob, to play with usePlayer(url)
  error: Error | null   // the microphone was refused or missing, or recording failed
  start(): Promise<void>
  stop(): Promise<Blob | null>
  pause(): void
  resume(): void
}
```

Records from the microphone and draws the waveform as it records. `peaks` grows as audio arrives, so a `Waveform.Root` with `progressive` shows the recording as it's made, and every other part works on it as on a file: markers, regions, `Waveform.GL` effects. When you stop, the microphone is released, `peaks` is complete, and `blob` and `url` hold the audio. To skip decoding next time, save `peaks.encode()` with the upload and load it as a `.peaks` file.

Call `start()` from a click or key press: browsers start audio only after a user gesture, and ask for the microphone the first time. A refused or missing microphone sets `error` (a `DOMException` named `NotAllowedError` or `NotFoundError`) and goes back to `idle`. Starting a new recording revokes the last `url`; unmounting stops a recording and releases everything.

The peaks come from an `AudioWorklet`, which keeps every sample even in a background tab. The audio comes from a `MediaRecorder`, in the browser's format unless you pass a `mimeType`: WebM in Chrome, Ogg in Firefox (both Opus), MP4 in Safari.

See [Recording](#recording) for a voice note with playback, and a view that scrolls while recording.

## Player

```ts
function createPlayer(source?: string | HTMLMediaElement): Player

interface Player {
  readonly audio: HTMLMediaElement
  readonly time: number       // seconds
  readonly duration: number   // seconds, 0 until known
  readonly playing: boolean
  readonly error: MediaError | null
  readonly loop: Span | null
  play(): Promise<void>
  pause(): void
  toggle(): void
  stop(): void
  seek(seconds: number): void
  skip(seconds: number): void
  setLoop(span: Span | null): void
  onTime(listener: (seconds: number) => void): () => void
  subscribe(listener: () => void): () => void
  destroy(): void
}

interface Span { start: number; end: number }
```

A small wrapper over a media element. Given a URL, or nothing, it creates an `<audio>` element with `preload="metadata"`, so only the file's header loads before playback. Given an element, like a `<video>` on your page, it plays through that one and leaves its attributes alone. `usePlayer` makes one per component; `createPlayer` makes one anywhere, for a player shared across components, created outside React, or driving your own element:

```tsx
function Video({ src }: { src: string }) {
  const [player, setPlayer] = useState<Player | null>(null)
  const { peaks } = usePeaks(src)
  // Stable, so React attaches it once per element, not on every render.
  const attach = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return
    const p = createPlayer(el)
    setPlayer(p)
    return () => { p.destroy(); setPlayer(null) }
  }, [])
  return (
    <>
      <video src={src} ref={attach} />
      <Waveform.Root peaks={peaks} player={player} className="h-16">…</Waveform.Root>
    </>
  )
}
```

- `onTime` calls its listener on every animation frame while playing, and on every seek. Returns an unsubscribe function.
- `subscribe` calls its listener when playback starts, pauses or ends, when the duration becomes known, and when the loop changes.
- `seek` notifies `onTime` listeners right away, without waiting for the browser to finish seeking. `skip(seconds)` moves by that much, within the audio; `stop()` pauses and goes back to 0.
- `toggle()` ignores a play the browser refuses (before any user gesture, for example); `play()` returns the promise, so you can handle it.
- `error` is the element's `MediaError` once loading or playback fails; `subscribe` listeners hear about it.
- `destroy()` detaches the player from its element and drops every listener. For players from `createPlayer`; `usePlayer` cleans up after itself.
- `setLoop({ start, end })` repeats a span: when playback reaches `end` from inside the span, it jumps back to `start`. Seeking outside the span plays on normally until playback enters it again. It keeps working in background tabs, where animation frames stop. `setLoop(null)` stops looping. A span whose `end` isn't after its `start` counts as `null`.
- `audio` is the element itself, for anything else: `volume`, `muted`, `playbackRate`, `crossOrigin`, media session.

## Store and helpers

### `WaveformStore`

The state behind a Root. You get one from `useWaveformStore()` (to pass in) or `useWaveform()` (inside a Root).

| Member | Description |
|---|---|
| `state: WaveformState` | Current state. Read it freely; change it only through the methods below. |
| `setView(start, end)` | Shows `start`–`end` seconds. `end: null` follows the end of the audio. Doesn't re-render React, so it's cheap enough to call on every frame of a gesture or animation. |
| `subscribe(listener)` | Calls `listener(change)` on every change, where `change` is `'layout'` (size, view, geometry, player), `'data'` (new peaks) or `'hover'`. Returns an unsubscribe function. Playback time isn't a store change: use `player.onTime`. |
| `update(patch)` | Applies a partial `WaveformState` and notifies. Root calls it with its props on every render, so values you set here that Root also sets from props are overwritten on the next render. |
| `setHover(seconds \| null)` | Sets the hover time. |

`WaveformState` holds the bar geometry (`barWidth`, `barGap`, `barRadius`, `minBarHeight`, `align`, `normalize`, `smoothing`, `contrast`; with `bars`, `barWidth` and `barGap` are the fitted values), plus:

| Field | Type | Meaning |
|---|---|---|
| `peaks` | `Peaks \| null` | From the `peaks` prop. |
| `player` | `Player \| null` | From the `player` prop. |
| `width`, `height` | `number` | Root's size, in CSS pixels. |
| `start`, `end` | `number` | Visible range, in seconds. |
| `hover` | `number \| null` | Seconds under the pointer, or `null`. |
| `gain` | `number` | Multiplier that normalizes bar heights. |
| `progressive`, `reveal` | `boolean` | From the props. |
| `revealed` | `number` | How far the `reveal` sweep has got, in seconds; `Infinity` when not sweeping. |

### Functions

| Function | Description |
|---|---|
| `formatTime(seconds)` | `m:ss`, or `h:mm:ss` from an hour. Rounds down; negative values read as `0:00`. |
| `timeToX(state, seconds)` | Seconds to x, in CSS pixels from Root's left edge, for the current view. Takes any object with `start`, `end` and `width`. |
| `xToTime(state, x)` | The inverse: x in CSS pixels from Root's left edge to seconds. Not clamped to the view. |
| `fillBars(state, count, out?)` | One value per bar for the view, with `smoothing` applied: what Shape and GL draw. |
| `fitBars(width, bars, barWidth, barGap)` | The bar width and gap that fit exactly `bars` bars into `width`, keeping the proportion of `barWidth` to `barGap`. Returns them unchanged if `bars` or `width` is 0. |
| `barsPath(state)` | SVG path data for every bar in the view, as `Shape` draws it. Empty until `isReady(state)`. |
| `isReady(state)` | True once there are bars to draw: all of them, or with `progressive`, any. |
| `visualizerRays` | A Visualizer `fragment` that draws what the 2D canvas draws. |

## Recipes

### Regions and looping

A loop the listener can drag, resize, or redraw by dragging across the waveform:

```tsx
import { useEffect, useState } from 'react'
import { Waveform, useAudio } from '@sillon/react'

export function Looper({ src }: { src: string }) {
  const { peaks, player } = useAudio(src)
  const [loop, setLoop] = useState({ start: 16, end: 31 })
  useEffect(() => player.setLoop(loop), [player, loop])

  return (
    <Waveform.Root peaks={peaks} player={player} onDragSelect={(start, end) => setLoop({ start, end })} className="h-20">
      <Waveform.Shape>
        <Waveform.Track className="bg-stone-300" />
        <Waveform.Progress className="bg-stone-900" />
        {/* Inside Shape: tints only the bars */}
        <Waveform.Region {...loop} className="bg-orange-600" />
      </Waveform.Shape>
      {/* Outside Shape: a box to grab */}
      <Waveform.Region {...loop} onChange={(start, end) => setLoop({ start, end })} className="cursor-grab bg-orange-600/10">
        <Waveform.RegionHandle side="start" className="w-2 -translate-x-1/2 cursor-ew-resize" />
        <Waveform.RegionHandle side="end" className="w-2 translate-x-1/2 cursor-ew-resize" />
      </Waveform.Region>
    </Waveform.Root>
  )
}
```

The loop is the player's (`setLoop`), not the region's: a region only draws a span, so it also works for selections, chapters or edits that don't loop.

### Comments and markers

`useGroups` decides which comments share a spot at the current zoom; how a group looks and opens is up to you. Root ignores events that bubble up from portals, so a popover rendered in one doesn't seek.

```tsx
import { Waveform, useActive, useGroups, type Player } from '@sillon/react'

type Comment = { id: string; time: number; text: string }

function Comments({ comments, player }: { comments: Comment[]; player: Player }) {
  const groups = useGroups(comments, 28)
  const now = useActive(comments, 3).at(-1)

  return groups.map((group) => (
    <Waveform.Marker key={group.key} time={group.time}>
      <button
        className="absolute top-full left-0 mt-2 -translate-x-1/2"
        onClick={() => { player.seek(group.time); player.play() }}
      >
        {group.items.length}
      </button>
      {now && group.items.includes(now) && (
        <p className="absolute bottom-full left-0 mb-2 -translate-x-1/2 whitespace-nowrap">{now.text}</p>
      )}
    </Waveform.Marker>
  ))
}

// Inside a Root:
<Waveform.Root peaks={peaks} player={player} className="h-20">
  <Waveform.Shape>…</Waveform.Shape>
  <Comments comments={comments} player={player} />
</Waveform.Root>
```

Buttons inside Root sit inside its slider; see [Known limitations](#known-limitations).

### Zooming long files

Pair a store with peaks made ahead of time. `useZoom` adds the gestures; buttons make zooming discoverable.

```tsx
import { Waveform, usePeaks, usePlayer, useWaveformStore, useZoom } from '@sillon/react'

export function Zoomable() {
  const { peaks } = usePeaks('/hour.peaks')
  const player = usePlayer('/hour.mp3')
  const store = useWaveformStore()
  const zoom = useZoom(store, { min: 5, follow: true })

  return (
    <div>
      <button onClick={() => zoom.zoomBy(0.5)}>Zoom in</button>
      <button onClick={() => zoom.zoomBy(2)}>Zoom out</button>
      <button onClick={() => store.setView(720, 780)}>12:00–13:00</button>
      <Waveform.Root ref={zoom.ref} store={store} peaks={peaks} player={player} className="h-24">
        <Waveform.Shape>
          <Waveform.Track className="bg-stone-300" />
          <Waveform.Progress className="bg-stone-900" />
        </Waveform.Shape>
      </Waveform.Root>
    </div>
  )
}
```

`store.setView(0, null)` (or `zoom.reset()`) zooms back out to the whole file. Don't also pass `start` or `end` props when you drive the view with `setView`: Root applies props on every render.

How far you can zoom depends on the peaks' resolution: a `.peaks` file at 512 samples per value has a value every 11.6 ms at 44.1 kHz.

### Recording

A voice note: record, watch the last 10 seconds scroll by, then play it back. While recording, the view keeps up with the end; once stopped, it shows the whole recording.

```tsx
import { useEffect } from 'react'
import { Waveform, usePlayer, usePlayerState, useRecorder, useWaveformStore } from '@sillon/react'

export function VoiceNote() {
  const rec = useRecorder()
  const recording = rec.state === 'recording'
  const player = usePlayer(rec.url ?? undefined)
  const { playing } = usePlayerState(player)

  const store = useWaveformStore()
  useEffect(() => rec.peaks?.subscribe(() => {
    const end = rec.peaks!.duration
    if (rec.peaks!.complete) store.setView(0, null)
    else store.setView(Math.max(0, end - 10), Math.max(10, end))
  }), [rec.peaks, store])

  return (
    <>
      <button onClick={recording ? rec.stop : rec.start}>{recording ? 'Stop' : 'Record'}</button>
      <button onClick={player.toggle} disabled={!rec.url}>{playing ? 'Pause' : 'Play'}</button>
      <Waveform.Root store={store} peaks={rec.peaks} player={rec.url ? player : null} progressive className="h-28">
        <Waveform.Shape>
          <Waveform.Track className={recording ? 'bg-red-600' : 'bg-stone-300'} />
          <Waveform.Progress className="bg-stone-900" />
        </Waveform.Shape>
      </Waveform.Root>
    </>
  )
}
```

### Peaks made ahead of time

Decoding a long file in the browser means downloading all of it. For long audio, make a `.peaks` file once, serve it next to the audio, and load each separately:

```tsx
const { peaks } = usePeaks('/episode.peaks') // read as is, nothing decoded
const player = usePlayer('/episode.mp3')     // loads only to play

<Waveform.Root peaks={peaks} player={player}>…</Waveform.Root>
```

URLs ending in `.peaks` (before any `?` or `#`) are read as `.peaks` files. To make them, see [`.peaks` files](../core/README.md#peaks-files) in `@sillon/core`: a script for ffmpeg, or `Peaks.encode()`.

### Server rendering and fixed bar counts

The parts render on the server as empty elements; the bars are drawn in the browser, after layout. `usePlayer` and `useAudio` are safe to render on the server: the player is a stand-in there, and the real one is created in the browser.

To show bars before JavaScript runs, draw them yourself on the server with `barsPath`, and give Root the same `bars` count. With a fixed count, bar width and gap scale with the width, so an SVG drawn at one width and stretched with `preserveAspectRatio="none"` matches what the client draws at any other:

```ts
import { Peaks } from '@sillon/core'
import { WaveformStore, barsPath, fitBars, type WaveformState } from '@sillon/react'

const peaks = Peaks.decode(peaksFileBytes) // an ArrayBuffer
const width = 1280, height = 96, bars = 200
const state: WaveformState = {
  ...new WaveformStore().state, // the defaults
  ...fitBars(width, bars, 4, 2),
  barRadius: 1,
  peaks, width, height,
  end: peaks.duration,
  gain: peaks.max ? 1 / peaks.max : 1, // what normalize does
}
const d = barsPath(state)
// <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><path d={d} /></svg>
// and on the client: <Waveform.Root peaks={peaks} bars={200} barWidth={4} barGap={2} barRadius={1}>
```

Rounded corners stretch with the SVG, so they only match exactly at the width they were drawn at.

### Custom parts

Your own parts read the store, and write to the DOM without re-rendering:

```tsx
import { useEffect, useRef } from 'react'
import { useWaveform, type Player } from '@sillon/react'

/** How much has played, as a percentage. */
function PercentPlayed({ player }: { player: Player }) {
  const store = useWaveform()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => player.onTime((t) => {
    const { end } = store.state
    ref.current!.textContent = end ? `${Math.round((t / end) * 100)}%` : ''
  }), [player, store])
  return <span ref={ref} />
}
```

`store.subscribe` tells you about everything else: size, view and geometry (`'layout'`), new peaks (`'data'`), and the pointer (`'hover'`). `timeToX(store.state, seconds)` places things in pixels.

## Accessibility

With a player and `interactive` on (the default with a player), Root has `role="slider"`, `tabIndex={0}`, `aria-label="Seek"`, `aria-valuemin="0"`, and keeps `aria-valuenow` and `aria-valuemax` (whole seconds of the whole audio, whatever the zoom) and `aria-valuetext` (for example "1:05 of 3:20") current. Pass your own `aria-label` to name it, for example "Seek in Episode 12".

| Key | Action |
|---|---|
| ← or ↓ | Back `step` seconds (default 5) |
| → or ↑ | Forward `step` seconds |
| Page Down / Page Up | Back / forward 6 × `step` |
| Home / End | Start / end of the audio |
| Space or K | Play or pause |

Your own `onKeyDown` runs first; call `event.preventDefault()` to take over a key. Keys typed while a control inside Root has focus are left to that control. Without a player, or with `interactive={false}`, Root has no role and isn't focusable. Decorative parts (Shape's SVG, Skeleton) are `aria-hidden`. `Visualizer` is a plain canvas with no role; label it, or hide it with `aria-hidden`, as suits your page.

## Browser support

- **Parts**: CSS `clip-path` with an SVG `<clipPath>`, `ResizeObserver`, and pointer events, all available in current browsers.
- **Peaks** (`usePeaks`, `useAudio`): files up to 8 MB are decoded whole with `decodeAudioData`. Larger MP3s are streamed and decoded in a Web Worker with WebCodecs `AudioDecoder`, where the browser supports it for MP3. Elsewhere, and for other formats, the whole file is downloaded and decoded with `decodeAudioData`, which every current browser supports, but which holds the decoded audio in memory while it runs. `.peaks` files need neither.
- **`Waveform.GL`** and **`Visualizer` with `fragment`**: WebGL2. Without it, the canvas stays empty. `Visualizer` without `fragment` uses a 2D canvas.
- **`Visualizer`**: the Web Audio API (`AudioContext`, `AnalyserNode`).

## Known limitations

- **Controls inside the slider.** Root is a `role="slider"`, and markers, comments and region handles are rendered inside it. Screen readers expect a slider to have no interactive children, so buttons in markers are harder to reach. Keyboard users can still Tab to them.
- **No keyboard editing of regions.** Regions and their handles respond to the pointer only.
- **Only MP3 streams.** Other formats work, but are decoded whole.
- **One channel.** Stereo files are drawn as one waveform, the louder channel at each moment; there's no split view of left and right.
- **`Waveform.GL` has no `reveal` sweep.**
- **Visualizer and cross-origin audio.** Once routed through Web Audio, audio from another origin plays silent unless it's served with CORS headers and the element has `crossOrigin` set before its source loads. `usePlayer(src)` sets the source itself, so for cross-origin audio, set both yourself:

  ```tsx
  const player = usePlayer()
  useEffect(() => {
    player.audio.crossOrigin = 'anonymous'
    player.audio.src = src
  }, [player, src])
  ```
- **Recordings and strict CSPs.** `useRecorder` loads its `AudioWorklet` from a `blob:` URL, so a Content Security Policy must allow `blob:` in `script-src`.
- **Recorded WebM has no duration in Chrome.** The element reports `Infinity` until it has read the whole file; `player.duration` reads 0, and Root uses the peaks' duration instead.
- **`StreamOptions` per URL.** `usePeaks` shares one stream per URL, with the options of whichever component asked first.

## Coming from wavesurfer.js

The common wavesurfer.js options and methods, and where they are in sillon. Looks are CSS on the parts rather than options.

| wavesurfer.js | sillon |
|---|---|
| `container`, `height`, `width` | Render `Waveform.Root` where it goes, and size it with CSS |
| `url`, `load(url)` | `useAudio(url)`, or `usePeaks(url)` and `usePlayer(url)` |
| `peaks` + `duration` | `Peaks.from(peaks, { duration })` (one array, or one per channel; signs are ignored) |
| `waveColor`, `progressColor` | CSS on `Waveform.Track` and `Waveform.Progress` (any background: colors, gradients, images) |
| `cursorColor`, `cursorWidth` | CSS on `Waveform.Cursor` |
| `barWidth`, `barGap`, `barRadius`, `barMinHeight`, `barAlign` | `barWidth`, `barGap`, `barRadius`, `minBarHeight`, `align` on Root |
| `barHeight` | `scale` |
| `normalize`, `maxPeak` | `normalize`, `maxPeak` |
| `interact` | `interactive` |
| `dragToSeek` | Dragging scrubs by default; `onDragSelect` turns a drag into a selection |
| `minPxPerSec`, `zoom()`, `setScroll()`, `autoScroll`, `autoCenter` | `store.setView(start, end)`; `useZoom(store, { follow })` for gestures and following |
| `media` (your own element) | `createPlayer(element)` |
| `fetchParams` | `usePeaks(url, { fetch: { headers, credentials } })` |
| `renderFunction` | `Waveform.GL` with a `fragment`, or your own part with `useWaveform()` and `barsPath()` |
| `play()`, `pause()`, `playPause()`, `stop()` | `player.play()`, `pause()`, `toggle()`, `stop()` |
| `seekTo(fraction)`, `setTime(s)`, `skip(s)` | `player.seek(seconds)`, `player.skip(seconds)` |
| `getCurrentTime()`, `getDuration()`, `isPlaying()` | `player.time`, `player.duration`, `player.playing` (or `usePlayerState`) |
| `setVolume()`, `setMuted()`, `setPlaybackRate()` | `player.audio.volume`, `.muted`, `.playbackRate` |
| `exportPeaks()` | `peaks.toArray()`, or `peaks.encode()` for a `.peaks` file |
| `destroy()` | Unmount (or `player.destroy()` for a `createPlayer` player) |
| Events `ready`, `decode` | `usePeaks().stats`, or `data-state="ready"` on Root |
| Events `timeupdate`, `audioprocess`, `seeking` | `player.onTime(listener)` |
| Events `play`, `pause`, `finish` | `player.subscribe(listener)`, `usePlayerState` |
| Event `error` | `usePeaks().error`, and `player.error` / `usePlayerState().error` |
| Regions plugin | `Waveform.Region`, `Waveform.RegionHandle`, `onDragSelect`, `player.setLoop`; `useActive` for what's playing |
| Hover plugin | `Waveform.Hover` with `<Waveform.Time kind="hover" />` |
| Timeline plugin | `useTicks` with `Waveform.Marker` |
| Zoom plugin | `useZoom` |
| Record plugin (`scrollingWaveform`) | `useRecorder`, with `store.setView` to scroll; see [Recording](#recording) |
| Minimap plugin | A second Root over the whole file, with a `Region` for the zoomed view |

Not in sillon: split stereo channels, the Spectrogram and Envelope plugins, `exportImage`, and `getDecodedData` (sillon doesn't keep the decoded audio).

