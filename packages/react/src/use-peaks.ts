import { useEffect, useState } from 'react'
import { streamPeaks, type Peaks, type PeakStream, type StreamOptions, type StreamStats } from '@sillon/core'

interface Entry { stream: PeakStream; refs: number }
// Shared by URL, so two waveforms of the same file decode it once.
const cache = new Map<string, Entry>()

function acquire(url: string, options?: StreamOptions): Entry {
  let e = cache.get(url)
  if (!e) cache.set(url, (e = { stream: streamPeaks(url, options), refs: 0 }))
  e.refs++
  return e
}

function release(url: string, e: Entry) {
  e.refs--
  // Deferred, so a remount (or React's dev double-mount) picks the stream back up.
  setTimeout(() => {
    if (e.refs || e.stream.peaks.complete || cache.get(url) !== e) return
    e.stream.cancel()
    cache.delete(url)
  }, 1000)
}

export interface UsePeaks {
  /** Null on the first render and without a URL; after that, a Peaks that fills in as the file streams. */
  peaks: Peaks | null
  /** Milliseconds until the first buckets arrived. */
  firstMs: number | null
  /** How the file was read and how long it took, once complete. */
  stats: StreamStats | null
  /** Set if loading failed. */
  error: Error | null
}

/**
 * Streams peaks for an audio file, or reads a `.peaks` file (see `streamPeaks`).
 * Streams are shared by URL, so two waveforms of one file load it once;
 * `options` are those of the first caller. Pass precomputed `Peaks` straight
 * to `Waveform.Root` instead if you have them.
 */
export function usePeaks(url: string | null | undefined, options?: StreamOptions): UsePeaks {
  const [state, setState] = useState<UsePeaks & { url?: string | null }>({ peaks: null, firstMs: null, stats: null, error: null })
  useEffect(() => {
    if (!url) return
    const e = acquire(url, options)
    let live = true
    const set = (patch: Partial<UsePeaks>) => live && setState((s) => (s.url === url ? { ...s, ...patch } : s))
    setState({ url, peaks: e.stream.peaks, firstMs: null, stats: null, error: null })
    e.stream.first.then((firstMs) => set({ firstMs }))
    e.stream.done.then((stats) => set({ stats }), (error) => set({ error }))
    return () => {
      live = false
      release(url, e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options are read once per URL
  }, [url])
  return state.url === url ? state : { peaks: null, firstMs: null, stats: null, error: null }
}
