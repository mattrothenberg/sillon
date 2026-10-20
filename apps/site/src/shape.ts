import { useMemo, useSyncExternalStore } from 'react'
import { Peaks, usePeaks } from '@sillon/react'
import { DEFAULT_MUSIC, MUSIC, MUSIC_PEAKS } from './music'

/**
 * A song's peaks, small enough to put in the page: the hero and the rail draw
 * their first frame from it, with no request and no placeholder.
 */
export interface Shape { sampleRate: number; bucketSize: number; values: number[] }

/** Seconds of audio the shape covers. */
export const shapeDuration = (s: Shape) => (s.values.length * s.bucketSize) / s.sampleRate

export const peaksOfShape = (s: Shape) => Peaks.from(s.values, { sampleRate: s.sampleRate, bucketSize: s.bucketSize })

/** The song's peaks from its embedded shape, or fetched when a different version is playing (dev only). */
export function useSongPeaks(shape: Shape): Peaks | null {
  const embedded = useMemo(() => peaksOfShape(shape), [shape])
  const fetched = usePeaks(MUSIC === DEFAULT_MUSIC ? null : MUSIC_PEAKS)
  return MUSIC === DEFAULT_MUSIC ? embedded : fetched.peaks
}

/**
 * Fixed bar counts, so bars drawn at build time and on the client line up at
 * any width: phones (up to 640px, as in the CSS) get fewer. Desktop counts give
 * today's 6px and 5px pitch at 1280px.
 */
export const BARS = { hero: { wide: 213, narrow: 65 }, rail: { wide: 196, narrow: 65 } } as const
export const NARROW = '(max-width: 640px)'

const narrowQuery = () => matchMedia(NARROW)
/** True on phone-sized screens; the same breakpoint picks the build-time drawing. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (on) => { const q = narrowQuery(); q.addEventListener('change', on); return () => q.removeEventListener('change', on) },
    () => narrowQuery().matches,
    () => false,
  )
}
