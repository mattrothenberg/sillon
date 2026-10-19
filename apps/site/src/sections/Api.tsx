import { CodeTabs } from '../ui'

const JSX = `import { Waveform, useAudio } from '@sillon/react'

export function Episode({ src }) {
  const { peaks, player } = useAudio(src)

  return (
    <Waveform.Root peaks={peaks} player={player} barWidth={2} barGap={1}>
      <Waveform.Skeleton className="skeleton" />
      <Waveform.Shape>
        <Waveform.Track className="unplayed" />
        <Waveform.Progress className="played" />
      </Waveform.Shape>
      <Waveform.Cursor className="playhead" />
      <Waveform.Time />
    </Waveform.Root>
  )
}`

const CSS = `.unplayed { background: #d4d0c9; }
.played   { background: #0f0e0c; }
.playhead { width: 2px; background: #e0442a; }

/* Placeholder bars while the file loads, fading into the real ones */
.skeleton { background: #d4d0c9; opacity: 0.5; }
.skeleton, [data-sillon-shape] { transition: opacity 180ms; }
[data-state='loading'] [data-sillon-shape] { opacity: 0; }`

export function Api() {
  return (
    <section id="usage">
      <div className="lede">
        <h2>Usage</h2>
        <p><code>useAudio</code> loads a file and returns its peaks and a player. Pass both to <code>Waveform.Root</code> and put the parts you want inside it.</p>
      </div>
      <div className="wide usage">
        <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }, { label: 'CSS', lang: 'css', code: CSS }]} />
        <p className="usage-note">
          Already have a player, or only need the picture? Use <code>usePeaks</code> and <code>usePlayer</code> on
          their own. The waveform appears once the whole file is read; pass <code>progressive</code> to draw it while a
          long file streams in.
        </p>
      </div>
    </section>
  )
}
