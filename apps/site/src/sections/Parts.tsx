import { useEffect, type ReactNode } from 'react'
import { Visualizer, Waveform, usePeaks, useWaveformStore, type Peaks, type Player } from '@sillon/react'
import { PlayButton, PlayerTime, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from './Themes'

// Each tile renders the real part, small and inert. They share one player,
// so pressing play moves all of them at once.

/** Where the playhead rests until someone presses play, as a fraction of the song. */
const REST = 0.38
const HOVER = 0.7

type Ctx = { peaks: Peaks | null; player: Player }

function Wave({ peaks, player, height = 72, store, children }: Ctx & { height?: number; store?: ReturnType<typeof useWaveformStore>; children: ReactNode }) {
  return (
    <Waveform.Root peaks={peaks} player={player} store={store} interactive={false} barWidth={2} barGap={1} barRadius={1} contrast={2} style={{ height }}>
      <Waveform.Skeleton className="skeleton" />
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

const track = <Waveform.Track className="part-track" />

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
      <div className="part-root">
        <HoverWave {...c} height={132}>
          <Waveform.Region start={64} end={80} className="part-region-box" />
          <Waveform.Shape>
            {track}
            <Waveform.Progress className="part-played" />
          </Waveform.Shape>
          <Waveform.Cursor className="cursor" />
          <Waveform.Hover className="hover-line">
            <Waveform.Time kind="hover" className="hover-tip meta" />
          </Waveform.Hover>
        </HoverWave>
        <div className="part-root-times meta">
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
        <Waveform.Shape>
          <div className="part-paint" />
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Track',
    desc: 'The whole waveform.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape>{track}</Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Progress',
    desc: 'The part that has played.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape>
          {track}
          <Waveform.Progress className="part-played" />
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Cursor',
    desc: 'The playhead.',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Shape>{track}</Waveform.Shape>
        <Waveform.Cursor className="cursor" />
      </Wave>
    ),
  },
  {
    name: 'Hover',
    desc: 'Follows the pointer.',
    visual: (c) => (
      <HoverWave {...c}>
        <Waveform.Shape>{track}</Waveform.Shape>
        <Waveform.Hover className="part-hover" />
      </HoverWave>
    ),
  },
  {
    name: 'Visualizer',
    desc: 'Moves with the sound as it plays.',
    size: 'tall',
    visual: (c) => (
      <div className="part-disc">
        <Visualizer player={c.player} rays={72} innerRadius={0.36} className="rays" />
      </div>
    ),
  },
  {
    name: 'Region',
    desc: 'Highlights a stretch of time.',
    size: 'wide',
    visual: (c) => (
      <Wave {...c}>
        <Waveform.Region start={36} end={58} className="part-region-box" />
        <Waveform.Shape>
          {track}
          <Waveform.Region start={36} end={58} className="part-region" />
        </Waveform.Shape>
      </Wave>
    ),
  },
  {
    name: 'Time',
    desc: 'Elapsed, remaining, total, or the time under the pointer.',
    size: 'wide',
    visual: (c) => (
      <Waveform.Root peaks={c.peaks} player={c.player} interactive={false} className="part-times">
        <span><span className="meta">current</span><Waveform.Time /></span>
        <span><span className="meta">remaining</span><Waveform.Time kind="remaining" /></span>
        <span><span className="meta">duration</span><Waveform.Time kind="duration" /></span>
      </Waveform.Root>
    ),
  },
]

export function Parts() {
  const { peaks } = usePeaks(MUSIC)
  const player = useSitePlayer(MUSIC)
  // Start partway in, so the played part and the playhead have something to show.
  useEffect(() => {
    const rest = () => player.time === 0 && player.seek(player.duration * REST)
    if (player.duration) rest()
    else player.audio.addEventListener('loadedmetadata', rest, { once: true })
    return () => player.audio.removeEventListener('loadedmetadata', rest)
  }, [player])
  return (
    <section id="parts">
      <div className="lede">
        <h2>Parts.</h2>{' '}
        <p>Each one is its own component. Use the ones you need and style them with CSS.</p>
      </div>
      <div className="transport parts-transport">
        <PlayButton player={player} label={MUSIC_TITLE} />
        <PlayerTime player={player} />
      </div>
      <ul className="bento">
        {TILES.map((t) => (
          <li key={t.name} className="bento-tile" data-size={t.size}>
            <div className="bento-visual" inert>{t.visual({ peaks, player })}</div>
            <div className="bento-meta">
              <code>{t.name === 'Visualizer' ? t.name : `Waveform.${t.name}`}</code>
              <p>{t.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
