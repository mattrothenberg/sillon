import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Waveform, createPlayer, useRecorder, type Recorder } from '../src'
import { barCount, nextFrame } from './helpers'

let rec: Recorder | null = null
function Mic() {
  rec = useRecorder()
  return (
    <>
      <button onClick={() => (rec!.state === 'recording' ? rec!.stop() : rec!.start())}>{rec.state}</button>
      <Waveform.Root peaks={rec.peaks} progressive style={{ width: 300, height: 60 }}>
        <Waveform.Shape />
      </Waveform.Root>
    </>
  )
}

const until = async (ok: () => boolean, ms = 4000) => {
  const t0 = performance.now()
  while (!ok()) {
    if (performance.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('useRecorder', () => {
  test('draws the microphone while recording, then holds the audio', async () => {
    const screen = await render(<Mic />)
    await screen.getByRole('button', { name: 'idle' }).click()
    await until(() => rec!.state === 'recording')
    const peaks = rec!.peaks!
    expect(peaks.complete).toBe(false)
    await until(() => peaks.duration > 0.6)
    await nextFrame()
    const root = screen.container.querySelector('[data-sillon]')!
    expect(root.getAttribute('data-state')).toBe('ready')
    expect(barCount(root)).toBeGreaterThan(0)
    // The fake microphone plays a tone, so the peaks aren't silence.
    expect(peaks.max).toBeGreaterThan(0.01)

    const recorded = peaks.duration
    await screen.getByRole('button', { name: 'recording' }).click()
    await until(() => rec!.state === 'stopped')
    expect(peaks.complete).toBe(true)
    expect(peaks.duration).toBeGreaterThanOrEqual(recorded)
    expect(rec!.blob!.size).toBeGreaterThan(0)
    expect(rec!.url).toMatch(/^blob:/)
    // A finished recording encodes like any other peaks.
    expect(peaks.encode().byteLength).toBeGreaterThan(24)

    // And plays back: seekable, though Chrome's WebM recordings report no duration (the peaks have it).
    const player = createPlayer(rec!.url!)
    await new Promise((r) => player.audio.addEventListener('loadedmetadata', r, { once: true }))
    player.seek(0.3)
    await new Promise((r) => player.audio.addEventListener('seeked', r, { once: true }))
    expect(player.time).toBeCloseTo(0.3, 1)
  })

  test('pausing stops the peaks, and resuming carries on', async () => {
    await render(<Mic />)
    await rec!.start()
    await until(() => (rec!.peaks?.duration ?? 0) > 0.3)
    rec!.pause()
    await until(() => rec!.state === 'paused')
    const at = rec!.peaks!.duration
    await new Promise((r) => setTimeout(r, 400))
    expect(rec!.peaks!.duration).toBeCloseTo(at, 1)
    rec!.resume()
    await until(() => rec!.peaks!.duration > at + 0.2)
    await rec!.stop()
  })

  test('reports a refused microphone', async () => {
    const real = navigator.mediaDevices.getUserMedia
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    try {
      await render(<Mic />)
      await rec!.start()
      await until(() => rec!.error !== null)
      expect(rec!.error!.name).toBe('NotAllowedError')
      expect(rec!.state).toBe('idle')
    } finally {
      navigator.mediaDevices.getUserMedia = real
    }
  })
})
