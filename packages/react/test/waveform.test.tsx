import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Peaks, Waveform, createPlayer, useGroups, type Group, type Player } from '../src'
import { barCount, nextFrame, peaksFor, silentWav } from './helpers'

const box = (width: number) => ({ width, height: 60 })

function Bars({ peaks, width = 300, ...props }: { peaks: Peaks | null; width?: number; bars?: number; progressive?: boolean }) {
  return (
    <Waveform.Root peaks={peaks} style={box(width)} {...props}>
      <Waveform.Shape>
        <Waveform.Track />
      </Waveform.Shape>
    </Waveform.Root>
  )
}

describe('drawing', () => {
  test('draws nothing while loading, then every bar at once', async () => {
    const screen = await render(<Bars peaks={null} />)
    const root = screen.container.querySelector('[data-sillon]')!
    expect(root.getAttribute('data-state')).toBe('loading')
    expect(barCount(root)).toBe(0)

    await screen.rerender(<Bars peaks={peaksFor(10)} />)
    expect(root.getAttribute('data-state')).toBe('ready')
    // 2px bars with 1px gaps: floor((300 + 1) / 3).
    expect(barCount(root)).toBe(100)
  })

  test('`bars` draws exactly that many at any width', async () => {
    const peaks = peaksFor(10)
    const screen = await render(<Bars peaks={peaks} bars={50} />)
    const root = screen.container.querySelector('[data-sillon]')!
    expect(barCount(root)).toBe(50)
    await screen.rerender(<Bars peaks={peaks} bars={50} width={517} />)
    await nextFrame()
    expect(barCount(root)).toBe(50)
  })

  test('unfinished peaks draw only with `progressive`', async () => {
    const half = () => {
      const p = new Peaks({ sampleRate: 8000, bucketSize: 256 })
      p.begin(8000, 300)
      p.append(new Float32Array(150).fill(0.5))
      return p
    }
    const screen = await render(<Bars peaks={half()} />)
    const root = screen.container.querySelector('[data-sillon]')!
    expect(root.getAttribute('data-state')).toBe('loading')
    expect(barCount(root)).toBe(0)

    await screen.rerender(<Bars peaks={half()} progressive />)
    expect(root.getAttribute('data-state')).toBe('ready')
    expect(barCount(root)).toBeGreaterThan(0)
  })
})

describe('Marker', () => {
  const Pin = ({ peaks, time, end }: { peaks: Peaks | null; time: number; end?: number }) => (
    <Waveform.Root peaks={peaks} end={end} style={box(300)}>
      <Waveform.Marker time={time} />
    </Waveform.Root>
  )
  const marker = (c: Element) => c.querySelector<HTMLElement>('[data-sillon-marker]')!

  test('is hidden until the duration is known', async () => {
    const screen = await render(<Pin peaks={null} time={5} />)
    expect(marker(screen.container).style.display).toBe('none')
    await screen.rerender(<Pin peaks={peaksFor(10)} time={5} />)
    expect(marker(screen.container).style.display).toBe('')
    expect(marker(screen.container).style.transform).toBe('translateX(150px)')
  })

  test('is hidden outside the view', async () => {
    const screen = await render(<Pin peaks={peaksFor(10)} time={8} end={5} />)
    expect(marker(screen.container).style.display).toBe('none')
  })
})

describe('useGroups', () => {
  const items = [{ time: 1 }, { time: 1.05 }, { time: 8 }]
  let seen: Group<{ time: number }>[] = []
  function Groups() {
    seen = useGroups(items)
    return null
  }
  const Pins = ({ peaks }: { peaks: Peaks | null }) => (
    <Waveform.Root peaks={peaks} style={box(300)}>
      <Groups />
    </Waveform.Root>
  )

  test('keeps every item apart until the duration is known', async () => {
    await render(<Pins peaks={null} />)
    expect(seen.map((g) => g.items.length)).toEqual([1, 1, 1])
  })

  test('groups items closer than the gap', async () => {
    await render(<Pins peaks={peaksFor(10)} />)
    // 1 s and 1.05 s are 1.5px apart at 30px per second; 8 s is far off.
    expect(seen.map((g) => g.items.length)).toEqual([2, 1])
    expect(seen[0]).toMatchObject({ time: 1, end: 1.05 })
  })
})

describe('Root with a player', () => {
  // A real <audio> element playing a generated silent file, with a known duration.
  async function ready(seconds: number): Promise<Player> {
    const player = createPlayer(silentWav(seconds))
    await new Promise<void>((resolve) => {
      if (player.duration) return resolve()
      const off = player.subscribe(() => player.duration && (off(), resolve()))
    })
    return player
  }

  test('is a slider that seeks with the keyboard', async () => {
    const player = await ready(20)
    const screen = await render(
      <Waveform.Root peaks={peaksFor(20)} player={player} style={box(300)} />,
    )
    const slider = screen.getByRole('slider', { name: 'Seek' })
    await expect.element(slider).toHaveAttribute('aria-valuemax', '20')
    ;(slider.element() as HTMLElement).focus()

    const press = async (key: string) => {
      slider.element().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await nextFrame()
    }
    await press('ArrowRight')
    expect(player.time).toBeCloseTo(5)
    await press('End')
    expect(player.time).toBeCloseTo(20)
    await press('Home')
    expect(player.time).toBeCloseTo(0)
    await expect.element(slider).toHaveAttribute('aria-valuenow', '0')
  })

  test('is not a slider without a player', async () => {
    const screen = await render(<Waveform.Root peaks={peaksFor(20)} style={box(300)} />)
    expect(screen.container.querySelector('[role=slider]')).toBeNull()
  })

  test('ignores presses that bubble up from a portal', async () => {
    const player = await ready(20)
    function Popover() {
      const [host, setHost] = useState<HTMLElement | null>(null)
      useEffect(() => setHost(document.body), [])
      return host ? createPortal(<button>Reply</button>, host) : null
    }
    const screen = await render(
      <Waveform.Root peaks={peaksFor(20)} player={player} style={box(300)}>
        <Popover />
      </Waveform.Root>,
    )
    await screen.getByRole('button', { name: 'Reply' }).click()
    expect(player.time).toBe(0)
  })
})
