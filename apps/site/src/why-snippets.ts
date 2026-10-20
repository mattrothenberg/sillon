// Side-by-side code on the Why page. The wavesurfer.js side uses its real APIs: v8's
// WaveSurfer.create and setOptions, @wavesurfer/react 1.0's WavesurferPlayer component as its
// README shows it (plugins memoized, as the README requires), and the Regions plugin's addRegion with `content`.

export const WS_STYLE = `const ws = WaveSurfer.create({
  container,
  url,
  barWidth: 3,
  barGap: 2,
  waveColor: '#d4d0c9',
  progressColor: '#0f0e0c',
})

// Colors are JavaScript options, so a theme change sets them again.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  ws.setOptions({
    waveColor: e.matches ? '#45433f' : '#d4d0c9',
    progressColor: e.matches ? '#f5f4f2' : '#0f0e0c',
  })
})`

export const SILLON_STYLE = `<Waveform.Track className="bg-track" />
<Waveform.Progress className="bg-ink" />

// bg-track and bg-ink are theme colors: they change with the theme.`

export const WS_REACT = `import WavesurferPlayer from '@wavesurfer/react'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

function Player({ url, comments }) {
  const plugins = useMemo(() => [RegionsPlugin.create()], [])

  const onReady = () => {
    const [regions] = plugins
    for (const c of comments) {
      const avatar = document.createElement('img')
      avatar.src = c.user.photo
      regions.addRegion({ start: c.time, content: avatar })
    }
  }

  return (
    <WavesurferPlayer
      height={100}
      waveColor="#d4d0c9"
      progressColor="#0f0e0c"
      url={url}
      plugins={plugins}
      onReady={onReady}
    />
  )
}`

export const SILLON_REACT = `import { Waveform, useAudio } from '@sillon/react'

function Player({ url, comments }) {
  const { peaks, player } = useAudio(url)
  return (
    <Waveform.Root peaks={peaks} player={player}>
      <Waveform.Shape>
        <Waveform.Track className="bg-track" />
        <Waveform.Progress className="bg-ink" />
      </Waveform.Shape>
      {comments.map((c) => (
        <Waveform.Marker key={c.id} time={c.time}>
          <Avatar user={c.user} />
        </Waveform.Marker>
      ))}
    </Waveform.Root>
  )
}`

// wavesurfer.js 8's renderFunction: called with the channel data and a 2D canvas whenever the
// waveform renders (load, zoom, resize); the played part is the same drawing, in progressColor.
export const WS_RENDER = `const ws = WaveSurfer.create({
  container,
  url,
  renderFunction: (channels, ctx) => {
    const { width, height } = ctx.canvas
    const data = channels[0]
    for (let x = 0; x < width; x += 3) {
      const h = Math.abs(data[Math.floor((x / width) * data.length)]) * height
      ctx.fillRect(x, (height - h) / 2, 2, h)
    }
  },
})`

// The sillon side is the Afterglow effect on the home page, as it runs there.
export const SILLON_GL = (afterglow: string) => `// Runs for every bar on every frame while playing.
const afterglow = \`${afterglow}\`

<Waveform.Root peaks={peaks} player={player}>
  <Waveform.GL fragment={afterglow} />
</Waveform.Root>`

export const SILLON_GROUPS = `function Comments({ comments }) {
  // Comments closer than 24 px at the current zoom share a marker; zoom in and they split.
  const groups = useGroups(comments, 24)
  return groups.map((g) => (
    <Waveform.Marker key={g.key} time={g.time}>
      <Avatar user={g.items[0].user} />
      {g.items.length > 1 && <Count n={g.items.length} />}
    </Waveform.Marker>
  ))
}`
