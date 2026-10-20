import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { createPlayer, usePlayer, type Player } from '../src'
import { silentWav } from './helpers'

const loaded = (player: Player) => new Promise<void>((resolve) => {
  if (player.duration) return resolve()
  const off = player.subscribe(() => player.duration && (off(), resolve()))
})

describe('Player', () => {
  test('skip stays within the audio, and stop pauses at 0', async () => {
    const player = createPlayer(silentWav(20))
    await loaded(player)
    player.seek(5)
    player.skip(4)
    expect(player.time).toBeCloseTo(9)
    player.skip(-20)
    expect(player.time).toBe(0)
    player.skip(100)
    expect(player.time).toBeCloseTo(20)
    player.stop()
    expect(player.time).toBe(0)
    expect(player.playing).toBe(false)
  })

  test('plays through an element you pass, as is', async () => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.src = silentWav(4)
    const player = createPlayer(video)
    expect(player.audio).toBe(video)
    expect(video.preload).toBe('auto')
    await loaded(player)
    expect(player.duration).toBeCloseTo(4)
  })

  test('reports a load error', async () => {
    const player = createPlayer('data:audio/mpeg;base64,AAAA')
    await new Promise<void>((resolve) => player.subscribe(() => player.error && resolve()))
    expect(player.error).toBeInstanceOf(MediaError)
  })

  test('toggle swallows a refused play', async () => {
    const player = createPlayer('data:audio/mpeg;base64,AAAA')
    const unhandled: unknown[] = []
    const on = (e: PromiseRejectionEvent) => { unhandled.push(e.reason); e.preventDefault() }
    window.addEventListener('unhandledrejection', on)
    player.toggle()
    await new Promise((r) => setTimeout(r, 200))
    window.removeEventListener('unhandledrejection', on)
    expect(unhandled).toEqual([])
  })

  test('destroy stops notifying', async () => {
    const player = createPlayer(silentWav(4))
    let calls = 0
    player.subscribe(() => calls++)
    player.destroy()
    await new Promise((r) => setTimeout(r, 200))
    expect(calls).toBe(0)
  })
})

describe('usePlayer', () => {
  test('lets go of the file without a src, and on unmount', async () => {
    const src = silentWav(4)
    let audio: HTMLMediaElement | null = null
    function Grab({ src }: { src?: string }) {
      audio = usePlayer(src).audio
      return null
    }
    const screen = await render(<Grab src={src} />)
    expect(audio!.getAttribute('src')).toBe(src)
    await screen.rerender(<Grab />)
    expect(audio!.hasAttribute('src')).toBe(false)
    await screen.rerender(<Grab src={src} />)
    expect(audio!.getAttribute('src')).toBe(src)
    await screen.unmount()
    expect(audio!.hasAttribute('src')).toBe(false)
  })
})
