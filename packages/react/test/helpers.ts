import { Peaks } from '../src'

/** Finished peaks for exactly `seconds` of audio (whole buckets): a slow ramp, so every bar differs. */
export function peaksFor(seconds: number, sampleRate = 8000, bucketSize = 250): Peaks {
  const n = Math.round((seconds * sampleRate) / bucketSize)
  return Peaks.from(Array.from({ length: n }, (_, i) => 0.1 + (0.9 * i) / n), { sampleRate, bucketSize })
}

/** The bars in a Shape's clip path: one `M` per bar. */
export const barCount = (root: Element) => (root.querySelector('[data-sillon-shape] path')?.getAttribute('d') ?? '').split('M').length - 1

/** A silent 8-bit mono WAV of `seconds`, as a blob URL: real audio with a known duration, no files. */
export function silentWav(seconds: number, rate = 8000): string {
  const n = Math.round(seconds * rate)
  const b = new DataView(new ArrayBuffer(44 + n))
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); b.setUint32(4, 36 + n, true); str(8, 'WAVE')
  str(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true)
  b.setUint32(24, rate, true); b.setUint32(28, rate, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true)
  str(36, 'data'); b.setUint32(40, n, true)
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128)
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }))
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
