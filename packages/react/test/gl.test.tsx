import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Waveform, WaveformStore, useWaveformStore, type Peaks } from '../src'
import { fillBars } from '../src/waveform'
import { nextFrame, peaksFor } from './helpers'

const frames = async (n = 3) => { for (let i = 0; i < n; i++) await nextFrame() }

// Records what each GL call does, by wrapping the prototypes for the length of a test.
let widthSets = 0
let uploads: Float32Array[] = []
let draws = 0
const restore: (() => void)[] = []
function wrap<T extends object, K extends keyof T>(proto: T, key: K, make: (orig: T[K]) => T[K]) {
  const orig = proto[key]
  proto[key] = make(orig)
  restore.push(() => { proto[key] = orig })
}
beforeEach(() => {
  widthSets = 0; uploads = []; draws = 0
  const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    ...desc,
    set(v: number) { widthSets++; desc.set!.call(this, v) },
  })
  restore.push(() => Object.defineProperty(HTMLCanvasElement.prototype, 'width', desc))
  const P = WebGL2RenderingContext.prototype
  wrap(P, 'texSubImage2D', (orig) => function (this: WebGL2RenderingContext, ...a: unknown[]) {
    const data = a[a.length - 1]
    if (data instanceof Float32Array) uploads.push(data.slice())
    return (orig as (...a: unknown[]) => void).apply(this, a)
  } as typeof orig)
  wrap(P, 'drawArrays', (orig) => function (this: WebGL2RenderingContext, ...a: Parameters<typeof orig>) {
    draws++
    return orig.apply(this, a)
  } as typeof orig)
})
afterEach(() => { while (restore.length) restore.pop()!() })

function Wave({ peaks, store, smoothing }: { peaks: Peaks; store?: WaveformStore; smoothing?: number }) {
  return (
    <Waveform.Root peaks={peaks} store={store} smoothing={smoothing} style={{ width: 300, height: 60 }}>
      <Waveform.GL />
    </Waveform.Root>
  )
}

describe('Waveform.GL', () => {
  test('changing the view does not reallocate the canvas', async () => {
    let store!: WaveformStore
    function Zoomable() {
      store = useWaveformStore()
      return <Wave peaks={peaksFor(20)} store={store} />
    }
    await render(<Zoomable />)
    await frames()
    const before = widthSets
    for (let i = 1; i <= 10; i++) {
      store.setView(0, 20 - i)
      await nextFrame()
    }
    expect(widthSets).toBe(before)
    expect(draws).toBeGreaterThanOrEqual(10)
  })

  test('applies smoothing, like Shape', async () => {
    const peaks = peaksFor(20)
    const screen = await render(<Wave peaks={peaks} smoothing={3} />)
    await frames()
    const last = uploads.at(-1)!
    // What Shape draws for the same state: smoothed, normalized.
    const s = { ...new WaveformStore().state, peaks, width: 300, height: 60, end: peaks.duration, smoothing: 3, gain: 1 / peaks.max }
    const expected = fillBars(s, last.length).map((v) => v * s.gain)
    expect(Array.from(last)).toEqual(Array.from(expected).map((v) => Math.fround(v)))
    screen.unmount()
  })

  test('draws again after the WebGL context is lost and restored', async () => {
    let store!: WaveformStore
    function Hoverable() {
      store = useWaveformStore()
      return <Wave peaks={peaksFor(20)} store={store} />
    }
    const screen = await render(<Hoverable />)
    await frames()
    const canvas = screen.container.querySelector('canvas')!
    const gl = canvas.getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_lose_context')!

    const lost = new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }))
    ext.loseContext()
    await lost
    // Chromium ignores restoreContext() in the same task the loss was reported in.
    await new Promise((r) => setTimeout(r, 50))
    const restored = new Promise((r) => canvas.addEventListener('webglcontextrestored', r, { once: true }))
    ext.restoreContext()
    await restored
    await frames()

    uploads = []
    const drawn = draws
    store.setHover(5)
    await frames()
    expect(gl.isContextLost()).toBe(false)
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).not.toBeNull()
    expect(draws).toBeGreaterThan(drawn)
    expect(gl.getError()).toBe(gl.NO_ERROR)
    // The bars were uploaded again to the new texture.
    await screen.rerender(<Wave peaks={peaksFor(21)} store={store} />)
    await frames()
    expect(uploads.length).toBeGreaterThan(0)
    expect(gl.getError()).toBe(gl.NO_ERROR)
  })
})
