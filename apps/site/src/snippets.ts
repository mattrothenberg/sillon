import type { Geometry } from '@sillon/react'

// Every snippet the page shows. Highlighted at build time. The demos style their parts with the
// same class strings the snippets print, imported from here, so the code can't drift from the page.

export const USAGE_JSX = `import { Waveform, useAudio } from '@sillon/react'

export function Episode({ src }) {
  const { peaks, player } = useAudio(src)

  return (
    <Waveform.Root peaks={peaks} player={player} barWidth={2} barGap={1}>
      {/* Placeholder bars while the file loads, fading into the real ones */}
      <Waveform.Skeleton className="bg-stone-300 opacity-50 transition-opacity" />
      <Waveform.Shape className="transition-opacity in-data-[state=loading]:opacity-0">
        <Waveform.Track className="bg-stone-300" />
        <Waveform.Progress className="bg-stone-950" />
      </Waveform.Shape>
      <Waveform.Cursor className="w-0.5 bg-orange-600" />
      <Waveform.Time />
    </Waveform.Root>
  )
}`

/** The Visualizer demo's rays: a 2D canvas draws in its CSS color. */
export const RAYS = 'text-ink'

export const VISUALIZER_JSX = `import { Visualizer, usePlayer } from '@sillon/react'

export function Live() {
  const player = usePlayer('/avril.mp3')
  return <Visualizer player={player} rays={96} innerRadius={0.34} className="${RAYS}" />
}`

/** The Regions demo's classes. */
export const LOOP = {
  track: 'bg-track',
  played: 'bg-ink',
  bars: 'bg-accent',
  region: 'cursor-grab touch-none bg-accent/12 active:cursor-grabbing',
  // Line breaks and all, as the snippet prints it.
  handle: `w-2 cursor-ew-resize
  data-[sillon-handle=start]:-translate-x-1/2
  data-[sillon-handle=end]:translate-x-1/2
  after:absolute after:inset-x-[3px] after:inset-y-0
  after:rounded-[1px] after:bg-accent`,
}

export const REGIONS_JSX = `import { useEffect, useState } from 'react'
import { Waveform, useAudio } from '@sillon/react'

// Both grips: 8px wide, centered on their edge of the loop, with a line down the middle.
const handle = \`${LOOP.handle}\`

export function Looper({ src }) {
  const { peaks, player } = useAudio(src)
  const [loop, setLoop] = useState({ start: 16, end: 31 })
  useEffect(() => player.setLoop(loop), [player, loop])

  return (
    <Waveform.Root
      peaks={peaks}
      player={player}
      onDragSelect={(start, end) => setLoop({ start, end })}
    >
      <Waveform.Shape>
        <Waveform.Track className="${LOOP.track}" />
        <Waveform.Progress className="${LOOP.played}" />
        <Waveform.Region {...loop} className="${LOOP.bars}" />
      </Waveform.Shape>
      <Waveform.Region
        {...loop}
        onChange={(start, end) => setLoop({ start, end })}
        className="${LOOP.region}"
      >
        <Waveform.RegionHandle side="start" className={handle} />
        <Waveform.RegionHandle side="end" className={handle} />
      </Waveform.Region>
    </Waveform.Root>
  )
}`

/** The Zoom demo's bars. */
export const ZOOM_TRACK = 'bg-ink'

export const ZOOM_JSX = `import { Waveform, usePeaks, useWaveformStore } from '@sillon/react'

export function Zoomable() {
  // Peaks made ahead of time: a .peaks file is read as is, no audio decoded.
  const { peaks } = usePeaks('/hour.peaks')
  const store = useWaveformStore()

  // Show one minute, from 12:00. Cheap enough to call on every frame of a gesture.
  const zoomIn = () => store.setView(720, 780)

  return (
    <Waveform.Root store={store} peaks={peaks} onDoubleClick={zoomIn}>
      <Waveform.Shape>
        <Waveform.Track className="${ZOOM_TRACK}" />
      </Waveform.Shape>
    </Waveform.Root>
  )
}`

// Comments closer than this many pixels share an avatar.
export const COMMENTS_GAP = 28

