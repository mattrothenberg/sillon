// The song's bars, drawn at build time into the page, so the hero and the rail
// show their waveform before any JavaScript runs. The bars come from the
// library's own barsPath, so the client draws the same thing in the same place.
import { readFileSync } from 'node:fs'
import { Peaks } from '@sillon/core'
import { barsPath, fitBars, type WaveformState } from '@sillon/react'
import { peaksOfShape, type Shape } from '../shape'

/** Reads a .peaks file from public/ and reduces it to about `n` values (each the loudest of its span). */
export function shapeOf(publicPath: string, n = 1500): Shape {
  const b = readFileSync(`${process.cwd()}/public${publicPath}`)
  const p = Peaks.decode(new Uint8Array(b).buffer)
  const all = p.toArray(), k = Math.max(1, Math.ceil(all.length / n))
  const values: number[] = []
  for (let i = 0; i < all.length; i += k) {
    let m = 0
    for (let j = i; j < i + k && j < all.length; j++) if (all[j] > m) m = all[j]
    // Whole numbers keep the page small; heights are normalized anyway.
    values.push(Math.round((m / p.max) * 255))
  }
  return { sampleRate: p.sampleRate, bucketSize: p.bucketSize * k, values }
}

export interface Geometry { width: number; height: number; bars: number; barWidth: number; barGap: number; barRadius: number; align: 'center' | 'top' | 'bottom'; contrast: number }

/**
 * The path of every bar, as the client draws it at `width`. With a fixed number
 * of bars, scaling this drawing to any other width gives what the client draws there.
 */
export function silhouette(shape: Shape, g: Geometry): string {
  const peaks = peaksOfShape(shape)
  const state = {
    ...g, ...fitBars(g.width, g.bars, g.barWidth, g.barGap), minBarHeight: 1, normalize: true, smoothing: 0, peaks, player: null,
    start: 0, end: peaks.duration, hover: null, gain: peaks.max ? 1 / peaks.max : 1,
    progressive: false, reveal: false, revealed: Infinity,
  } as unknown as WaveformState
  return barsPath(state)
}
