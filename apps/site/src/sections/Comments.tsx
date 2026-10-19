import { useRef, useState, type FormEvent } from 'react'
import { Waveform, formatTime, timeToX, useActive, useGroups, usePeaks, useWaveform, useWaveformStore, type Group } from '@sillon/react'
import { CodeTabs, Deck, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from './Themes'

type Note = { id: number; time: number; who: string; text: string }

// Made-up listeners, so the demo has a crowd to group.
const PEOPLE = ['Ines', 'Kofi', 'Mara', 'Theo', 'Yuki', 'Sam', 'Lena', 'Arjun', 'Noor', 'Pablo', 'Ada', 'Jun']
const SAID: [number, string][] = [
  [2.1, 'Here we go'], [6.8, 'That first note'], [9.4, 'So quiet'], [14.2, 'Headphones on'],
  [19.6, 'The left hand here'], [20.4, 'This bit'], [21.1, 'Gets me every time'], [22.3, 'Same'], [23.0, 'Rain on a window'],
  [31.5, 'Back to the theme'], [38.9, 'Softest part'], [44.7, 'Loop this forever'], [47.2, 'That chord'],
  [55.0, 'Strudel played this?'], [61.3, 'Halfway'], [66.8, 'Like a music box'], [72.4, 'The pause before this'],
  [80.2, 'Here it builds'], [84.6, 'Wait for it'], [86.1, 'Wait for it…'], [86.9, 'Now'], [87.5, 'There it is'],
  [88.2, 'Loudest bit'], [89.0, 'Chills'], [90.4, 'Every time'], [97.7, 'And back down'], [104.3, 'So gentle'],
  [111.6, 'Nearly over'], [116.9, 'Last notes'], [119.8, 'Again'],
]
const SEED: Note[] = SAID.map(([time, text], i) => ({ id: i, time, text, who: PEOPLE[(i * 5) % PEOPLE.length] }))
const hue = (who: string) => [...who].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360

function Avatar({ who }: { who: string }) {
  return <span className="avatar" style={{ '--hue': hue(who) } as React.CSSProperties} aria-hidden>{who[0]}</span>
}

const JSX = `import { Waveform, useActive, useAudio, useGroups } from '@sillon/react'

function Comments({ comments }) {
  // Comments closer than 28 px share a marker until you zoom in.
  const groups = useGroups(comments, 28)
  // The newest comment the playhead passed in the last 3 seconds.
  const now = useActive(comments, 3).at(-1)

  return groups.map((group) => (
    <Waveform.Marker key={group.key} time={group.time} className="marker">
      <Avatar user={group.items[0].user} />
      {group.items.length > 1 && <span className="count">{group.items.length}</span>}
      {group.items.includes(now) && <p className="bubble">{now.text}</p>}
    </Waveform.Marker>
  ))
}

export function Track({ src, comments }) {
  const { peaks, player } = useAudio(src)

  return (
    <Waveform.Root peaks={peaks} player={player}>
      <Waveform.Shape>
        <Waveform.Track className="track" />
        <Waveform.Progress className="played" />
      </Waveform.Shape>
      <Comments comments={comments} />
    </Waveform.Root>
  )
}`

const CSS = `.marker { display: flex; align-items: flex-end; }
.avatar { width: 22px; height: 22px; border-radius: 50%; translate: -50% 30px; }
.bubble { position: absolute; bottom: calc(100% + 8px); white-space: nowrap; }`

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export function Comments() {
  const { peaks } = usePeaks(MUSIC)
  const player = useSitePlayer(MUSIC)
  const store = useWaveformStore()
  const [notes, setNotes] = useState(SEED)
  const [draft, setDraft] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const anim = useRef(0)

  // A short move between views, only ever in answer to a click.
  const zoomTo = (start: number, end: number | null) => {
    cancelAnimationFrame(anim.current)
    const full = peaks?.duration ?? 0
    const from = [store.state.start, store.state.end], to = [start, end ?? full], t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 320), k = ease(t)
      store.setView(from[0] + (to[0] - from[0]) * k, t < 1 ? from[1] + (to[1] - from[1]) * k : end)
      if (t < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
    setZoomed(end !== null)
  }

  const open = (g: Group<Note>) => {
    if (g.items.length === 1) return player.seek(g.time)
    // Room on both sides, at least 8 seconds, so the group has space to split.
    const pad = Math.max(4, (g.end - g.time) * 0.6), mid = (g.time + g.end) / 2
    const half = Math.max(g.end - g.time, 8) / 2 + pad
    zoomTo(Math.max(0, mid - half), Math.min(peaks?.duration ?? Infinity, mid + half))
  }

  const post = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setNotes((ns) => [...ns, { id: ns.length, time: player.time, who: 'You', text }])
    setDraft('')
  }

  return (
    <section id="comments">
      <div className="lede">
        <h2>Comments</h2>
        <p><code>Waveform.Marker</code> pins anything to a time. <code>useGroups</code> merges markers that would overlap at the current zoom, and <code>useActive</code> returns what the playhead just passed. Click a group to zoom in.</p>
      </div>
      <div className="plate comments">
        <Deck player={player} label={MUSIC_TITLE}>
          <Waveform.Root peaks={peaks} player={player} store={store} barWidth={2} barGap={1} barRadius={1} contrast={2} style={{ height: 96 }} aria-label={`Seek in ${MUSIC_TITLE}`}>
            <Waveform.Skeleton className="skeleton" />
            <Waveform.Shape>
              <Waveform.Track style={{ background: 'var(--track)' }} />
              <Waveform.Progress style={{ background: 'var(--ink)' }} />
            </Waveform.Shape>
            <Waveform.Cursor className="cursor" />
            <Pins notes={notes} onOpen={open} />
          </Waveform.Root>
        </Deck>
        <div className="comments-bar">
          <form className="comment-form" onSubmit={post}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment at the playhead" aria-label="Comment" />
            <button className="btn" disabled={!draft.trim()}>Post</button>
          </form>
          {zoomed && <button className="btn" onClick={() => zoomTo(0, null)}>Show all</button>}
        </div>
      </div>
      <div className="demo-code">
        <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }, { label: 'CSS', lang: 'css', code: CSS }]} />
      </div>
    </section>
  )
}

function Pins({ notes, onOpen }: { notes: Note[]; onOpen: (g: Group<Note>) => void }) {
  const groups = useGroups(notes, 28)
  // One bubble at a time: the newest comment the playhead passed, for 3 seconds or until the next one.
  const latest = useActive(notes, 3).at(-1)
  const s = useWaveform().state
  return groups.map((g) => {
    const said = latest && g.items.includes(latest) ? latest : undefined
    // Near either end, the bubble leans inward so it stays on the page. Read when it appears.
    const x = s.width ? timeToX(s, g.time) / s.width : 0.5
    const n = g.items.length
    return (
      <Waveform.Marker key={g.key} time={g.time} className="pin">
        <button
          className={said ? 'pin-head live' : 'pin-head'}
          // Keep the waveform from seeking underneath.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onOpen(g)}
          aria-label={n > 1 ? `${n} comments from ${formatTime(g.time)}, zoom in` : `${g.items[0].who} at ${formatTime(g.time)}: ${g.items[0].text}`}
        >
          <Avatar who={g.items[0].who} />
          {n > 1 && <span className="pin-count">{n}</span>}
        </button>
        {said && (
          <p className={x < 0.2 ? 'bubble lean-right' : x > 0.8 ? 'bubble lean-left' : 'bubble'} role="status">
            <b>{said.who}</b> {said.text}
          </p>
        )}
      </Waveform.Marker>
    )
  })
}
