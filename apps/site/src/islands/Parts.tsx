import { useEffect, type ReactNode } from 'react'
import { Visualizer, Waveform, usePeaks, useWaveformStore, type Peaks, type Player } from '@sillon/react'
import { PlayButton, PlayerTime, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { cursor, hoverLine, hoverTip, meta, shape, skeleton, transport } from '../cls'

// Each tile renders the real part, small and inert. They share one player,
// so pressing play moves all of them at once.

/** Where the playhead rests until someone presses play, as a fraction of the song. */
const REST = 0.38
const HOVER = 0.7

type Ctx = { peaks: Peaks | null; player: Player }

function Wave({ peaks, player, height = 72, store, children }: Ctx & { height?: number; store?: ReturnType<typeof useWaveformStore>; children: ReactNode }) {
  return (
    <Waveform.Root peaks={peaks} player={player} store={store} interactive={false} barWidth={2} barGap={1} barRadius={1} contrast={2} style={{ height }}>
      <Waveform.Skeleton className={skeleton} />
      {children}
    </Waveform.Root>
  )
}

/** A waveform whose pointer is parked at HOVER, since tiles never get a real one. */
function HoverWave({ peaks, player, children, height }: Ctx & { height?: number; children: ReactNode }) {
  const store = useWaveformStore()
  useEffect(() => {
    const park = () => store.state.end && store.setHover(store.state.end * HOVER)
    park()
    return store.subscribe((c) => c === 'layout' && park())
  }, [store])
  return <Wave peaks={peaks} player={player} store={store} height={height}>{children}</Wave>
}

const track = <Waveform.Track className="bg-track" />
const played = <Waveform.Progress className="bg-ink" />
/** A stretch of time, behind the bars. */
const regionBox = 'rounded-sm bg-accent/12'
const bigTime = 'text-[24px]/[1.3] tracking-[-0.01em]'

interface Tile {
  name: string
  desc: string
  size?: 'big' | 'wide' | 'tall'
  visual: (c: Ctx) => ReactNode
}

const TILES: Tile[] = [
  {
    name: 'Root',
    desc: 'The container. Click, drag or use the keyboard to seek.',
    size: 'big',
    visual: (c) => (
      <div className="grid gap-3.5 pt-7">
        <HoverWave {...c} height={132}>
          <Waveform.Region start={64} end={80} className={regionBox} />
          <Waveform.Shape className={shape}>
            {track}
            {played}
          </Waveform.Shape>
          <Waveform.Cursor className={cursor} />
          <Waveform.Hover className={hoverLine}>
            <Waveform.Time kind="hover" className={hoverTip} />
          </Waveform.Hover>
        </HoverWave>
        <div className={meta}>
          <Waveform.Root peaks={c.peaks} player={c.player} interactive={false}>
            <Waveform.Time /> / <Waveform.Time kind="duration" />
          </Waveform.Root>
        </div>
      </div>
    ),
  },
  {
    name: 'Shape',
    desc: 'Whatever you put inside shows through the bars.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape className={shape}>
          <div className="absolute inset-0 bg-linear-to-r/srgb from-[#6b5cff] via-accent via-55% to-[#f2a541]" />
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Track',
    desc: 'The whole waveform.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape className={shape}>{track}</Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Progress',
    desc: 'The part that has played.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape className={shape}>
          {track}
          {played}
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Cursor',
    desc: 'The playhead.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape className={shape}>{track}</Waveform.Shape>
        <Waveform.Cursor className={cursor} />
      </Wave>
    ),
  },
  {
    name: 'Hover',
    desc: 'Follows the pointer.',
    visual: (c) => (
      <HoverWave {...c}>
        <Waveform.Shape className={shape}>{track}</Waveform.Shape>
        <Waveform.Hover className="-ml-[0.5px] w-px bg-ink" />
      </HoverWave>
    ),
  },
  {
    name: 'Visualizer',
    desc: 'The live spectrum, as rays around a circle.',
    size: 'tall',
    visual: (c) => (
      <div className="mx-auto aspect-square w-[min(100%,220px)]">
        <Visualizer player={c.player} rays={72} innerRadius={0.36} className="block size-full text-ink" />
      </div>
    ),
  },
  {
    name: 'Region',
    desc: 'Highlights a stretch of time.',
    size: 'wide',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Region start={36} end={58} className={regionBox} />
        <Waveform.Shape className={shape}>
          {track}
          <Waveform.Region start={36} end={58} className="bg-accent" />
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Time',
    desc: 'Elapsed, remaining, total, or the time under the pointer.',
    size: 'wide',
    visual: (c) => (
      <Waveform.Root peaks={c.peaks} player={c.player} interactive={false} className="flex flex-wrap gap-x-10 gap-y-3 tabular-nums *:grid *:gap-0.5">
        <span><span className={meta}>current</span><Waveform.Time className={bigTime} /></span>
        <span><span className={meta}>remaining</span><Waveform.Time kind="remaining" className={bigTime} /></span>
        <span><span className={meta}>duration</span><Waveform.Time kind="duration" className={bigTime} /></span>
      </Waveform.Root>
    ),
  },
]

export function Parts() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'parts')
  // Start partway in, so the played part and the playhead have something to show.
  useEffect(() => {
    const rest = () => player.time === 0 && player.seek(player.duration * REST)
    if (player.duration) rest()
    else player.audio.addEventListener('loadedmetadata', rest, { once: true })
    return () => player.audio.removeEventListener('loadedmetadata', rest)
  }, [player])
  return (
    <>
      <div className={`${transport} mb-6`}>
        <PlayButton player={player} label={MUSIC_TITLE} />
        <PlayerTime player={player} />
      </div>
      <ul className="grid grid-flow-dense grid-cols-3 gap-3 narrow:grid-cols-2 tiny:grid-cols-1 [&_[data-sillon]]:cursor-default">
        {TILES.map((t) => (
          <li
            key={t.name}
            className="flex min-w-0 flex-col rounded-[14px] bg-plate data-[size=big]:col-span-2 data-[size=big]:row-span-2 data-[size=tall]:row-span-2 data-[size=wide]:col-span-2 narrow:data-[size=tall]:row-auto tiny:data-size:col-auto tiny:data-size:row-auto"
            data-size={t.size}
          >
            <div className="pointer-events-none grid flex-1 content-center px-5 pt-7 pb-[18px]" inert>{t.visual({ peaks, player })}</div>
            <div className="px-5 pb-[18px]">
              <code className="block font-mono text-[14px]/[1.5] font-medium text-ink">{t.name === 'Visualizer' ? t.name : `Waveform.${t.name}`}</code>
              <p className="mt-0.5 text-[14px]/[1.45] text-ink-2">{t.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
