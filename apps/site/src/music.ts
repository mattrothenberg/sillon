/** Versions of the demo music, while one is being chosen. Switching reloads, since every demo streams the file. */
export const MUSICS = [
  { id: 'avril', label: 'Piano' },
  { id: 'avril-vibes', label: 'Vibraphone' },
  { id: 'avril-marimba', label: 'Marimba' },
  { id: 'avril-bowed', label: 'Bowed' },
] as const

export const musicSrc = () => {
  let id = 'avril'
  try { if (import.meta.env.DEV) id = localStorage.getItem('music') ?? id } catch {}
  return `/audio/${MUSICS.some((m) => m.id === id) ? id : 'avril'}.mp3`
}

/** The version the page is built with; the hero and rail embed its shape. */
export const DEFAULT_MUSIC = '/audio/avril.mp3'
export const MUSIC = musicSrc()
/** The same song's peaks, made ahead of time (scripts/peaks.mjs): waveforms draw from 21 kB, and the audio loads only to play. */
export const MUSIC_PEAKS = MUSIC.replace(/\.mp3$/, '.peaks')
export const MUSIC_TITLE = 'Avril 14th'
