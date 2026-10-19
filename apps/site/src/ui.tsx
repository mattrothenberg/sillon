import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatTime, usePlayer, usePlayerState, type Player } from '@sillon/react'

const players = new Set<Player>()

/** A player that pauses every other player on the page when it starts. */
export function useSitePlayer(src: string): Player {
  const player = usePlayer(src)
  useEffect(() => {
    players.add(player)
    const onPlay = () => players.forEach((p) => p !== player && p.pause())
    player.audio.addEventListener('play', onPlay)
    return () => {
      players.delete(player)
      player.audio.removeEventListener('play', onPlay)
    }
  }, [player])
  return player
}

export function PlayButton({ player, label }: { player: Player; label: string }) {
  const { playing } = usePlayerState(player)
  return (
    <button className="play" onClick={() => player.toggle()} aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}>
      {playing ? (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4.5 2.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L5.7 1.9a.8.8 0 0 0-1.2.7z" /></svg>
      )}
    </button>
  )
}

export function Seg<T extends string>({ value, options, onChange, label, small }: {
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
  small?: boolean
}) {
  return (
    <div className={small ? 'seg small' : 'seg'} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export { Code, CodeTabs } from './code'

/** "0:12 / 2:02", written straight to the DOM while playing. */
export function PlayerTime({ player }: { player: Player }) {
  const { duration } = usePlayerState(player)
  const now = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let last = ''
    return player.onTime((t) => {
      const text = formatTime(t)
      if (text !== last) now.current!.textContent = last = text
    })
  }, [player])
  return <span className="meta"><span ref={now}>0:00</span> / {formatTime(duration)}</span>
}

/** A waveform with its transport underneath: play button, then the time. */
export function Deck({ player, label, children }: { player: Player; label: string; children: ReactNode }) {
  return (
    <div className="deck">
      {children}
      <div className="transport">
        <PlayButton player={player} label={label} />
        <PlayerTime player={player} />
      </div>
    </div>
  )
}

type ThemeChoice = 'system' | 'light' | 'dark'

/** Starts on the system theme; one click flips to the other. Saved per browser; the inline script in index.html applies it before paint. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeChoice>(() => (document.documentElement.dataset.theme as ThemeChoice) ?? 'system')
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const choose = (t: ThemeChoice) => {
    setTheme(t)
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('theme', t) } catch {}
  }
  return (
    <button className="theme-toggle" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light' : 'Dark'} onClick={() => choose(dark ? 'light' : 'dark')}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
        {dark ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1.1 1.1M14.6 14.6l1.1 1.1M4.3 15.7l1.1-1.1M14.6 5.4l1.1-1.1" />
          </g>
        ) : (
          <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  )
}
