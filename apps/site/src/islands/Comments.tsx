import { useState, type FormEvent } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Waveform, formatTime, timeToX, useActive, useGroups, usePeaks, useWaveform, type Player } from '@sillon/react'
import { Deck, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { COMMENT, COMMENTS_GAP as GAP, HEIGHT } from '../snippets'
import { avatar, bubble, btn, card, count, cursor, face as faceLook, meta, pin, ring as RING, shape, skeleton } from '../cls'

export type Note = { id: number; time: number; who: string; text: string }

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
/** Each person's avatar color, from their name. */
export const hue = (who: string) => [...who].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360

/** In the comment list, on the card: no ring, unless it's the comment being played. */
const ROW_LIVE = 'shadow-[0_0_0_2px_var(--color-card),0_0_0_4px_var(--color-accent)]'

function Avatar({ who, ring = '' }: { who: string; ring?: string }) {
  return <span className={`${avatar} ${ring}`} style={{ '--hue': hue(who) } as React.CSSProperties} aria-hidden>{who[0]}</span>
}

export function Comments() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'comments')
  const [notes, setNotes] = useState(SEED)
  const [draft, setDraft] = useState('')

  const post = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setNotes((ns) => [...ns, { id: ns.length, time: player.time, who: 'You', text }])
    setDraft('')
  }

  return (
    // Room for bubbles above the bars and avatars below them.
    <div className="pt-12">
      <Deck player={player} label={MUSIC_TITLE}>
        <Waveform.Root peaks={peaks} player={player} barWidth={2} barGap={1} barRadius={1} contrast={2} className={`mb-10 ${HEIGHT.comments}`} aria-label={`Seek in ${MUSIC_TITLE}`}>
          <Waveform.Skeleton className={skeleton} />
          <Waveform.Shape className={shape}>
            <Waveform.Track className={COMMENT.track} />
            <Waveform.Progress className={COMMENT.played} />
          </Waveform.Shape>
          <Waveform.Cursor className={cursor} />
          <Pins notes={notes} player={player} />
        </Waveform.Root>
      </Deck>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <form className="flex min-w-0 max-w-[440px] flex-1 gap-2" onSubmit={post}>
          <input
            className="min-w-0 flex-1 rounded-full border-0 bg-plate px-3.5 py-1.5 text-[14px] text-ink placeholder:text-ink-3"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment at the playhead"
            aria-label="Comment"
          />
          <button className={btn} disabled={!draft.trim()}>Post</button>
        </form>
      </div>
    </div>
  )
}

// Bubbles sit above the bars, centered on their avatar, and lean inward near either end.
// `beside` puts them below the bars instead, next to the avatar, as in the hero.
const above = `${bubble} bottom-[calc(100%+10px)]`
const beside = `${bubble} top-[calc(100%+6px)]`
const BUBBLE = {
  above: { center: `${bubble} ${COMMENT.bubble}`, right: `${above} left-0`, left: `${above} left-0 -translate-x-full` },
  beside: { center: `${beside} left-5`, right: `${beside} left-5`, left: `${beside} -left-5 -translate-x-full` },
}

export function Pins({ notes, player, beside }: { notes: Note[]; player: Player; beside?: boolean }) {
  const groups = useGroups(notes, GAP)
  // One bubble at a time: the one under the pointer, else the newest comment the playhead passed in the last 3 seconds.
  const latest = useActive(notes, 3).at(-1)
  const [hovered, setHovered] = useState<Note | null>(null)
  // The group whose list is open, if any. Picking a comment closes it.
  const [open, setOpen] = useState<string | null>(null)
  const s = useWaveform().state
  const play = (n: Note) => {
    // Hand the bubble back to playback.
    setHovered(null)
    setOpen(null)
    player.seek(n.time)
    void player.play()
  }

  return groups.map((g) => {
    const [first] = g.items
    const n = g.items.length
    const live = latest && g.items.includes(latest) ? latest : undefined
    // While anything is previewed, that is the only bubble on the waveform.
    const said = hovered ? (hovered === first && n === 1 ? first : undefined) : live
    // Near either end, the bubble leans inward so it stays on the page. Read when it appears.
    const x = s.width ? timeToX(s, g.time) / s.width : 0.5
    const face = {
      className: `${faceLook} ${COMMENT.face}`,
      // Keep the waveform from seeking underneath.
      onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
    }
    return (
      <Waveform.Marker key={g.key} time={g.time} className={pin}>
        {n === 1 ? (
          <button
            {...face}
            onClick={() => play(first)}
            onPointerEnter={() => setHovered(first)}
            onPointerLeave={() => setHovered((h) => (h === first ? null : h))}
            onFocus={() => setHovered(first)}
            onBlur={() => setHovered((h) => (h === first ? null : h))}
            aria-label={`${first.who} at ${formatTime(first.time)}: ${first.text}. Play from here`}
          >
            <Avatar who={first.who} ring={live ? RING.live : RING.on} />
          </button>
        ) : (
          <Popover.Root open={open === g.key} onOpenChange={(o) => setOpen(o ? g.key : null)}>
            <Popover.Trigger {...face} aria-label={`${n} comments from ${formatTime(g.time)}`}>
              <Avatar who={first.who} ring={live ? RING.live : RING.on} />
              <span className={`${count} ${COMMENT.count}`} aria-hidden>{n}</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" sideOffset={10} collisionPadding={16}>
                <Popover.Popup className={`${card} w-[300px] max-w-[calc(100vw-32px)] origin-(--transform-origin) p-1.5`}>
                  <Popover.Title className={`${meta} m-0 px-2 pt-1.5 pb-2`}>
                    {n} comments · {formatTime(g.time)}–{formatTime(g.end)}
                  </Popover.Title>
                  <ul className={COMMENT.list}>
                    {g.items.map((c) => (
                      <li key={c.id}>
                        <button
                          className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-[14px] text-ink-2 hover:bg-plate [&_b]:mr-1 [&_b]:font-medium [&_b]:text-ink"
                          onClick={() => play(c)}
                        >
                          <Avatar who={c.who} ring={c === live ? ROW_LIVE : undefined} />
                          <span><b>{c.who}</b> {c.text}</span>
                          <span className={meta}>{formatTime(c.time)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
        {said && (
          <p className={BUBBLE[beside ? 'beside' : 'above'][x < 0.2 ? 'right' : x > 0.8 ? 'left' : 'center']} role={hovered ? undefined : 'status'}>
            <b>{said.who}</b> {said.text}
          </p>
        )}
      </Waveform.Marker>
    )
  })
}
