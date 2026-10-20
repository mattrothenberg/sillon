import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Peaks, Waveform, createPlayer, useActive, useGroups, useWaveform, xToTime, type Group, type Player, type WaveformStore } from '../src'
import { barCount, nextFrame, peaksFor, silentWav } from './helpers'

const box = { width: 300, height: 60 }

async function ready(seconds: number): Promise<Player> {
  const player = createPlayer(silentWav(seconds))
  await new Promise<void>((resolve) => {
    if (player.duration) return resolve()
    const off = player.subscribe(() => player.duration && (off(), resolve()))
  })
  return player
}

const key = (el: Element, key: string) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(e)
  return e
}

let store: WaveformStore | null = null
function Grab() {
  store = useWaveform()
  return null
}

describe('Root as a slider', () => {
  test('keys typed on a button inside it are the button\'s', async () => {
    const player = await ready(20)
    const screen = await render(
      <Waveform.Root peaks={peaksFor(20)} player={player} style={box}>
        <Waveform.Marker time={5}><button>Reply</button></Waveform.Marker>
      </Waveform.Root>,
    )
    const button = screen.getByRole('button', { name: 'Reply' }).element()
    expect(key(button, ' ').defaultPrevented).toBe(false)
    expect(key(button, 'ArrowRight').defaultPrevented).toBe(false)
    expect(player.playing).toBe(false)
    expect(player.time).toBe(0)
  })

  test('a press on a button inside it doesn\'t seek, and the button gets its click', async () => {
    const player = await ready(20)
    let clicks = 0
    const screen = await render(
      <Waveform.Root peaks={peaksFor(20)} player={player} style={box}>
        <Waveform.Marker time={10}><button onClick={() => clicks++}>Reply</button></Waveform.Marker>
      </Waveform.Root>,
    )
    await screen.getByRole('button', { name: 'Reply' }).click()
    expect(clicks).toBe(1)
    expect(player.time).toBe(0)
  })

  test('spans the whole audio when zoomed in', async () => {
    const player = await ready(60)
    const screen = await render(<Waveform.Root peaks={peaksFor(60)} player={player} start={0} end={10} style={box} />)
    const slider = screen.getByRole('slider').element()
    await expect.element(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '60')
    player.seek(8)
    key(slider, 'ArrowRight')
    expect(player.time).toBeCloseTo(13)
    key(slider, 'End')
    expect(player.time).toBeCloseTo(60)
    key(slider, 'Home')
    expect(player.time).toBeCloseTo(0)
  })

  test('lets vertical swipes scroll the page', async () => {
    const player = await ready(20)
    const screen = await render(<Waveform.Root peaks={peaksFor(20)} player={player} style={box} />)
    expect((screen.container.querySelector('[data-sillon]') as HTMLElement).style.touchAction).toBe('pan-y')
  })
})

describe('view', () => {
  test('removing `end` follows the audio again', async () => {
    const peaks = peaksFor(10)
    const screen = await render(<Waveform.Root peaks={peaks} end={5} style={box}><Grab /></Waveform.Root>)
    expect(store!.state.end).toBe(5)
    await screen.rerender(<Waveform.Root peaks={peaks} style={box}><Grab /></Waveform.Root>)
    expect(store!.state.end).toBe(10)
  })

  test('xToTime is the inverse of timeToX', () => {
    const s = { start: 10, end: 20, width: 300 }
    expect(xToTime(s, 150)).toBe(15)
    expect(xToTime(s, 0)).toBe(10)
  })
})

describe('bar heights', () => {
  // Every bar at half scale, so heights are easy to read back from the path.
  const flat = (v: number) => Peaks.from(new Array(320).fill(v), { duration: 10 })
  const heights = (root: Element) =>
    [...(root.querySelector('[data-sillon-shape] path')!.getAttribute('d') ?? '').matchAll(/v([\d.]+)h-/g)].map((m) => Number(m[1]))

  test('`scale` multiplies them, within the height', async () => {
    const screen = await render(<Waveform.Root peaks={flat(0.5)} normalize={false} scale={1.5} style={box}><Waveform.Shape /></Waveform.Root>)
    expect(new Set(heights(screen.container))).toEqual(new Set([45]))
    await screen.rerender(<Waveform.Root peaks={flat(0.5)} normalize={false} scale={4} style={box}><Waveform.Shape /></Waveform.Root>)
    expect(new Set(heights(screen.container))).toEqual(new Set([60]))
  })

  test('`maxPeak` normalizes to a fixed value', async () => {
    const screen = await render(<Waveform.Root peaks={flat(0.5)} maxPeak={1} style={box}><Waveform.Shape /></Waveform.Root>)
    expect(new Set(heights(screen.container))).toEqual(new Set([30]))
    await screen.rerender(<Waveform.Root peaks={flat(0.5)} style={box}><Waveform.Shape /></Waveform.Root>)
    expect(new Set(heights(screen.container))).toEqual(new Set([60]))
  })
})

