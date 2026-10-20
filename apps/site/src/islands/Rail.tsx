import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { Waveform, formatTime } from '@sillon/react'
import { BARS, useNarrow, useSongPeaks, type Shape } from '../shape'
import { markSvg } from '../lib/mark'
import { nowPlaying, type NowPlaying } from '../ui'
import { meta, mono, shape as fadeShape } from '../cls'

// The page as a track. The song's own waveform runs across the top of the page:
// the sections are its regions, the scroll position is the playhead, and
// clicking or dragging it scrolls the page. The clock counts reading time; while a
// demo plays, its place is taken by what's playing, with a pause button.

interface Chapter { id: string; title: string; a: number; b: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** A section becomes current once its top passes this line, a third of the way down the screen. */
const line = () => innerHeight * 0.35
const WORDS_PER_MINUTE = 200

// Shared with the page's fallback, which holds the rail's place until this island loads.
export const rail = 'grid grid-cols-[22px_minmax(0,1fr)_176px] items-end gap-5 px-8 pt-2.5 pb-3 [--p:0] narrow:grid-cols-[22px_minmax(0,1fr)] narrow:gap-3 narrow:px-(--gutter)'
export const railLead = 'mb-1 block size-[22px]'
export const railMark = 'block h-[22px] text-ink'
export const railLabels = 'relative mb-[7px] h-[18px]'
export const railWave = 'relative h-[30px] cursor-pointer touch-none overflow-x-clip'
export const railEnd = 'flex min-w-0 justify-end narrow:hidden'

/** Labels and the clock need the page measured first, so they arrive after the bars: fade, don't pop. */
const fadeIn = 'transition-opacity duration-160 ease-out starting:opacity-0 motion-reduce:transition-none'
const label = `${fadeIn} absolute top-0 border-l border-edge pl-1.5 font-mono text-[11px]/[18px] whitespace-nowrap text-ink-3 no-underline hover:text-ink aria-[current=location]:border-accent aria-[current=location]:text-accent`
/** A label's number; its section's demo playing gives it a dot. */
const labelN = 'mr-1.5 in-data-playing:before:mr-[5px] in-data-playing:before:inline-block in-data-playing:before:size-1.5 in-data-playing:before:rounded-full in-data-playing:before:bg-accent in-data-playing:before:align-[1px]'

export function Rail({ shape }: { shape: Shape }) {
  const peaks = useSongPeaks(shape)
  const bars = useNarrow() ? BARS.rail.narrow : BARS.rail.wide
  const nav = useRef<HTMLElement>(null)
  const wave = useRef<HTMLDivElement>(null)
  const hover = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [current, setCurrent] = useState(-1)
  const playing = useSyncExternalStore(nowPlaying.subscribe, nowPlaying.get, () => null)
  // Where the sections start and how tall they are, in page coordinates, plus the reading time in seconds.
  const page = useRef({ top: 0, height: 1, total: 60, chapters: [] as Chapter[] })

  useEffect(() => {
    const main = document.querySelector('main')!
    let cur = -1, lastClock = ''
    // Scroll work is one rect-free calculation and two style writes; state changes only at a boundary.
    const update = () => {
      const { top, height, total, chapters } = page.current
      const p = clamp((scrollY + line() - top) / height, 0, 1)
      nav.current!.style.setProperty('--p', p.toFixed(4))
      const text = `${formatTime(p * total)} / ${formatTime(total)}`
      if (text !== lastClock) clock.current!.textContent = lastClock = text
      let k = -1
      if (scrollY + line() >= top) chapters.forEach((c, i) => { if (c.a <= p) k = i })
      if (k !== cur) setCurrent((cur = k))
    }
    const measure = () => {
      const sections = [...main.querySelectorAll<HTMLElement>(':scope > section[data-chapter]')]
      if (!sections.length) return
      const tops = sections.map((s) => s.getBoundingClientRect().top + scrollY)
      const top = tops[0], height = sections.at(-1)!.getBoundingClientRect().bottom + scrollY - top
      const words = main.innerText.split(/\s+/).length
      const list = sections.map((s, i) => ({ id: s.id, title: s.dataset.chapter!, a: (tops[i] - top) / height, b: i + 1 < tops.length ? (tops[i + 1] - top) / height : 1 }))
      page.current = { top, height, total: Math.round((words / WORDS_PER_MINUTE) * 60), chapters: list }
      setChapters(list)
      update()
    }
    // Demos mount and grow after the page loads, so the sections move; measure whenever main changes size.
    const ro = new ResizeObserver(measure)
    ro.observe(main)
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', measure)
    return () => { ro.disconnect(); removeEventListener('scroll', update); removeEventListener('resize', measure) }
  }, [])

  // A label shows only its number when its section is too short on the rail for the name.
  useLayoutEffect(() => {
    const w = wave.current!.offsetWidth
    ;[...labels.current!.children].forEach((el, i) => {
      const c = chapters[i]
      el.removeAttribute('data-tight')
      el.toggleAttribute('data-tight', (c.b - c.a) * w < (el as HTMLElement).offsetWidth + 12)
    })
  }, [chapters])

  const frac = (e: PointerEvent) => { const r = wave.current!.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) }
  const seek = (f: number) => {
    const { top, height } = page.current
    scrollTo({ top: top + f * height - line() + 1, behavior: 'instant' })
  }
  const showHover = (f: number) => {
    const { chapters, total } = page.current
    let k = 0
    chapters.forEach((c, i) => { if (c.a <= f) k = i })
    hover.current!.style.transform = `translateX(${f * wave.current!.offsetWidth}px)`
    hover.current!.dataset.on = ''
    tip.current!.textContent = `${chapters[k]?.title ?? ''} · ${formatTime(f * total)}`
    wave.current!.querySelectorAll('[data-seg]').forEach((s, i) => s.toggleAttribute('data-hover', i === k))
  }
  const hideHover = () => {
    delete hover.current!.dataset.on
    wave.current!.querySelectorAll('[data-seg]').forEach((s) => s.removeAttribute('data-hover'))
  }

