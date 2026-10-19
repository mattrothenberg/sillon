import { Waveform, usePeaks } from '@sillon/react'
import { Code, Deck, Install, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from './Themes'
import pattern from '../../../../scripts/strudel/avril.strudel.js?raw'

export function Hero() {
  const { peaks } = usePeaks(MUSIC)
  const player = useSitePlayer(MUSIC)
  return (
    <section className="hero">
      <div className="intro">
        <h1>Headless waveform components for React.</h1>
        <p>Peaks, playback, regions, markers and a visualizer, as parts you compose and style with your own CSS.</p>
        <Install />
      </div>
      <figure className="hero-demo">
        <Deck player={player} label={MUSIC_TITLE}>
          <Waveform.Root peaks={peaks} player={player} barWidth={3} barGap={2} barRadius={1.5} align="bottom" contrast={2} style={{ height: 176 }} aria-label={`Seek in ${MUSIC_TITLE}`}>
            <Waveform.Skeleton className="skeleton" />
            <Waveform.Shape>
              <Waveform.Track style={{ background: 'var(--track)' }} />
              <Waveform.Progress style={{ background: 'var(--ink)' }} />
            </Waveform.Shape>
            <Waveform.Hover className="hover-line">
              <Waveform.Time kind="hover" className="hover-tip meta" />
            </Waveform.Hover>
          </Waveform.Root>
        </Deck>
      </figure>
      <details className="credit">
        <summary>Aphex Twin, <i>Avril 14th</i>, played by Strudel</summary>
        <p>
          Notes after Nicola Ariutti's <a href="https://sccode.org/1-5d0">SuperCollider transcription</a>. This is the{' '}
          <a href="https://strudel.cc">Strudel</a> pattern that played it, rendered once to MP3.
        </p>
        <Code lang="javascript">{pattern}</Code>
      </details>
    </section>
  )
}