describe('clip paths', () => {
  test('stay unique across separately rendered roots', async () => {
    // Two server-rendered trees get the same useId; on the client each is made unique.
    const tree = <Waveform.Root peaks={null}><Waveform.Shape /></Waveform.Root>
    expect(renderToString(tree)).toBe(renderToString(tree))
    const a = await render(<Waveform.Root peaks={peaksFor(10)} style={box}><Waveform.Shape /></Waveform.Root>)
    const b = await render(<Waveform.Root peaks={peaksFor(10)} style={box}><Waveform.Shape /></Waveform.Root>)
    const ids = [a, b].map((s) => s.container.querySelector('clipPath')!.id)
    expect(new Set(ids).size).toBe(2)
    for (const s of [a, b]) {
      const shape = s.container.querySelector<HTMLElement>('[data-sillon-shape]')!
      expect(shape.style.clipPath).toBe(`url("#${s.container.querySelector('clipPath')!.id}")`)
      expect(barCount(s.container)).toBe(100)
    }
  })
})

describe('Region', () => {
  test('`maxLength` caps a resize', async () => {
    let span = { start: 2, end: 4 }
    function Loop() {
      const [s, set] = useState(span)
      span = s
      return (
        <Waveform.Region {...s} maxLength={3} onChange={(start, end) => set({ start, end })} style={{ height: 60 }}>
          <Waveform.RegionHandle side="end" style={{ width: 8 }} data-testid="end" />
        </Waveform.Region>
      )
    }
    const screen = await render(<Waveform.Root peaks={peaksFor(10)} player={await ready(10)} style={box}><Loop /></Waveform.Root>)
    const handle = screen.getByTestId('end').element()
    const r = handle.getBoundingClientRect()
    const at = (x: number, type: string) => handle.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: r.top + 5, button: 0, pointerId: 1, bubbles: true }))
    at(r.left, 'pointerdown')
    at(r.left + 150, 'pointermove') // +5 s at 30 px per second
    at(r.left + 150, 'pointerup')
    await nextFrame()
    expect(span).toEqual({ start: 2, end: 5 })
  })
})

describe('timed items', () => {
  test('useGroups returns the new objects when items change at the same times', async () => {
    let seen: Group<{ time: number; text: string }>[] = []
    function Groups({ items }: { items: { time: number; text: string }[] }) {
      seen = useGroups(items)
      return null
    }
    const peaks = peaksFor(10)
    const screen = await render(<Waveform.Root peaks={peaks} style={box}><Groups items={[{ time: 2, text: 'old' }]} /></Waveform.Root>)
    expect(seen[0].items[0].text).toBe('old')
    await screen.rerender(<Waveform.Root peaks={peaks} style={box}><Groups items={[{ time: 2, text: 'new' }]} /></Waveform.Root>)
    expect(seen[0].items[0].text).toBe('new')
  })

  test('useActive keeps an item with an `end` active until then', async () => {
    const player = await ready(30)
    const chapters = [{ time: 0, end: 10, name: 'One' }, { time: 10, end: 30, name: 'Two' }, { time: 12, name: 'A note' }]
    let now: string[] = []
    function Now() {
      now = useActive(chapters, 3).map((c) => c.name)
      return null
    }
    await render(<Waveform.Root peaks={peaksFor(30)} player={player} style={box}><Now /></Waveform.Root>)
    const at = async (t: number) => { player.seek(t); await nextFrame() }
    await at(5); expect(now).toEqual(['One'])
    await at(13); expect(now).toEqual(['Two', 'A note'])
    await at(20); expect(now).toEqual(['Two'])
  })
})
