import { Waveform as Parts } from './waveform'
import { GL } from './gl'

/**
 * Headless waveform parts.
 *
 *   <Waveform.Root peaks={peaks} player={player}>
 *     <Waveform.Shape>
 *       <Waveform.Track className="track" />
 *       <Waveform.Progress className="played" />
 *     </Waveform.Shape>
 *     <Waveform.Cursor className="cursor" />
 *   </Waveform.Root>
 */
export const Waveform = { ...Parts, GL }

export { useWaveform, useWaveformStore, useGroups, useActive, isReady, barsPath, formatTime, timeToX, WaveformStore } from './waveform'
export type { Change, WaveformState, Geometry, RootProps, ShapeProps, RegionProps, TimeProps, MarkerProps, SkeletonProps, Group } from './waveform'
export type { GLProps } from './gl'
export { createPlayer, usePlayer, usePlayerState, type Player } from './player'
export { usePeaks, type UsePeaks } from './use-peaks'
export { useAudio, type UseAudio } from './use-audio'
export { Peaks, streamPeaks, findSilences, summarize } from '@sillon/core'
export type { Span, Summary, StreamStats } from '@sillon/core'
export { Visualizer, type VisualizerProps } from './visualizer'
