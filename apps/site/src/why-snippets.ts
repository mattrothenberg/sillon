// Side-by-side code on the Why page. The wavesurfer.js side uses its real APIs: v8's
// WaveSurfer.create and setOptions, @wavesurfer/react 1.0's useWavesurfer hook (plugins
// memoized, as its README requires), and the Regions plugin's addRegion with `content`.

export const WS_STYLE = `const ws = WaveSurfer.create({
  container,
  url,
  barWidth: 3,
  barGap: 2,
  waveColor: '#d4d0c9',
  progressColor: '#0f0e0c',
})

// A canvas can't read CSS variables, so dark mode means setting the colors again.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  ws.setOptions({
    waveColor: e.matches ? '#45433f' : '#d4d0c9',
    progressColor: e.matches ? '#f5f4f2' : '#0f0e0c',
  })
})`

// The sillon side is the playback demo's own waveform (HowFrame): bg-track and bg-ink are
// this site's theme colors, which change with the theme.
export const SILLON_STYLE = `<Waveform.Track className="bg-track" />
<Waveform.Progress className="bg-ink" />

// Dark mode is the theme's colors changing.`

export const WS_REACT = `function Player({ url, comments }) {
  const container = useRef(null)
  const plugins = useMemo(() => [RegionsPlugin.create()], [])
  const { isReady } = useWavesurfer({ container, url, plugins })

  useEffect(() => {
    if (!isReady) return
    const regions = plugins[0]
    regions.clearRegions()
    for (const c of comments) {
      const avatar = document.createElement('img')
      avatar.src = c.user.photo
      regions.addRegion({ start: c.time, content: avatar })
    }
  }, [isReady, plugins, comments])

  return <div ref={container} />
}`

export const SILLON_REACT = `function Player({ url, comments }) {
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
