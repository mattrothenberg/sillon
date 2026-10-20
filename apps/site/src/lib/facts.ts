// Facts about the site's own audio files, read at build time with the same MP3
// parser the library uses, so the page never states a number by hand.
import { readFileSync } from 'node:fs'
import { id3Size, parseHeader, parseGapless } from '@sillon/core/mp3'

/** Samples per level-0 peak, the library's default. */
export const BUCKET = 256

export interface Mp3Facts {
  bytes: number
  sampleRate: number
  channels: number
  bitrate: number
  /** Audio samples per channel after gapless trimming. */
  samples: number
  duration: number
  /** Encoder priming and end padding, from the LAME tag. */
  delay: number
  padding: number
}

export function mp3Facts(publicPath: string): Mp3Facts {
  const b = new Uint8Array(readFileSync(`${process.cwd()}/public${publicPath}`))
  let i = id3Size(b)
  while (i < b.length && !parseHeader(b, i)) i++
  const f = parseHeader(b, i)!
  const g = parseGapless(b, i, f)
  if (!g?.frames) throw new Error(`${publicPath}: no Xing/Info frame count`)
  const samples = g.frames * f.samples - g.delay - g.padding
  return { bytes: b.length, sampleRate: f.sampleRate, channels: f.channels, bitrate: f.bitrate, samples, duration: samples / f.sampleRate, delay: g.delay, padding: g.padding }
}

export const MB = 1024 * 1024

/** What holding a file's samples costs: one 32-bit float per sample per channel. */
export const pcmBytes = (seconds: number, rate: number, channels: number) => seconds * rate * channels * 4

/**
 * What sillon's peaks cost: one float per 256 samples at level 0, and each zoom
 * level above it half the size of the one below, so all of them come to about
 * twice level 0. Growable arrays may reserve up to as much again while streaming.
 */
export const peaksBytes = (samples: number) => {
  const level0 = Math.ceil(samples / BUCKET)
  let total = 0
  for (let n = level0; n > 1; n = Math.ceil(n / 2)) total += n
  return { level0, levels: Math.ceil(Math.log2(level0)) + 1, bytes: (total + 1) * 4 }
}
