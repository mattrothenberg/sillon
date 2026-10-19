import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** A thin wrapper over an <audio> element with a per-frame clock. */
export interface Player {
  readonly audio: HTMLAudioElement
  readonly time: number
  readonly duration: number
  readonly playing: boolean
  play(): Promise<void>
  pause(): void
  toggle(): void
  seek(seconds: number): void
  /** Called every animation frame while playing, and on every seek. */
  onTime(listener: (seconds: number) => void): () => void
  /** Called when playing, duration or ended state changes. */
  subscribe(listener: () => void): () => void
}

export function createPlayer(src?: string): Player {
  const audio = new Audio()
  audio.preload = 'metadata'
  if (src) audio.src = src
  const timeListeners = new Set<(t: number) => void>()
  const listeners = new Set<() => void>()
  let raf = 0

  const tick = () => {
    for (const l of timeListeners) l(audio.currentTime)
    raf = audio.paused ? 0 : requestAnimationFrame(tick)
  }
  const changed = () => {
    for (const l of listeners) l()
    if (!audio.paused && !raf) raf = requestAnimationFrame(tick)
  }
  for (const e of ['play', 'pause', 'ended', 'durationchange', 'loadedmetadata']) audio.addEventListener(e, changed)
  audio.addEventListener('seeked', tick)

  return {
    audio,
    get time() { return audio.currentTime },
    get duration() { return Number.isFinite(audio.duration) ? audio.duration : 0 },
    get playing() { return !audio.paused },
    play: () => audio.play(),
    pause: () => audio.pause(),
    toggle: () => void (audio.paused ? audio.play() : audio.pause()),
    seek(seconds) {
      audio.currentTime = Math.max(0, seconds)
      // Report straight away so scrubbing doesn't wait on the media pipeline.
      for (const l of timeListeners) l(audio.currentTime)
    },
    onTime(l) { timeListeners.add(l); return () => timeListeners.delete(l) },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
  }
}

/** One player per component, pointed at `src`. Pauses on unmount. */
export function usePlayer(src?: string): Player {
  const [player] = useState(() => createPlayer())
  useEffect(() => {
    if (src && player.audio.getAttribute('src') !== src) player.audio.src = src
  }, [player, src])
  useEffect(() => () => player.pause(), [player])
  return player
}

/** `playing` and `duration`, re-rendering only when they change. */
export function usePlayerState(player: Player | null | undefined): { playing: boolean; duration: number } {
  const subscribe = useCallback((l: () => void) => player?.subscribe(l) ?? noop, [player])
  const playing = useSyncExternalStore(subscribe, () => player?.playing ?? false, () => false)
  const duration = useSyncExternalStore(subscribe, () => player?.duration ?? 0, () => 0)
  return { playing, duration }
}

const noop = () => {}
