import { useState } from 'react'
import { Visualizer as Rays } from '@sillon/react'
import { CodeStack, Looks, PlayButton, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_TITLE } from '../music'
import { VIS_LOOKS, type VisLook } from '../effects'
import { RAYS } from '../snippets'
import { demoCode, meta } from '../cls'

/** Highlighted code for every look (JSX, then GLSL if it has one), made at build time. */
export type VisualizerCode = Record<VisLook, string[]>

export function Visualizer({ code }: { code: VisualizerCode }) {
  const player = useSitePlayer(MUSIC, 'visualizer')
  const [look, setLook] = useState<VisLook>('rays')
  return (
    <Looks
      label="Look"
      value={look}
      onChange={setLook}
      options={Object.entries(VIS_LOOKS).map(([value, l]) => ({ value: value as VisLook, label: l.label, note: <span className={meta}>{l.glsl ? 'WebGL, with your fragment shader' : 'A 2D canvas, in the CSS color'}</span> }))}
    >
      <div className="relative mx-auto aspect-square w-[min(100%,420px)]">
        <Rays player={player} rays={96} innerRadius={0.34} fragment={VIS_LOOKS[look].glsl ?? undefined} className={RAYS} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><PlayButton player={player} label={MUSIC_TITLE} /></div>
      </div>
      <div className={demoCode}>
        <CodeStack code={code} current={look} />
      </div>
    </Looks>
  )
}
