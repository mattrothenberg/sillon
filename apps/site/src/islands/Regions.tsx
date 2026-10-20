import { useEffect, useState } from 'react'
import { Switch } from '@base-ui/react/switch'
import { Waveform, usePeaks, type Span } from '@sillon/react'
import { Deck, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { HEIGHT, LOOP } from '../snippets'
import { btn, cursor, hoverLine, meta, shape, skeleton } from '../cls'

const tenths = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export function Regions() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'regions')
  const [loop, setLoop] = useState<Span>({ start: 16, end: 31 })
  const [looping, setLooping] = useState(true)

  useEffect(() => player.setLoop(looping ? loop : null), [player, loop, looping])

  // With Repeat off, the loop stays where it is, dimmed.
  const off = looping ? '' : ' opacity-35'
  return (
    <div>
      <Deck player={player} label={MUSIC_TITLE}>
        <Waveform.Root
          peaks={peaks}
          player={player}
          barWidth={2}
          barGap={1}
          barRadius={1}
          contrast={2}
          onDragSelect={(start, end) => setLoop({ start, end })}
          className={HEIGHT.regions}
          aria-label={`Seek in ${MUSIC_TITLE}`}
        >
          <Waveform.Skeleton className={skeleton} />
          <Waveform.Shape className={shape}>
            <Waveform.Track className={LOOP.track} />
            <Waveform.Progress className={LOOP.played} />
            <Waveform.Region {...loop} className={LOOP.bars + off} />
          </Waveform.Shape>
          <Waveform.Hover className={hoverLine} />
          <Waveform.Region {...loop} onChange={(start, end) => setLoop({ start, end })} className={LOOP.region + off}>
            <Waveform.RegionHandle side="start" className={LOOP.handle} aria-label="Loop start" />
            <Waveform.RegionHandle side="end" className={LOOP.handle} aria-label="Loop end" />
          </Waveform.Region>
          <Waveform.Cursor className={cursor} />
        </Waveform.Root>
      </Deck>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className={meta}>Loop {tenths(loop.start)} – {tenths(loop.end)} · {(loop.end - loop.start).toFixed(1)} s</span>
        <span className="flex items-center gap-4">
          <button className={`${btn} inline-flex items-center gap-2`} onClick={() => { player.seek(loop.start); void player.play() }}>
            <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden><path d="M2 1.2v7.6a.6.6 0 0 0 .9.5l6-3.8a.6.6 0 0 0 0-1L2.9.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
            Play loop
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[14px] text-ink">
            <Switch.Root
              className="relative inline-flex h-5 w-[34px] cursor-pointer rounded-full border-0 bg-ink/22 p-0.5 transition-[background] duration-150 data-checked:bg-accent motion-reduce:transition-none"
              checked={looping}
              onCheckedChange={setLooping}
            >
              <Switch.Thumb className="size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-[translate] duration-150 data-checked:translate-x-3.5 motion-reduce:transition-none" />
            </Switch.Root>
            Repeat
          </label>
        </span>
      </div>
    </div>
  )
}
