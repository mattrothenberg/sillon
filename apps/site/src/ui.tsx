import { useEffect, useRef, type ReactNode } from 'react'
import { formatTime, usePlayer, usePlayerState, type Player } from '@sillon/react'
import { meta, play, transport } from './cls'

const players = new Set<Player>()

/** What is playing right now, and in which section of the page; read by the rail. */
export type NowPlaying = { player: Player; where: string } | null
let now: NowPlaying = null
const watchers = new Set<() => void>()
const setNow = (next: NowPlaying) => { now = next; watchers.forEach((w) => w()) }
export const nowPlaying = {
  get: () => now,
  subscribe: (w: () => void) => { watchers.add(w); return () => { watchers.delete(w) } },
}

/** A player that pauses every other player on the page when it starts. `where` is its section's id. */
export function useSitePlayer(src: string, where: string): Player {
  const player = usePlayer(src)
  useEffect(() => {
    players.add(player)
    const onPlay = () => {
      players.forEach((p) => p !== player && p.pause())
      setNow({ player, where })
    }
    const onStop = () => { if (now?.player === player) setNow(null) }
    player.audio.addEventListener('play', onPlay)
    player.audio.addEventListener('pause', onStop)
    player.audio.addEventListener('ended', onStop)
    return () => {
      players.delete(player)
      onStop()
      player.audio.removeEventListener('play', onPlay)
      player.audio.removeEventListener('pause', onStop)
      player.audio.removeEventListener('ended', onStop)
    }
  }, [player, where])
  return player
}

export function PlayButton({ player, label }: { player: Player; label: string }) {
  const { playing } = usePlayerState(player)
  return (
    <button className={play} onClick={() => player.toggle()} aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}>
      {playing ? (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4.5 2.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L5.7 1.9a.8.8 0 0 0-1.2.7z" /></svg>
      )}
    </button>
  )
}

export { Looks, Seg } from './islands/Seg'
export { Code, CodeStack } from './islands/Code'

/** "0:12 / 2:02", written straight to the DOM while playing. `known` shows until the audio reports its length. */
export function PlayerTime({ player, known = 0 }: { player: Player; known?: number }) {
  const { duration: reported } = usePlayerState(player)
  const duration = reported || known
  const now = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let last = ''
    return player.onTime((t) => {
      const text = formatTime(t)
      if (text !== last) now.current!.textContent = last = text
    })
  }, [player])
  return <span className={meta}><span ref={now}>0:00</span> / {formatTime(duration)}</span>
}

/** A waveform with its transport underneath: play button, then the time. */
export function Deck({ player, label, children }: { player: Player; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-5">
      {children}
      <div className={transport}>
        <PlayButton player={player} label={label} />
        <PlayerTime player={player} />
      </div>
    </div>
  )
}
