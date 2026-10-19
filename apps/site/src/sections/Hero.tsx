import { Waveform, usePeaks } from '@sillon/react'
import { Code, CodeTabs, Deck, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from './Themes'
import pattern from '../../../../scripts/strudel/avril.strudel.js?raw'

const JSX = `import { Waveform, useAudio } from '@sillon/react'

export function Player() {
  const { peaks, player } = useAudio('/avril.mp3')

  return (
    <Waveform.Root peaks={peaks} player={player} barWidth={3} barGap={2} barRadius={1.5} align="bottom" contrast={2}>
      <Waveform.Skeleton className="skeleton" />
      <Waveform.Shape>
        <Waveform.Track className="track" />
        <Waveform.Progress className="played" />
      </Waveform.Shape>
      <Waveform.Hover className="hover">
        <Waveform.Time kind="hover" />
      </Waveform.Hover>
    </Waveform.Root>
  )
}`

const CSS = `/* Even, low bars while the file loads, fading into the real ones */
.skeleton { background: var(--track); opacity: 0.5; }
.skeleton, [data-sillon-shape] { transition: opacity 180ms; }
[data-state='loading'] [data-sillon-shape] { opacity: 0; }

.track  { background: var(--track); }
.played { background: var(--ink); }
.hover  { width: 1px; background: var(--hover-line); }`

export function Hero() {
  const { peaks } = usePeaks(MUSIC)
  const player = useSitePlayer(MUSIC)
  return (
    <section className="hero">
      <div className="lede intro">
        <h1>sillon</h1>{' '}
        <p>
          Waveforms for React that you style with the CSS you already write. They show up almost instantly, even
          for hour-long recordings.
        </p>
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
      <div className="demo-code">
        <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }, { label: 'CSS', lang: 'css', code: CSS }]} />
      </div>
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
