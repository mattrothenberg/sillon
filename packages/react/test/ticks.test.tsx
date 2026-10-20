import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Waveform, useWaveformStore, type Peaks, type WaveformStore } from '../src'
import { useTicks, type Tick, type TicksOptions } from '../src/ticks'
import { nextFrame, peaksFor } from './helpers'

let ticks: Tick[] = []
let renders = 0
let store: WaveformStore

function Ticks(options: TicksOptions) {
  renders++
  ticks = useTicks(options)
  return ticks.map((t) => (
    <Waveform.Marker key={t.time} time={t.time} data-major={t.major || undefined}>
      {t.major ? t.label : ''}
    </Waveform.Marker>
  ))
}

function Timeline({ peaks, ...options }: TicksOptions & { peaks: Peaks | null }) {
  store = useWaveformStore()
  return (
    <Waveform.Root store={store} peaks={peaks} style={{ width: 600, height: 60 }}>
      <Ticks {...options} />
    </Waveform.Root>
  )
}

const times = () => ticks.map((t) => t.time)

describe('useTicks', () => {
  test('is empty until the duration is known', async () => {
    await render(<Timeline peaks={null} />)
    expect(ticks).toEqual([])
  })

  test('picks the shortest nice interval at least `minGap` apart', async () => {
    // 600 px for 60 s is 10 px a second: 64 px needs 6.4 s, so ticks are 10 s apart.
    await render(<Timeline peaks={peaksFor(60)} />)
    expect(times()).toEqual([0, 10, 20, 30, 40, 50, 60])
    expect(ticks.filter((t) => t.major).map((t) => t.time)).toEqual([0, 60])
    expect(ticks.map((t) => t.label)).toEqual(['0:00', '0:10', '0:20', '0:30', '0:40', '0:50', '1:00'])
  })

  test('follows the zoom, with majors on the longer interval', async () => {
    await render(<Timeline peaks={peaksFor(60)} />)
    store.setView(0, 6)
    await nextFrame()
    // 100 px a second: a tick a second, for a block of 16 around the view.
    expect(times()).toEqual(Array.from({ length: 17 }, (_, i) => i))
    expect(ticks.filter((t) => t.major).map((t) => t.time)).toEqual([0, 5, 10, 15])
  })

  test('re-renders only when the set of ticks changes', async () => {
    await render(<Timeline peaks={peaksFor(60)} />)
    store.setView(0, 6)
    await nextFrame()
    const before = renders
    // Panning inside the same block of ticks: the Markers move, the hook doesn't render.
    for (let s = 0; s <= 5; s += 0.25) store.setView(s, s + 6)
    await nextFrame()
    expect(renders).toBe(before)
    // Into the next block.
    store.setView(14, 20)
    await nextFrame()
    expect(renders).toBe(before + 1)
    expect(times()[0]).toBe(0)
    expect(times().at(-1)).toBe(32)
  })

  test('labels tenths below a second', async () => {
    await render(<Timeline peaks={peaksFor(60)} minGap={50} />)
    store.setView(1, 2)
    await nextFrame()
    // 600 px a second: 0.1 s is 60 px.
    expect(ticks[1].time - ticks[0].time).toBeCloseTo(0.1)
    expect(ticks.find((t) => t.time === 1.5)?.label).toBe('0:01.5')
    expect(ticks.find((t) => t.time === 1.5)?.major).toBe(true)
    expect(ticks.find((t) => t.time === 1.3)?.major).toBe(false)
  })

  test('`majorEvery` picks the majors and `format` writes the labels', async () => {
    await render(<Timeline peaks={peaksFor(60)} majorEvery={3} format={(t) => `${t}s`} />)
    expect(ticks.filter((t) => t.major).map((t) => t.time)).toEqual([0, 30, 60])
    expect(ticks[1].label).toBe('10s')
  })

  test('places ticks with Waveform.Marker, hiding those outside the view', async () => {
    const screen = await render(<Timeline peaks={peaksFor(60)} />)
    store.setView(0, 6)
    await nextFrame()
    const markers = [...screen.container.querySelectorAll<HTMLElement>('[data-sillon-marker]')]
    expect(markers).toHaveLength(17)
    expect(markers[3].style.transform).toBe('translateX(300px)')
    expect(markers[10].style.display).toBe('none')
  })
})
