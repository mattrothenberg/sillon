import { useState } from 'react'
import { Waveform, usePeaks } from '@sillon/react'
import { CodeStack, Deck, Looks, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { EFFECTS, GL_COLORS, type Effect } from '../effects'
import { demoCode, hoverLine, meta, skeleton } from '../cls'
import { Particles } from './Particles'

/** Highlighted JSX, then GLSL if it has one, for every effect, made at build time. */
export type EffectsCode = Record<Effect, string[]>

export function Effects({ code }: { code: EffectsCode }) {
  const [effect, setEffect] = useState<Effect>('embers')
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'effects')
  const x = EFFECTS[effect]
  return (
    <Looks
      label="Effect"
      value={effect}
      onChange={setEffect}
      options={Object.entries(EFFECTS).map(([value, e]) => ({ value: value as Effect, label: e.label, note: <span className={meta}>{e.note}</span> }))}
    >
      {/* Room above the bars for the sparks. */}
      <div className="pt-14">
        <Deck player={player} label={MUSIC_TITLE}>
          <Waveform.Root peaks={peaks} player={player} barWidth={6} barGap={3} barRadius={3} contrast={2} className={GL_COLORS} style={{ height: 112 }} aria-label={`Seek in ${MUSIC_TITLE}`}>
            <Waveform.Skeleton className={skeleton} />
            <Waveform.GL fragment={x.glsl ?? undefined} />
            {x.particles && <Particles key={effect} look={x.particles} />}
            <Waveform.Hover className={hoverLine} />
          </Waveform.Root>
        </Deck>
      </div>
      <div className={demoCode}>
        <CodeStack code={code} current={effect} />
      </div>
    </Looks>
  )
}
