import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export interface Span {
  start: number
  end: number
}

/** A thin wrapper over an <audio> element with a per-frame clock. */
export interface Player {
  readonly audio: HTMLAudioElement
  readonly time: number
  readonly duration: number
  readonly playing: boolean
  /** The span set with `setLoop`, or null. */
  readonly loop: Span | null
  play(): Promise<void>
  pause(): void
  toggle(): void
  seek(seconds: number): void
  /**
   * Repeats a span: when playback reaches `end` from inside the span, it
   * jumps back to `start`. Seeking outside the span plays on normally until
   * playback enters it again. Keeps working in background tabs. `null` stops.
   */
  setLoop(span: Span | null): void
  /** Called every animation frame while playing, and on every seek. */
  onTime(listener: (seconds: number) => void): () => void
  /** Called when playing, duration, ended or loop state changes. */
  subscribe(listener: () => void): () => void
}

export function createPlayer(src?: string): Player {
  const audio = new Audio()
  audio.preload = 'metadata'
  if (src) audio.src = src
  const timeListeners = new Set<(t: number) => void>()
  const listeners = new Set<() => void>()
  let raf = 0

  // Looping. `inside` is true while playback is within the loop, so only
  // reaching the end from inside wraps; a seek past the end plays on.
  let loop: Span | null = null, inside = false, timer = 0
  const duration = () => (Number.isFinite(audio.duration) ? audio.duration : 0)
  const end = (l: Span) => Math.min(l.end, duration() || Infinity)
  const within = (t: number) => !!loop && t >= loop.start && t < end(loop)
  /** Jumps back to the start if playback has reached the end from inside. True if it did. */
  const wrap = () => {
    if (!loop) return false
    const t = audio.currentTime
    if (inside && t >= end(loop)) {
      audio.currentTime = loop.start
      return true
    }
    inside = within(t)
    return false
  }
  // Frames stop in background tabs and are up to 16 ms late; a timer aimed at the end catches both.
  const arm = () => {
    clearTimeout(timer)
    if (!loop || audio.paused || !inside) return
    const ms = ((end(loop) - audio.currentTime) / (audio.playbackRate || 1)) * 1000
    timer = window.setTimeout(() => void (wrap() || arm()), Math.max(0, ms))
  }

  const tick = () => {
    wrap()
    for (const l of timeListeners) l(audio.currentTime)
    raf = audio.paused ? 0 : requestAnimationFrame(tick)
  }
  const changed = () => {
    for (const l of listeners) l()
    if (!audio.paused && !raf) raf = requestAnimationFrame(tick)
  }
  for (const e of ['play', 'pause', 'ended', 'durationchange', 'loadedmetadata']) audio.addEventListener(e, changed)
  for (const e of ['play', 'pause', 'seeked', 'ratechange']) audio.addEventListener(e, arm)
  audio.addEventListener('seeked', tick)
  // A loop that runs to the end of the file: the element stops there, so start it again.
  audio.addEventListener('ended', () => void (wrap() && audio.play()))

  return {
    audio,
    get time() { return audio.currentTime },
    get duration() { return duration() },
    get playing() { return !audio.paused },
    get loop() { return loop },
    play: () => audio.play(),
    pause: () => audio.pause(),
    toggle: () => void (audio.paused ? audio.play() : audio.pause()),
    seek(seconds) {
      inside = within(Math.max(0, seconds))
      audio.currentTime = Math.max(0, seconds)
      // Report straight away so scrubbing doesn't wait on the media pipeline.
      for (const l of timeListeners) l(audio.currentTime)
    },
    setLoop(span) {
      loop = span && span.end > span.start ? { start: Math.max(0, span.start), end: span.end } : null
      inside = within(audio.currentTime)
      arm()
      for (const l of listeners) l()
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
