import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Waveform, useWaveformStore, type Peaks, type Player, type WaveformStore } from '../src'
import { useZoom, type Zoom, type ZoomOptions } from '../src/zoom'
import { peaksFor } from './helpers'

let zoom: Zoom
let store: WaveformStore
let renders = 0

function Zoomable({ peaks, player = null, ...options }: ZoomOptions & { peaks: Peaks | null; player?: Player | null }) {
  renders++
  store = useWaveformStore()
  zoom = useZoom(store, options)
  return <Waveform.Root ref={zoom.ref} store={store} peaks={peaks} player={player} interactive={false} style={{ width: 600, height: 60 }} />
}

const root = () => document.querySelector<HTMLElement>('[data-sillon]')!
const view = () => [store.state.start, store.state.end]
const expectView = (start: number, end: number) => {
  const [s, e] = view()
  expect(s).toBeCloseTo(start, 2)
  expect(e).toBeCloseTo(end, 2)
}
/** Dispatches a wheel event at a fraction of the waveform's width; returns whether it was prevented. */
const wheel = (init: WheelEventInit, at = 0.5) => {
  const r = root().getBoundingClientRect()
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + at * r.width, clientY: r.top + 10, ...init })
  root().dispatchEvent(e)
  return e.defaultPrevented
}
const touches = (xs: number[]) => {
  const r = root().getBoundingClientRect()
  return xs.map((x, i) => new Touch({ identifier: i, target: root(), clientX: r.left + x, clientY: r.top + 10 }))
}
const touch = (type: string, xs: number[]) => {
  const list = touches(xs)
  const e = new TouchEvent(type, { bubbles: true, cancelable: true, touches: list, targetTouches: list, changedTouches: list })
  root().dispatchEvent(e)
  return e.defaultPrevented
}

describe('wheel', () => {
  test('ctrl + wheel zooms around the pointer, without a render', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    const before = renders
    // The pointer is a quarter of the way in: at 15 s.
    expect(wheel({ ctrlKey: true, deltaY: -100 }, 0.25)).toBe(true)
    const span = 60 * Math.exp(-1.2)
    expectView(15 - 0.25 * span, 15 + 0.75 * span)
    expect(renders).toBe(before)
  })

  test('⌘ + wheel zooms too', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    expect(wheel({ metaKey: true, deltaY: -100 })).toBe(true)
    expect(view()[1] - view()[0]).toBeLessThan(60)
  })

  test('a plain vertical wheel is left to the page', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    expect(wheel({ deltaY: 100 })).toBe(false)
    expectView(0, 60)
  })

  test('a sideways wheel, or Shift with the wheel, pans', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    zoom.zoomTo(10, 30)
    expectView(25, 35)
    // 60 px of a 600 px waveform is a tenth of the 10 s view.
    expect(wheel({ deltaX: 60, deltaY: 5 })).toBe(true)
    expectView(26, 36)
    expect(wheel({ shiftKey: true, deltaY: -120 })).toBe(true)
    expectView(24, 34)
  })

  test('does nothing until the duration is known', async () => {
    await render(<Zoomable peaks={null} />)
    expect(wheel({ ctrlKey: true, deltaY: -100 })).toBe(false)
    zoom.zoomTo(10)
    expect(store.endProp).toBeNull()
  })
})

describe('limits', () => {
  test('clamps to `min`, `max` and the audio', async () => {
    await render(<Zoomable peaks={peaksFor(60)} min={5} max={40} />)
    zoom.zoomTo(0.01, 30)
    expectView(27.5, 32.5)
    zoom.zoomBy(100)
    expect(view()[1] - view()[0]).toBeCloseTo(40)
    zoom.panBy(1000)
    expectView(20, 60)
    zoom.panBy(-1000)
    expectView(0, 40)
  })

  test('the default shortest view is a second', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    zoom.zoomTo(0)
    expectView(0, 60)
    zoom.zoomTo(0.001)
    expect(view()[1] - view()[0]).toBeCloseTo(1)
  })

  test('zooming out to the whole file follows the end of the audio again', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    zoom.zoomTo(10)
    expect(store.endProp).not.toBeNull()
    zoom.zoomBy(1000)
    expect(store.endProp).toBeNull()
    expectView(0, 60)
    zoom.zoomTo(10)
    zoom.reset()
    expect(store.endProp).toBeNull()
    expectView(0, 60)
  })

  test('zoomTo keeps `around` at the same place on screen', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    zoom.zoomTo(10, 50)
    // 50 s was 5/6 of the way across, and stays there.
    expectView(50 - (5 / 6) * 10, 50 + (1 / 6) * 10)
  })
})