/** Where a comment's parts sit, in the Comments demo and the hero; how they look is the site's own (cls.ts). */
export const COMMENT = {
  track: 'bg-track',
  played: 'bg-ink',
  /** The avatar hangs under the bars, centered on its time. */
  face: 'absolute top-[calc(100%+10px)] left-0 -translate-x-1/2',
  count: 'absolute -top-1.5 -right-[9px]',
  /** The bubble floats above the bars, centered on its time. */
  bubble: 'bottom-[calc(100%+10px)] left-0 -translate-x-1/2',
  list: 'max-h-70 overflow-y-auto',
}

export const COMMENTS_JSX = `import { Popover } from '@base-ui/react/popover'
import { Waveform, useActive, useAudio, useGroups } from '@sillon/react'

// Avatars hang under the bars and bubbles float above them, both centered on their time.
const face = '${COMMENT.face}'
const bubble = 'absolute ${COMMENT.bubble}'

function Comments({ comments, player }) {
  const groups = useGroups(comments, ${COMMENTS_GAP})
  // The newest comment the playhead passed in the last 3 seconds.
  const now = useActive(comments, 3).at(-1)
  const playFrom = (c) => { player.seek(c.time); player.play() }

  return groups.map((group) => {
    const [first, ...rest] = group.items
    return (
      <Waveform.Marker key={group.key} time={group.time}>
        {rest.length === 0 ? (
          <button className={face} onClick={() => playFrom(first)}>
            <Avatar user={first.user} />
          </button>
        ) : (
          // Any popover works; sillon only says which comments share a spot.
          <Popover.Root>
            <Popover.Trigger className={face}>
              <Avatar user={first.user} />
              <span className="${COMMENT.count}">{group.items.length}</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom">
                <Popover.Popup className="${COMMENT.list}">
                  {group.items.map((c) => (
                    <button key={c.id} onClick={() => playFrom(c)}>
                      <Avatar user={c.user} /> {c.text}
                    </button>
                  ))}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
        {group.items.includes(now) && <p className={bubble}>{now.text}</p>}
      </Waveform.Marker>
    )
  })
}

export function Track({ src, comments }) {
  const { peaks, player } = useAudio(src)
  return (
    <Waveform.Root peaks={peaks} player={player}>
      <Waveform.Shape>
        <Waveform.Track className="${COMMENT.track}" />
        <Waveform.Progress className="${COMMENT.played}" />
      </Waveform.Shape>
      <Comments comments={comments} player={player} />
    </Waveform.Root>
  )
}`

export const THEMES = {
  line: {
    label: 'Line',
    geometry: { barWidth: 1, barGap: 0, barRadius: 0 },
    note: 'One-pixel bars with no gap draw a solid outline',
    track: 'bg-track',
    played: 'bg-accent',
  },
  bars: {
    label: 'Bars',
    geometry: { barWidth: 2, barGap: 1, barRadius: 1 },
    note: null,
    track: 'bg-track',
    played: 'bg-ink',
  },
  gradient: {
    label: 'Gradient',
    geometry: { barWidth: 4, barGap: 2, barRadius: 2 },
    note: null,
    track: 'bg-linear-to-r from-accent to-[#f2a541] opacity-25',
    played: 'bg-linear-to-r from-accent to-[#f2a541]',
  },
  reflection: {
    label: 'Reflection',
    geometry: { barWidth: 2, barGap: 1, barRadius: 0 },
    note: 'A hard stop 62% of the way down: solid above it, reflected below',
    track: 'bg-linear-to-b from-ink-3 from-62% to-track to-62%',
    played: 'bg-linear-to-b from-accent from-62% to-accent/40 to-62%',
  },
} satisfies Record<string, { label: string; geometry: Partial<Geometry>; note: string | null; track: string; played: string }>

export type Theme = keyof typeof THEMES

/** The JSX for one theme: its bar sizes and its classes. */
export function stylingJsx(t: Theme) {
  const { geometry: g, note, track, played } = THEMES[t]
  return `<Waveform.Root peaks={peaks} player={player} barWidth={${g.barWidth}} barGap={${g.barGap}}${g.barRadius ? ` barRadius={${g.barRadius}}` : ''} contrast={2}>
  <Waveform.Shape>${note ? `\n    {/* ${note} */}` : ''}
    <Waveform.Track className="${track}" />
    <Waveform.Progress className="${played}" />
  </Waveform.Shape>
</Waveform.Root>`
}
