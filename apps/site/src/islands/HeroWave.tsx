import { Waveform } from '@sillon/react'
import { PlayButton, PlayerTime, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from '../music'
import { BARS, shapeDuration, useNarrow, useSongPeaks, type Shape } from '../shape'
import { Pins, type Note } from './Comments'
import { col, hoverLine, hoverTip, meta, shape, transport } from '../cls'

// A few made-up listeners on the song, far enough apart that none of them group.
export const NOTES: Note[] = [
  { id: 0, time: 3.2, who: 'Ines', text: 'Here we go' },
  { id: 1, time: 21.1, who: 'Kofi', text: 'The left hand here' },
  { id: 2, time: 44.7, who: 'Mara', text: 'Loop this forever' },
  { id: 3, time: 66.8, who: 'Theo', text: 'Like a music box' },
  { id: 4, time: 87.5, who: 'Yuki', text: 'There it is' },
  { id: 5, time: 104.3, who: 'Sam', text: 'So gentle' },
  { id: 6, time: 116.9, who: 'Lena', text: 'Last notes' },
]

/** The bars fade in once, when the island has drawn them; the page holds their space until then.
 *  Drawn at once, they still fade: `starting:` is where they fade from. Without motion, they just appear. */
const fadeIn = `${shape} opacity-0 in-data-[state=ready]:opacity-100 motion-safe:duration-400 motion-safe:ease-[ease-out] motion-safe:starting:opacity-0`

/** The song, edge to edge, with its transport underneath. */
export function HeroWave({ shape }: { shape: Shape }) {
  // Drawn from the shape in the page, so the bars need no request.
  const peaks = useSongPeaks(shape)
  const bars = useNarrow() ? BARS.hero.narrow : BARS.hero.wide
  const player = useSitePlayer(MUSIC, 'top')
  return (
    <>
      <Waveform.Root peaks={peaks} player={player} bars={bars} barWidth={4} barGap={2} barRadius={1} align="bottom" contrast={2} className="h-(--wave)" aria-label={`Seek in ${MUSIC_TITLE}`}>
        <Waveform.Shape className={fadeIn}>
          <Waveform.Track className="bg-track" />
          <Waveform.Progress className="bg-ink" />
        </Waveform.Shape>
        <Waveform.Hover className={hoverLine}>
          <Waveform.Time kind="hover" className={hoverTip} />
        </Waveform.Hover>
        <Pins notes={NOTES} player={player} beside />
      </Waveform.Root>
      <div className={`${col} ${transport} mt-14`}>
        <PlayButton player={player} label={MUSIC_TITLE} />
        <PlayerTime player={player} known={shapeDuration(shape)} />
      </div>
    </>
  )
}
