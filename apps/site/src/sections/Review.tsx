import { useEffect, useMemo, useRef, useState } from 'react'
import { Waveform, findSilences, summarize, usePeaks, type Span } from '@sillon/react'
import { Code, CodeTabs, Deck, useSitePlayer } from '../ui'

const URL = '/audio/moon.mp3'
// Tuned for this recording: the crowd keeps the pauses from going fully quiet.
// Pauses over 0.7 s, trimmed to leave 0.15 s of breath in place.
const SILENCE = { threshold: 0.14, minDuration: 0.7, keep: 0.15 }

type Decision = 'proposed' | 'cut' | 'kept'

const JSX = `import { Waveform, findSilences, useAudio } from '@sillon/react'

export function Pauses() {
  const { peaks, player } = useAudio('/moon.mp3')
  const pauses = peaks ? findSilences(peaks, { minDuration: 0.7 }) : []

  return (
    <Waveform.Root peaks={peaks} player={player}>
      <Waveform.Shape>
        <Waveform.Track className="track" />
        <Waveform.Progress className="played" />
        {pauses.map((p) => (
          <Waveform.Region key={p.start} start={p.start} end={p.end} className="pause" />
        ))}
      </Waveform.Shape>
    </Waveform.Root>
  )
}`

const CSS = `.track  { background: var(--track); }
.played { background: var(--ink); }
.pause  { background: var(--accent); }`
const tenths = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export function Review() {
  const { peaks, stats } = usePeaks(URL)
  const player = useSitePlayer(URL)
  const cuts = useMemo<Span[]>(() => (stats && peaks ? findSilences(peaks, SILENCE) : []), [peaks, stats])
  const [decisions, setDecisions] = useState<Decision[]>([])
  // Markers for cuts closer than 4% of the clip would overlap: lean them apart.
  const near = (a?: Span, b?: Span) => !!a && !!b && !!peaks && Math.abs(b.start - a.start) < (peaks.duration || 1) * 0.04
  const lean = (i: number) => (near(cuts[i], cuts[i + 1]) ? ' lean-left' : near(cuts[i - 1], cuts[i]) ? ' lean-right' : '')
  useEffect(() => setDecisions(cuts.map(() => 'proposed')), [cuts])
  const set = (i: number, d: Decision) => setDecisions((ds) => ds.map((x, k) => (k === i ? (x === d ? 'proposed' : d) : x)))

  // Playback jumps over accepted cuts, so you hear the edit, not a description of it.
  const accepted = useRef<Span[]>([])
  accepted.current = cuts.filter((_, i) => decisions[i] === 'cut')
  useEffect(() => player.onTime((t) => {
    if (!player.playing) return
    const c = accepted.current.find((c) => t >= c.start && t < c.end - 0.02)
    if (c) player.seek(c.end)
  }), [player])

  const saved = accepted.current.reduce((s, c) => s + c.end - c.start, 0)
  const proposed = cuts.reduce((s, c) => s + c.end - c.start, 0)
  const { summary, bytes } = useMemo(() => {
    if (!stats || !peaks) return { summary: '', bytes: 0 }
    const s = summarize(peaks, 32, SILENCE)
    // Sized as compact JSON, what you'd actually send; shown pretty.
    // Number arrays wrap at 16 per line instead of one per line, or one endless line.
    const summary = JSON.stringify(s, null, 2).replace(/\[\s+([\d,.\s]+?)\s+\]/g, (_, xs: string) => {
      const vs = xs.split(/,\s*/), rows: string[] = []
      for (let i = 0; i < vs.length; i += 16) rows.push(vs.slice(i, i + 16).join(', '))
      return rows.length > 1 ? `[\n    ${rows.join(',\n    ')}\n  ]` : `[${rows[0]}]`
    }).replace(/\{\s+([^{}]+?)\s+\}/g, (_, body: string) => `{ ${body.replace(/\s*\n\s*/g, ' ')} }`)
    return { summary, bytes: new Blob([JSON.stringify(s)]).size }
  }, [peaks, stats])

  return (
    <section id="regions">
      <div className="lede">
        <h2>Regions.</h2>{' '}
        <p>
          Highlight any stretch of time. Here the long pauses in a speech are marked for cutting. Keep or cut each one,
          then press play to hear the result.
        </p>
      </div>
      <div className="wide review">
        <div className="plate">
          <Deck player={player} label="the speech">
            <Waveform.Root peaks={peaks} player={player} barWidth={2} barGap={1} barRadius={1} style={{ height: 96 }} aria-label="Seek in the speech">
              {cuts.map((c, i) => (
                // The number above each cut matches the list below: a half-second cut is only a few pixels wide.
                <Waveform.Region key={'box' + i} start={c.start} end={c.end} className={`cut-box ${decisions[i] ?? 'proposed'}${lean(i)}`}>
                  <span className="cut-pin" aria-hidden>{i + 1}</span>
                </Waveform.Region>
              ))}
              <Waveform.Skeleton className="skeleton" />
              <Waveform.Shape>
                <Waveform.Track style={{ background: 'var(--track)' }} />
                <Waveform.Progress style={{ background: 'var(--ink)' }} />
                {cuts.map((c, i) => <Waveform.Region key={'bars' + i} start={c.start} end={c.end} className={`cut-bars ${decisions[i] ?? 'proposed'}`} />)}
              </Waveform.Shape>
              <Waveform.Hover className="hover-line" />
              <Waveform.Cursor className="cursor" />
            </Waveform.Root>
          </Deck>
          <div className="review-body">
            <div>
              <div className="review-head">
                <span className="meta">{cuts.length ? `${cuts.length} proposed cuts · ${proposed.toFixed(1)} s` : 'Listening for pauses…'}</span>
                <span className="review-actions">
                  <button className="btn" disabled={!cuts.length} onClick={() => setDecisions(cuts.map(() => 'cut'))}>Accept all</button>
                  <button className="btn" disabled={!cuts.length} onClick={() => setDecisions(cuts.map(() => 'proposed'))}>Reset</button>
                </span>
              </div>
              <ol className="cuts">
                {cuts.map((c, i) => (
                  <li key={i} className={decisions[i]}>
                    <span className="cut-pin" aria-hidden>{i + 1}</span>
                    <button className="cut-time meta" onClick={() => player.seek(Math.max(0, c.start - 1.5))} aria-label={`Listen around ${tenths(c.start)}`}>
                      {tenths(c.start)} – {tenths(c.end)}
                    </button>
                    <span className="cut-len meta">{(c.end - c.start).toFixed(1)} s</span>
                    <span className="cut-choice">
                      <button className="btn" aria-pressed={decisions[i] === 'cut'} onClick={() => set(i, 'cut')}>Cut</button>
                      <button className="btn" aria-pressed={decisions[i] === 'kept'} onClick={() => set(i, 'kept')}>Keep</button>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="meta review-total">
                {saved ? <>Edited length <b>{tenths((peaks?.duration ?? 0) - saved)}</b>, {saved.toFixed(1)} s shorter</> : 'Nothing cut yet'}
              </p>
            </div>
            <div className="summary">
              <div className="meta summary-head">
                <span>summarize(peaks)</span>
                <span>{summary ? `${bytes} bytes for ${Math.round(peaks?.duration ?? 0)} s of audio` : ''}</span>
              </div>
              <Code lang="json">{summary || '…'}</Code>
            </div>
          </div>
        </div>
        <div className="demo-code">
          <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }, { label: 'CSS', lang: 'css', code: CSS }]} />
        </div>
        <p className="meta honest">
          John F. Kennedy at Rice University, 12 September 1962. Public domain, from the{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Jfk_rice_university_we_choose_to_go_to_the_moon.ogg">JFK Presidential Library</a>.
        </p>
        <p className="meta honest"><code>summarize()</code> describes a recording in a few hundred bytes, small enough to hand to a language model.</p>
      </div>
    </section>
  )
}
