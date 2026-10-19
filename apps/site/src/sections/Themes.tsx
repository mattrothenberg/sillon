import { useState } from 'react'
import { Waveform, usePeaks, type Geometry } from '@sillon/react'
import { CodeTabs, Deck, Seg, useSitePlayer } from '../ui'

export const MUSIC = '/audio/avril.mp3'
export const MUSIC_TITLE = 'Avril 14th'

const THEMES = {
  ink: {
    label: 'Ink',
    geometry: { barWidth: 2, barGap: 1, barRadius: 1 },
    css: `.track  { background: var(--track); }
.played { background: var(--ink); }`,
  },
  gradient: {
    label: 'Gradient',
    geometry: { barWidth: 4, barGap: 2, barRadius: 2 },
    css: `.track, .played {
  background: linear-gradient(90deg, var(--accent), #f2a541);
}
.track { opacity: 0.25; }`,
  },
  grooves: {
    label: 'Grooves',
    geometry: { barWidth: 1, barGap: 0, barRadius: 0 },
    css: `/* One-pixel bars, no gap: a solid shape, cut into lines */
.track  { background: repeating-linear-gradient(var(--ink) 0 1px, transparent 1px 3px); opacity: 0.3; }
.played { background: repeating-linear-gradient(var(--accent) 0 1px, transparent 1px 3px); }`,
  },
  halftone: {
    label: 'Halftone',
    geometry: { barWidth: 4, barGap: 0, barRadius: 0 },
    css: `.track, .played {
  background: radial-gradient(circle, currentColor 1.3px, transparent 1.7px) 0 0 / 4px 4px;
}
.track  { color: var(--track); }
.played { color: var(--accent); }`,
  },
} satisfies Record<string, { label: string; geometry: Partial<Geometry>; css: string }>

type Theme = keyof typeof THEMES

export function Themes() {
  const [theme, setTheme] = useState<Theme>('ink')
  const { peaks } = usePeaks(MUSIC)
  const player = useSitePlayer(MUSIC)
  const t = THEMES[theme]
  const g = t.geometry
  const jsx = `<Waveform.Root peaks={peaks} player={player} barWidth={${g.barWidth}} barGap={${g.barGap}}${g.barRadius ? ` barRadius={${g.barRadius}}` : ''} contrast={2}>
  <Waveform.Shape>
    <Waveform.Track className="track" />
    <Waveform.Progress className="played" />
  </Waveform.Shape>
</Waveform.Root>`
  return (
    <section id="styling">
      <div className="lede">
        <h2>Styled with CSS.</h2>{' '}
        <p>
          If you can style a div, you can style a waveform: colours, gradients, patterns, even images.
        </p>
      </div>
      <div className="wide">
        <div className="plate">
          <div className="plate-head">
            <Seg label="Theme" value={theme} onChange={setTheme} options={Object.entries(THEMES).map(([value, x]) => ({ value: value as Theme, label: x.label }))} />
            <span className="meta">Same component. Only the CSS changes.</span>
          </div>
          <Deck player={player} label={MUSIC_TITLE}>
            <Waveform.Root peaks={peaks} player={player} {...g} contrast={2} className={`theme-${theme}`} style={{ height: 112 }} aria-label={`Seek in ${MUSIC_TITLE}`}>
              <Waveform.Skeleton className="skeleton" />
              <Waveform.Shape>
                <Waveform.Track className="track" />
                <Waveform.Progress className="played" />
              </Waveform.Shape>
              <Waveform.Hover className="hover-line" />
            </Waveform.Root>
          </Deck>
          <div className="demo-code">
            <CodeTabs tabs={[{ label: 'JSX', lang: 'tsx', code: jsx }, { label: 'CSS', lang: 'css', code: t.css }]} />
          </div>
        </div>
      </div>
    </section>
  )
}
