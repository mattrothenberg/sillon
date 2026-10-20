import { afterEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { Visualizer, createPlayer, visualizerRays, type Player } from '../src'
import { nextFrame, silentWav } from './helpers'

const frames = async (n = 3) => { for (let i = 0; i < n; i++) await nextFrame() }
const restore: (() => void)[] = []
afterEach(() => { while (restore.length) restore.pop()!() })

async function ready(seconds: number): Promise<Player> {
  const player = createPlayer(silentWav(seconds))
  await new Promise<void>((resolve) => {
    if (player.duration) return resolve()
    const off = player.subscribe(() => player.duration && (off(), resolve()))
  })
  return player
}

function Both({ players, fragment }: { players: Player[]; fragment?: string }) {
  return (
    <div>
      <button onClick={() => players.forEach((p) => p.play())}>Play</button>
      {players.map((p, i) => (
        <div key={i} style={{ width: 120, height: 120 }}>
          <Visualizer player={p} fragment={fragment} />
        </div>
      ))}
    </div>
  )
}

describe('Visualizer', () => {
  test('players share one AudioContext', async () => {
    let made = 0
    const Original = window.AudioContext
    window.AudioContext = class extends Original { constructor(o?: AudioContextOptions) { super(o); made++ } }
    restore.push(() => { window.AudioContext = Original })

    const players = [await ready(5), await ready(5)]
    const screen = await render(<Both players={players} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    await frames()
    expect(players.every((p) => p.playing)).toBe(true)
    expect(made).toBeLessThanOrEqual(1)
    players.forEach((p) => p.pause())
  })

  test('with a fragment, looks up uniforms once, not every frame', async () => {
    let lookups = 0
    const P = WebGL2RenderingContext.prototype
    const orig = P.getUniformLocation
    P.getUniformLocation = function (this: WebGL2RenderingContext, ...a: Parameters<typeof orig>) { lookups++; return orig.apply(this, a) }
    restore.push(() => { P.getUniformLocation = orig })

    const players = [await ready(5)]
    const screen = await render(<Both players={players} fragment={visualizerRays} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    await frames(2)
    const after = lookups
    await frames(10)
    expect(lookups).toBe(after)
    players[0].pause()
  })

  test('draws again after the WebGL context is lost and restored', async () => {
    let draws = 0
    const P = WebGL2RenderingContext.prototype
    const orig = P.drawArrays
    P.drawArrays = function (this: WebGL2RenderingContext, ...a: Parameters<typeof orig>) { draws++; return orig.apply(this, a) }
    restore.push(() => { P.drawArrays = orig })

    const players = [await ready(5)]
    const screen = await render(<Both players={players} fragment={visualizerRays} />)
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
    const before = draws
    ext.restoreContext()
    await restored
    await frames()
    // Restoring draws once straight away, even while paused.
    expect(draws).toBeGreaterThan(before)
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).not.toBeNull()
    expect(gl.getError()).toBe(gl.NO_ERROR)
  })
})
