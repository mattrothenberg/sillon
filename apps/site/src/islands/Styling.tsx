import { useState } from 'react'
import { Waveform, usePeaks } from '@sillon/react'
import { CodeStack, Deck, Looks, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { THEMES, type Theme } from '../snippets'
import { demoCode, hoverLine, meta, shape, skeleton } from '../cls'

/** Highlighted JSX for every theme, made at build time. */
export type StylingCode = Record<Theme, string[]>

export function Styling({ code }: { code: StylingCode }) {
  const [theme, setTheme] = useState<Theme>('line')
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'styling')
  const t = THEMES[theme]
  return (
    <Looks
      label="Theme"
      value={theme}
      onChange={setTheme}
      options={Object.entries(THEMES).map(([value, x]) => ({ value: value as Theme, label: x.label, note: <span className={meta}>Same parts. Bar sizes and classes change.</span> }))}
    >
      <Deck player={player} label={MUSIC_TITLE}>
        <Waveform.Root peaks={peaks} player={player} {...t.geometry} contrast={2} style={{ height: 112 }} aria-label={`Seek in ${MUSIC_TITLE}`}>
          <Waveform.Skeleton className={skeleton} />
          <Waveform.Shape className={shape}>
            {/* The classes the code below shows. */}
            <Waveform.Track className={t.track} />
            <Waveform.Progress className={t.played} />
          </Waveform.Shape>
          <Waveform.Hover className={hoverLine} />
        </Waveform.Root>
      </Deck>
      <div className={demoCode}>
        {/* Switching themes changes the props and the classes, and you should see both change. */}
        <CodeStack code={code} current={theme} />
      </div>
    </Looks>
  )
}
