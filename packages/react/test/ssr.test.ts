// Server rendering, in Node: no window, no <audio>.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { usePlayer, usePlayerState } from '../src/player.ts'

test('usePlayer renders on the server as a paused stand-in', () => {
  function Track() {
    const player = usePlayer('/song.mp3')
    const { playing, duration, error } = usePlayerState(player)
    player.seek(3)
    player.toggle()
    return createElement('span', null, `${playing} ${duration} ${error} ${player.time}`)
  }
  assert.equal(renderToString(createElement(Track)), '<span>false 0 null 0</span>')
})
