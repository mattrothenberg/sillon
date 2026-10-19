import { Code } from '../ui'

export function Api() {
  return (
    <section id="usage">
      <div className="lede">
        <h2>Usage.</h2>{' '}
        <p>
          A handful of small components that you put together yourself.
        </p>
      </div>
      <div className="wide usage">
        <Code>{`import { Waveform, useAudio } from '@sillon/react'

export function Episode({ src }) {
  const { peaks, player } = useAudio(src)

  return (
    <Waveform.Root peaks={peaks} player={player} barWidth={2} barGap={1}>
      <Waveform.Shape>
        <Waveform.Track className="unplayed" />
        <Waveform.Progress className="played" />
      </Waveform.Shape>
      <Waveform.Cursor className="playhead" />
      <Waveform.Time />
    </Waveform.Root>
  )
}`}</Code>
        <p className="usage-note">
          <code>useAudio</code> gives you everything a waveform needs for one file. If you already have a player, or
          only want the picture, use <code>usePeaks</code> or <code>usePlayer</code> on their own.
        </p>
      </div>
    </section>
  )
}
