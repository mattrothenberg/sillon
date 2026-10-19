import type { StreamOptions } from '@sillon/core'
import { usePlayer, type Player } from './player'
import { usePeaks, type UsePeaks } from './use-peaks'

export interface UseAudio extends UsePeaks {
  player: Player
}

/**
 * Peaks and a player for one file: the common case. Both halves are
 * available on their own (`usePeaks`, `usePlayer`) for peaks without
 * playback, or playback you already own.
 */
export function useAudio(src: string | null | undefined, options?: StreamOptions): UseAudio {
  const peaks = usePeaks(src, options)
  const player = usePlayer(src ?? undefined)
  return { ...peaks, player }
}
