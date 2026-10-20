import { Waveform, usePeaks } from '@sillon/react'
import { MUSIC_PEAKS } from '../music'
import { meta, shape, skeleton } from '../cls'

const FILL = 'bg-[linear-gradient(90deg,#6b5cff,#e0442a_55%,#f2a541)]'
const caption = `${meta} mt-2.5 max-w-text`
const op = 'pb-8 font-mono text-[22px]/none text-ink-3 narrow:p-0 narrow:text-center'
const box = 'relative h-[104px] overflow-hidden rounded-lg'

/** A CSS background, the bars as a stencil, and the two together: what Shape does. */
export function HowStencil() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const wave = (fill: string) => (
    <Waveform.Root peaks={peaks} interactive={false} barWidth={3} barGap={2} barRadius={1} contrast={2} className="h-full">
      <Waveform.Skeleton className={skeleton} />
      <Waveform.Shape className={shape}>
        <Waveform.Track className={fill} />
      </Waveform.Shape>
    </Waveform.Root>
  )
  // Drawing: background × stencil = waveform. One column on phones.
  return (
    <figure>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3.5 narrow:grid-cols-[minmax(0,1fr)] narrow:gap-1.5">
        <div>
          <div className={`${box} ${FILL}`} />
          <figcaption className={caption}>A CSS background</figcaption>
        </div>
        <span className={op} aria-hidden>+</span>
        <div>
          <div className={box}>{wave('bg-track')}</div>
          <figcaption className={caption}>The bars, as a stencil</figcaption>
        </div>
        <span className={op} aria-hidden>=</span>
        <div>
          <div className={box}>{wave(FILL)}</div>
          <figcaption className={caption}>A waveform</figcaption>
        </div>
      </div>
    </figure>
  )
}
