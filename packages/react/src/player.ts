import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** A span of time, in seconds. */
export interface Span {
  start: number
  end: number
}

/** A thin wrapper over an `<audio>` (or `<video>`) element with a per-frame clock. */
export interface Player {
  /**
   * The element itself, for anything else: `volume`, `muted`, `playbackRate`,
   * `crossOrigin`. An `<audio>` the player made, or the element you passed to `createPlayer`.
   */
  readonly audio: HTMLMediaElement
  /** Current time, in seconds. */
  readonly time: number
  /** Duration in seconds, or 0 until known. */
  readonly duration: number
  readonly playing: boolean
  /** The element's error, if loading or playing failed, else null. */
  readonly error: MediaError | null
  /** The span set with `setLoop`, or null. */
  readonly loop: Span | null
  /** Starts playback. Rejects if the browser refuses, for example before any user gesture. */
  play(): Promise<void>
  pause(): void
  /** Plays if paused, pauses if playing. A refused play is ignored. */
  toggle(): void
  /** Pauses and goes back to the start. */
  stop(): void
  /** Moves to `seconds`, and tells `onTime` listeners right away. */
  seek(seconds: number): void
  /** Moves by `seconds` (negative to go back), within the audio. */
  skip(seconds: number): void
  /**
   * Repeats a span: when playback reaches `end` from inside the span, it
   * jumps back to `start`. Seeking outside the span plays on normally until
   * playback enters it again. Keeps working in background tabs. `null` stops.
   */
  setLoop(span: Span | null): void
  /** Called every animation frame while playing, and on every seek. */
  onTime(listener: (seconds: number) => void): () => void
  /** Called when playing, duration, ended, error or loop state changes. */
  subscribe(listener: () => void): () => void
  /**
   * Stops listening to the element and drops every listener. For players from
   * `createPlayer`, when you're done with one; `usePlayer` manages its own.
   */
  destroy(): void
}

/**
 * A player, usable outside React or shared between components. Given a URL,
 * or nothing, it creates an `<audio>` element with `preload="metadata"`. Given
 * an element, such as a `<video>` on the page, it plays through that one, as is.
 * Needs a browser.
 */
export function createPlayer(source?: string | HTMLMediaElement): Player {
  const own = typeof source !== 'object'
  const audio: HTMLMediaElement = own ? new Audio() : source
  if (own) {
    audio.preload = 'metadata'
    if (source) audio.src = source
  }
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
  const quietPlay = () => void audio.play().catch(() => {})
  // A loop that runs to the end of the file: the element stops there, so start it again.
  const ended = () => { if (wrap()) quietPlay() }
  const events: [string, () => void][] = [
    ...['play', 'pause', 'ended', 'durationchange', 'loadedmetadata', 'error', 'emptied'].map((e) => [e, changed] as [string, () => void]),
    ...['play', 'pause', 'seeked', 'ratechange'].map((e) => [e, arm] as [string, () => void]),
    ['seeked', tick], ['ended', ended],
  ]
  for (const [e, f] of events) audio.addEventListener(e, f)
  const seek = (seconds: number) => {
    inside = within(Math.max(0, seconds))
    audio.currentTime = Math.max(0, seconds)
    // Report straight away so scrubbing doesn't wait on the media pipeline.
    for (const l of timeListeners) l(audio.currentTime)
  }

  return {
    audio,
    get time() { return audio.currentTime },
    get duration() { return duration() },
    get playing() { return !audio.paused },
    get error() { return audio.error },
    get loop() { return loop },
    play: () => audio.play(),
    pause: () => audio.pause(),
    toggle: () => (audio.paused ? quietPlay() : audio.pause()),
    stop() {
      audio.pause()
      seek(0)
    },
    seek,
    skip(seconds) {
      seek(Math.min(audio.currentTime + seconds, duration() || Infinity))
    },
    setLoop(span) {
      loop = span && span.end > span.start ? { start: Math.max(0, span.start), end: span.end } : null
      inside = within(audio.currentTime)
      arm()
      for (const l of listeners) l()
    },
    onTime(l) { timeListeners.add(l); return () => timeListeners.delete(l) },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
    destroy() {
      for (const [e, f] of events) audio.removeEventListener(e, f)
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      raf = timer = 0
      timeListeners.clear()
      listeners.clear()
    },
  }
}

/**
 * What `usePlayer` returns while rendering on the server, where there's no
 * `<audio>`: paused at 0, and every method does nothing. The browser renders
 * with a real player from the start, so markup and behavior match.
 */
const serverPlayer: Player = {
  get audio(): HTMLMediaElement { throw new Error('player.audio is only available in the browser') },
  time: 0, duration: 0, playing: false, error: null, loop: null,
  play: () => Promise.resolve(), pause() {}, toggle() {}, stop() {}, seek() {}, skip() {}, setLoop() {},
  onTime: () => noop, subscribe: () => noop, destroy() {},
}

/**
 * One player per component, pointed at `src`; a new `src` loads that file, and
 * no `src` unloads it. On unmount it pauses and lets go of the file. Safe to
 * render on the server: there, it's a stand-in that does nothing.
 */
export function usePlayer(src?: string): Player {
  const [player] = useState(() => (typeof window === 'undefined' ? serverPlayer : createPlayer()))
  useEffect(() => {
    const a = player.audio
    if (src) {
      if (a.getAttribute('src') !== src) a.src = src
    } else if (a.hasAttribute('src')) {
      a.removeAttribute('src')
      a.load()
    }
  }, [player, src])
  useEffect(() => () => {
    player.pause()
    // Stops the download and frees the decoder; the src effect sets it again on a remount.
    player.audio.removeAttribute('src')
    player.audio.load()
  }, [player])
  return player
}

/**
 * `playing`, `duration` (seconds, 0 until known) and `error` (the element's
 * `MediaError`, or null), re-rendering only when they change.
 */
export function usePlayerState(player: Player | null | undefined): { playing: boolean; duration: number; error: MediaError | null } {
  const subscribe = useCallback((l: () => void) => player?.subscribe(l) ?? noop, [player])
  const playing = useSyncExternalStore(subscribe, () => player?.playing ?? false, () => false)
  const duration = useSyncExternalStore(subscribe, () => player?.duration ?? 0, () => 0)
  const error = useSyncExternalStore(subscribe, () => player?.error ?? null, () => null)
  return { playing, duration, error }
}

const noop = () => {}
