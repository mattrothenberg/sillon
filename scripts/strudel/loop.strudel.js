// The demo loop. Rendered to apps/bench/public/audio/loop.mp3 by render.mjs.
setcps(0.5)

const pad = note("<[c4,eb4,g4] [ab3,c4,eb4] [f3,ab3,c4] [g3,bb3,d4]>")
  .s("triangle").attack(0.4).release(1.2).gain(0.3).room(0.6)
const hats = s("hh*8").gain("0.4 0.22").pan(sine)
const drums = stack(s("bd*4"), s("~ cp ~ cp").gain(0.7), hats)
const bass = note("<c2 c2 ab1 bb1>*8").s("sawtooth")
  .lpf(sine.range(300, 1600).slow(4)).decay(0.12).sustain(0).gain(0.65)

arrange(
  [2, pad],
  [2, stack(pad, hats)],
  [4, stack(pad, drums, bass)],
  [2, stack(pad, bass.lpf(380))],
  [6, stack(pad, drums, bass)],
)
