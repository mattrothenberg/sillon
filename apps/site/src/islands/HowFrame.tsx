import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Waveform, usePeaks, usePlayerState, type Peaks, type Player } from '@sillon/react'
import { PlayButton, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { cursor, hoverLine, meta, shape, skeleton } from '../cls'

// While the song plays, log what actually happens to the waveform: how many
// times React renders it, and every change made to its DOM, one line per frame.
// The waveform has a React root of its own, so its renders can be told apart
// from the counters' (see the commit counter in this page's <head>).

declare global { interface Window { __commits?: Map<Element, number> } }

const PARTS: [selector: string, name: string][] = [
  ['[data-sillon-progress]', 'Progress'],
  ['[data-sillon-cursor]', 'Cursor'],
  ['[data-sillon-hover]', 'Hover'],
  ['[data-sillon-time]', 'Time'],
  ['[data-sillon-shape]', 'Shape'],
  ['[data-sillon]', 'Root'],
]
const partOf = (n: Node) => {
  const el = n instanceof Element ? n : n.parentElement
  for (const [sel, name] of PARTS) if (el?.closest(sel)) return name
  return 'Other'
}

/** Lines kept in the log; older ones scroll off the top. */
const LINES = 40

/** The new value of a change, short enough for one line. */
const valueOf = (r: MutationRecord) => {
  const el = (r.target instanceof Element ? r.target : r.target.parentElement) as HTMLElement | null
  if (r.type !== 'attributes') return `"${el?.textContent ?? ''}"`
  if (r.attributeName === 'style') return el?.style.transform || el?.style.opacity || 'style'
  return `"${el?.getAttribute(r.attributeName!) ?? ''}"`
}

function Wave({ peaks, player }: { peaks: Peaks | null; player: Player }) {
  return (
    <Waveform.Root peaks={peaks} player={player} barWidth={3} barGap={2} barRadius={1} contrast={2} className="h-[120px]">
      <Waveform.Skeleton className={skeleton} />
      <Waveform.Shape className={shape}>
        <Waveform.Track className="bg-track" />
        <Waveform.Progress className="bg-ink" />
      </Waveform.Shape>
      <Waveform.Cursor className={cursor} />
      <Waveform.Hover className={hoverLine} />
      <span className={`${meta} absolute top-[calc(100%+10px)] right-0`}><Waveform.Time /></span>
    </Waveform.Root>
  )
}

const stat = 'grid gap-0.5'
const dt = 'text-[13px] text-ink-3 narrow:text-[12px]/[1.3]'
const dd = 'text-[22px] font-medium tabular-nums narrow:text-[18px]'

export function HowFrame() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'react')
  const { playing } = usePlayerState(player)
  const host = useRef<HTMLDivElement>(null)
  const root = useRef<Root | null>(null)
  const log = useRef<HTMLOListElement>(null)
  const [stats, setStats] = useState({ renders: 0, playRenders: 0, frames: 0 })
  const atPlay = useRef({ renders: 0, frames: 0 })

  useLayoutEffect(() => {
    root.current ??= createRoot(host.current!)
    root.current.render(<Wave peaks={peaks} player={player} />)
  }, [peaks, player])
  useEffect(() => () => { const r = root.current; root.current = null; setTimeout(() => r?.unmount()) }, [])

  // Every DOM change inside the waveform, written to the log once per frame. The log is
  // a fixed-height box written directly, so it never moves the page or renders React.
  useEffect(() => {
    const el = host.current!, out = log.current!
    let pending: MutationRecord[] = []
    let frames = 0
    const mo = new MutationObserver((records) => { pending.push(...records) })
    mo.observe(el, { subtree: true, attributes: true, characterData: true, childList: true })
    let raf = 0
    const tick = () => {
      frames++
      if (pending.length) {
        // One entry per part and change, with how many times it happened this frame.
        const seen = new Map<string, { n: number; value: string }>()
        for (const r of pending) {
          const key = `${partOf(r.target)} ${r.type === 'attributes' ? r.attributeName : 'text'}`
          const s = seen.get(key)
          if (s) s.n++
          else seen.set(key, { n: 1, value: valueOf(r) })
        }
        pending = []
        const line = document.createElement('li')
        line.innerHTML = `<span class="mr-3.5 whitespace-pre text-ink-3">${player.time.toFixed(2).padStart(6, ' ')}</span>` +
          [...seen].map(([k, v]) => `<span class="text-ink">${k}${v.n > 1 ? ` ×${v.n}` : ''}</span> ${v.value}`).join('<span class="text-ink-3"> · </span>')
        out.append(line)
        while (out.children.length > LINES) out.firstElementChild!.remove()
        out.dataset.on = ''
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const show = setInterval(() => {
      const renders = commitsOf(el)
      setStats({ renders, playRenders: renders - atPlay.current.renders, frames: frames - atPlay.current.frames })
      if (!player.playing) atPlay.current = { renders, frames }
    }, 250)
    return () => { mo.disconnect(); cancelAnimationFrame(raf); clearInterval(show) }
  }, [player])

  return (
    <figure>
      <div ref={host} />
      <div className="mt-12 flex flex-wrap items-center gap-x-9 gap-y-4 narrow:grid narrow:grid-cols-[auto_minmax(0,1fr)] narrow:items-start">
        <PlayButton player={player} label={MUSIC_TITLE} />
        <dl className="flex flex-wrap gap-x-9 gap-y-3 narrow:grid narrow:grid-cols-2 narrow:gap-3">
          <div className={stat}><dt className={dt}>Frames drawn while playing</dt><dd className={dd}>{playing ? stats.frames : '–'}</dd></div>
          <div className={stat}><dt className={dt}>React renders while playing</dt><dd className={dd}>{playing ? stats.playRenders : '–'}</dd></div>
        </dl>
      </div>
      {/* The log: a fixed box, newest line at the bottom, older ones fading out at the top. */}
      <div className="relative mt-8 h-[280px] overflow-hidden rounded-xl bg-plate px-[18px] pt-10 pb-3.5">
        <span className={`${meta} absolute top-3 right-[18px] left-[18px]`}>DOM changes, one line per frame</span>
        <ol
          ref={log}
          aria-hidden
          className="peer flex h-full flex-col justify-end overflow-hidden font-mono text-[12px]/[1.65] whitespace-nowrap text-ink-2 mask-[linear-gradient(transparent,#000_45%)] *:flex-none *:overflow-hidden *:text-ellipsis"
        />
        {/* Hidden once the first line is written. */}
        <span className={`${meta} absolute inset-x-[18px] top-10 bottom-3.5 grid place-items-center text-center peer-data-on:hidden`}>
          Press play, or move your pointer over the waveform.
        </span>
      </div>
    </figure>
  )
}

/** Commits React has made to the root rendered into `el`, counted by the hook in <head>. */
function commitsOf(el: Element) {
  return window.__commits?.get(el) ?? 0
}
