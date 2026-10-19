// Minimal MPEG audio Layer III frame-header parser — just enough to slice a
// byte stream into frames for WebCodecs' AudioDecoder.
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const SR = [44100, 48000, 32000]

export interface Frame { len: number; sampleRate: number; channels: number; samples: number; bitrate: number }

export function parseHeader(b: Uint8Array, i: number): Frame | null {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null
  const ver = (b[i + 1] >> 3) & 3 // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1] >> 1) & 3
  const bri = b[i + 2] >> 4
  const sri = (b[i + 2] >> 2) & 3
  if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null
  const mpeg1 = ver === 3
  const bitrate = (mpeg1 ? BR1 : BR2)[bri] * 1000
  const sampleRate = SR[sri] / (mpeg1 ? 1 : ver === 2 ? 2 : 4)
  const samples = mpeg1 ? 1152 : 576
  const len = Math.floor(((samples / 8) * bitrate) / sampleRate) + ((b[i + 2] >> 1) & 1)
  const channels = b[i + 3] >> 6 === 3 ? 1 : 2
  return { len, sampleRate, channels, samples, bitrate }
}

/** Bytes to skip for a leading ID3v2 tag, or 0. Needs >= 10 bytes. */
export function id3Size(b: Uint8Array): number {
  if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]
  return 10 + size + (b[5] & 0x10 ? 10 : 0)
}

export interface Gapless { frames: number; delay: number; padding: number }

/**
 * Reads the Xing/Info header (and LAME extension) an encoder writes into the
 * first frame. That frame is metadata, not audio, and the LAME tag records how
 * many priming/padding samples to trim for sample-accurate timing.
 */
export function parseGapless(b: Uint8Array, i: number, f: Frame): Gapless | null {
  const mpeg1 = f.samples === 1152
  const side = mpeg1 ? (f.channels === 1 ? 17 : 32) : f.channels === 1 ? 9 : 17
  const x = i + 4 + side
  const tag = String.fromCharCode(b[x], b[x + 1], b[x + 2], b[x + 3])
  if (tag !== 'Xing' && tag !== 'Info') return null
  const flags = b[x + 7]
  let p = x + 8
  let frames = 0
  if (flags & 1) { frames = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; p += 4 }
  if (flags & 2) p += 4
  if (flags & 4) p += 100
  if (flags & 8) p += 4
  let delay = 0, padding = 0
  // LAME writes "LAME"; ffmpeg's libmp3lame wrapper writes "Lavc"/"Lavf".
  const enc = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])
  if (p + 24 <= i + f.len && (enc === 'LAME' || enc === 'Lavc' || enc === 'Lavf')) {
    delay = (b[p + 21] << 4) | (b[p + 22] >> 4)
    padding = ((b[p + 22] & 0x0f) << 8) | b[p + 23]
  }
  return { frames, delay, padding }
}