describe('touch', () => {
  test('a two-finger pinch zooms around the fingers', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    touch('touchstart', [100, 200])
    // Fingers twice as far apart, around the same midpoint (150 px, 15 s): half the span.
    expect(touch('touchmove', [50, 250])).toBe(true)
    expectView(15 - 0.25 * 30, 15 + 0.75 * 30)
    touch('touchend', [])
    expect(touch('touchmove', [0, 300])).toBe(false)
  })

  test('one finger is left alone', async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    touch('touchstart', [100])
    expect(touch('touchmove', [300])).toBe(false)
    expectView(0, 60)
  })
})

describe('drag', () => {
  const press = (type: string, x: number) => {
    const r = root().getBoundingClientRect()
    root().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + 10 }))
  }

  test('pans with `drag`', async () => {
    await render(<Zoomable peaks={peaksFor(60)} drag />)
    zoom.zoomTo(10, 30)
    press('pointerdown', 300)
    press('pointermove', 240)
    expectView(26, 36)
    press('pointerup', 240)
    press('pointermove', 0)
    expectView(26, 36)
  })

  test("doesn't pan without it", async () => {
    await render(<Zoomable peaks={peaksFor(60)} />)
    zoom.zoomTo(10, 30)
    press('pointerdown', 300)
    press('pointermove', 240)
    expectView(25, 35)
  })
})

describe('follow', () => {
  // Enough of a player for Root and the hook: a clock the test moves by hand.
  function fakePlayer() {
    const listeners = new Set<(t: number) => void>()
    const player = {
      audio: new Audio(), time: 0, duration: 60, playing: true, loop: null,
      play: async () => {}, pause() {}, toggle() {}, seek() {}, setLoop() {},
      onTime: (l: (t: number) => void) => { listeners.add(l); return () => listeners.delete(l) },
      subscribe: () => () => {},
      tick(t: number) { player.time = t; for (const l of listeners) l(t) },
    }
    return player
  }

  test('turns the page when the playhead reaches the edge', async () => {
    const player = fakePlayer()
    await render(<Zoomable peaks={peaksFor(60)} player={player as unknown as Player} follow />)
    zoom.zoomTo(10, 0)
    expectView(0, 10)
    player.tick(9)
    expectView(0, 10)
    player.tick(10.5)
    expectView(10.5, 20.5)
    player.tick(55)
    expectView(50, 60)
  })

  test("'center' keeps the playhead in the middle", async () => {
    const player = fakePlayer()
    await render(<Zoomable peaks={peaksFor(60)} player={player as unknown as Player} follow="center" />)
    zoom.zoomTo(10, 0)
    player.tick(30)
    expectView(25, 35)
    player.tick(2)
    expectView(0, 10)
  })

  test('stays put while paused, and when off', async () => {
    const player = fakePlayer()
    const screen = await render(<Zoomable peaks={peaksFor(60)} player={player as unknown as Player} follow />)
    zoom.zoomTo(10, 0)
    player.playing = false
    player.tick(30)
    expectView(0, 10)
    player.playing = true
    await screen.rerender(<Zoomable peaks={peaksFor(60)} player={player as unknown as Player} />)
    player.tick(30)
    expectView(0, 10)
  })
})

test('detaches when the ref is cleared', async () => {
  await render(<Zoomable peaks={peaksFor(60)} />)
  const el = root()
  zoom.ref(null)
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 })
  el.dispatchEvent(e)
  expect(e.defaultPrevented).toBe(false)
  expectView(0, 60)
})
