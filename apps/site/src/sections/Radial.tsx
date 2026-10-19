import { Visualizer } from '@sillon/react'
import { CodeTabs, PlayButton, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from './Themes'

const JSX = `import { Visualizer, usePlayer } from '@sillon/react'

export function Live() {
  const player = usePlayer('/avril.mp3')
  return <Visualizer player={player} rays={96} innerRadius={0.34} className="rays" />
}`

const CSS = `.rays { color: var(--ink); }`

export function Radial() {
  const player = useSitePlayer(MUSIC)
  return (
    <section id="visualizer">
      <div className="lede">
        <h2>Visualizer.</h2>{' '}
        <p>Rays around a circle that move with the music as it plays.</p>
      </div>
      <div className="wide">
        <div className="disc">
          <Visualizer player={player} rays={96} innerRadius={0.34} className="rays" />
          <div className="disc-play"><PlayButton player={player} label={MUSIC_TITLE} /></div>
        </div>
        <div className="demo-code">
          <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: JSX }, { label: 'CSS', lang: 'css', code: CSS }]} />
        </div>
      </div>
    </section>
  )
}