  return (
    <nav ref={nav} className={rail} aria-label="Sections">
      {/* Fixed-size slots on both sides, so what's playing never changes the waveform's width.
          On phones the pause button takes the mark's place. */}
      <span className={`${railLead} narrow:[&:has(button)>a]:hidden`}>
        <a className={railMark} href="#top" aria-label="Back to top" dangerouslySetInnerHTML={{ __html: markSvg('mark-rail', 22) }} />
        {playing && <PauseButton className="hidden narrow:grid" onClick={() => playing.player.pause()} label="Pause" />}
      </span>
      <div className="min-w-0">
        <div ref={labels} className={railLabels}>
          {chapters.map((c, i) => (
            <a key={c.id} className={label} href={`#${c.id}`} style={{ left: `${c.a * 100}%` }} aria-current={i === current ? 'location' : undefined} data-playing={playing?.where === c.id ? '' : undefined}>
              <span className={labelN}>{String(i + 1).padStart(2, '0')}</span><span className="in-data-tight:hidden">{c.title}</span>
            </a>
          ))}
        </div>
        <div
          ref={wave}
          className={railWave}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(frac(e)) }}
          onPointerMove={(e) => { const f = frac(e); if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(f); showHover(f) }}
          onPointerLeave={hideHover}
        >
          {chapters.map((c, i) => (
            <i
              key={c.id}
              className="pointer-events-none absolute -top-[5px] -bottom-[5px] rounded-[4px] transition-[background] duration-120 data-current:bg-accent/12 data-hover:not-data-current:bg-ink/5"
              data-seg=""
              data-current={i === current ? '' : undefined}
              style={{ left: `${c.a * 100}%`, width: `${(c.b - c.a) * 100}%` }}
            />
          ))}
          <Waveform.Root peaks={peaks} interactive={false} bars={bars} barWidth={3} barGap={2} barRadius={1} align="bottom" className="h-full cursor-[inherit]">
            <Waveform.Shape className={fadeShape}>
              <Waveform.Track className="bg-track" />
              {/* Not Waveform.Progress: this one follows the scroll, not a player. Anything inside Shape shows through the bars. */}
              <div className="absolute inset-0 bg-ink [clip-path:inset(0_calc((1_-_var(--p))_*_100%)_0_0)]" />
            </Waveform.Shape>
          </Waveform.Root>
          {/* The playhead moves by transform only: a full-width layer shifted by the scroll fraction. */}
          <div className="pointer-events-none absolute inset-x-0 -inset-y-1.5 translate-x-[calc(var(--p)*100%)]" aria-hidden>
            <span className="absolute inset-y-0 -left-px w-0.5 rounded-[1px] bg-accent" />
          </div>
          <div
            ref={hover}
            className="pointer-events-none absolute -inset-y-1.5 left-0 -ml-[0.5px] w-px bg-hover-line opacity-0 transition-opacity duration-120 data-on:opacity-100"
            aria-hidden
          >
            <span ref={tip} className="absolute top-[calc(100%+8px)] left-0 -translate-x-1/2 rounded-lg bg-ink px-[9px] py-[5px] font-mono text-[12px]/[1.2] whitespace-nowrap text-paper" />
          </div>
        </div>
      </div>
      <span className={railEnd}>
        <span ref={clock} className={`${meta} ${fadeIn} mb-1.5 whitespace-nowrap`} hidden={!!playing} />
        {playing && <Now playing={playing} title={playing.where === 'top' ? 'Top' : chapters.find((c) => c.id === playing.where)?.title ?? ''} />}
      </span>
    </nav>
  )
}

/** What's playing: a pause button, where it is on the page, and its time, written without re-rendering. */
function Now({ playing: { player, where }, title }: { playing: NonNullable<NowPlaying>; title: string }) {
  const time = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let last = ''
    return player.onTime((t) => {
      const text = formatTime(t)
      if (text !== last) time.current!.textContent = last = text
    })
  }, [player])
  return (
    <span className="mb-0.5 flex min-w-0 items-center gap-2 whitespace-nowrap">
      <PauseButton className="grid" onClick={() => player.pause()} label={`Pause ${title}`} />
      <a href={`#${where}`} className={`${mono} min-w-0 overflow-hidden text-ellipsis text-ink no-underline hover:underline`}>{title}</a>
      <span ref={time} className={meta}>{formatTime(player.time)}</span>
    </span>
  )
}

function PauseButton({ className, onClick, label }: { className: string; onClick: () => void; label: string }) {
  return (
    <button
      className={`${className} size-[22px] flex-none cursor-pointer place-items-center rounded-full border-0 bg-accent p-0 text-white [&_svg]:size-2.5`}
      onClick={onClick}
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
    </button>
  )
}
