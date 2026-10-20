// Aphex Twin – Avril 14th (full piece, 37 bars)
// Ab major, ~75 bpm. One cycle is one bar of 4/4. Each @ weight is a 16th note.
// Notes from Nicola Ariutti's SuperCollider transcription: https://sccode.org/1-5d0
setcpm(75/4)

const rh = (s, bars) => note(s).slow(bars).velocity(.7)
const hi = (s, bars) => note(s).slow(bars).velocity(.55)
const lh = (s, bars) => note(s).slow(bars).velocity("[.65 .45 .45 .45]*2")

const arp = "ab2 f3 ab3 c4  c3 ab3 c4 eb4  db3 ab3 db4 eb4  bb2 ab3 db4 c4"

// A: the main riff
const A = stack(
  rh("c5@4 f4@4 ab4@6 ab4@1 f4@7 f4@2 eb5@2 db5@2 c5@2 ab4@2", 2),
  lh(arp, 2),
)

// B: opening phrase in octaves, held F
const B = stack(
  rh("[c5,c6]@4 [f4,f5]@4 [ab4,ab5]@6 [ab4,ab5]@1 [f4,f5]@17", 2),
  lh(arp, 2),
)

// C: melody drops low
const C = stack(
  rh("c4@6 c4@1 eb4@7 c4@2 c4@6 c4@1 eb4@1 f4@6 eb4@2", 2),
  lh("ab2 ab3 f3 eb3  eb2 eb3 f3 eb3  ab2 ab3 f3 eb3  db2 db3 eb3 db3", 2),
)

// D + E: rising octave figure over Bb
const D = stack(
  rh(`~@2 [f4,f5]@2 [g4,g5]@2 [ab4,ab5]@2 [c5,c6]@2 [g4,g5]@6
      ~@2 [f4,f5]@2 [g4,g5]@2 [ab4,ab5]@2 [c5,c6]@2 [g4,g5]@2 [f4,f5]@4`, 2),
  lh(`bb2@2 bb3@2 c4@2 eb3@4 c4@1 bb3@2 f3@3
      bb2@2 bb3@2 c4@2 eb3@3 c4@2 bb3@2 c4@3`, 2),
)

const E = stack(
  rh(`~@2 [f4,f5]@2 [g4,g5]@2 [ab4,ab5]@2 [c5,c6]@2 [g4,g5]@6
      ~@2 [f4,f5]@2 [g4,g5]@2 [ab4,ab5]@2 [c5,c6]@3 [g4,g5]@2 [f4,f5]@3`, 2),
  lh(`bb2@2 bb3@2 c4@2 eb4@4 c4@1 bb3@1 eb3@2 f3@2
      bb2@2 bb3@2 c4@2 eb3@3 c4@2 bb3@1 c4@4`, 2),
)

// F: full riff in octaves
const F = stack(
  rh(`[c5,c6]@4 [f4,f5]@4 [ab4,ab5]@6 [ab4,ab5]@1 [f4,f5]@7
      [f4,f5]@2 [eb5,eb6]@2 [db5,db6]@2 [c5,c6]@2 [ab4,ab5]@2`, 2),
  lh(arp, 2),
)

// G: bridge, block chords in the left hand
const G = stack(
  rh(`c5@7 bb4@1 c5@7 c5@1 eb5@1 f5@1 eb5@2 c5@8 eb5@4
      c5@7 bb4@1 ab4@7 c5@1 eb5@1 f5@1 f4@2 c5@8 ab4@4`, 4),
  lh(`[db3,f3] [bb2,db3,f3] [c3,ab3] [ab2,f3]
      [f2,ab2,c3,ab3] [eb2,ab2,c3,eb3] [ab2,eb3,ab3,c4] [db2,ab2,db3,f3]`, 4),
)

// H: climbs high
const H = stack(
  rh("c5@7 bb4@1 c5@7 c5@1 [eb5,eb6]@1 [f5,f6]@1 [eb5,eb6]@1 eb7@3 c7@6 [eb5,eb6]@4", 2),
  hi("~@1 c6@6 ~@2 c6@6 c6@1 ~@16", 2),
  lh("f2 f3 ab3 bb3  ab2 ab3 bb3 eb4  db3 ab3 c4 f4  bb2 ab3 db4 ab4", 2),
)

// I: ending, last chord rings out
const I = stack(
  rh(`[c5,c6]@7 [bb4,bb5]@1 [ab4,ab5]@7 [c5,c6]@1
      [eb5,eb6]@1 [f5,f6]@1 [f4,f5]@4 c6@6 [eb5,eb6]@1 [eb5,eb6]@1 [eb5,eb6]@18`, 3),
  hi("~@1 ab6@3 f6@4 bb5@5 f5@3 ~@32", 3),
  lh("c4@2 ab3@2 f3@2 db3@2 c3@2 ab3@2 c4@2 eb4@2 bb2@2 ab3@2 c4@2 f4@2 ab2@2 ab3@2 ab4@2 c4@18", 3),
)

arrange(
  [4, A], [4, B], [8, C], [2, D], [2, E],
  [4, A], [4, F], [4, G], [2, H], [3, I],
).s("marimba").delay(.4).delaytime(.6).delayfeedback(.45).room(.7).size(3)
