import { useState } from 'react'
import { Waveform, usePeaks } from '@sillon/react'
import { PlayButton, PlayerTime, Seg, useSitePlayer } from '../ui'
import { MUSIC, MUSIC_PEAKS, MUSIC_TITLE } from '../music'
import { Particles } from './Particles'
import { AFTERGLOW, DUST, SPARKS } from '../effects'
import { hoverLine, meta, skeleton, transport } from '../cls'

// Lab: Waveform.GL with its own fragment code. Each effect reads the waveform
// (a bar's height, where it is, how long ago it played) or the audio (loudness
// at the playhead), so it follows the music instead of sitting behind the bars.

const PARTICLE_LOOKS = [
  { name: 'Sparks', about: 'The needle kicks up sparks where it meets the groove; louder means more. Over the Afterglow shader.', look: SPARKS, glsl: AFTERGLOW },
  { name: 'Dust', about: 'Faint motes lift off the bar being played and drift up.', look: DUST, glsl: undefined },
]

const LOOKS: { name: string; about: string; glsl: string }[] = [
  {
    name: 'Afterglow',
    about: 'Bars glow just behind the playhead and cool down over a few seconds.',
    glsl: `vec4 shade(Bar b) {
  if (!b.played) return waveColor;
  float heat = exp(-b.age / 14.0);
  vec3 ember = mix(vec3(1.0, 0.3, 0.12), vec3(1.0, 0.85, 0.55), b.uv.y * heat);
  return vec4(mix(progressColor.rgb, ember, heat), 1.0);
}`,
  },
  {
    name: 'Breathing tips',
    about: 'The tips of the played bars light up with how loud the song is right now.',
    glsl: `vec4 shade(Bar b) {
  if (!b.played) return waveColor;
  float lit = smoothstep(1.0 - level * 1.4, 1.0, b.uv.y);
  return vec4(mix(progressColor.rgb, vec3(1.0, 0.36, 0.23), lit), 1.0);
}`,
  },
  {
    name: 'Look-ahead',
    about: 'Bars ahead of the playhead brighten with each loud moment, fading with distance.',
    glsl: `vec4 shade(Bar b) {
  if (b.played) return progressColor;
  float pull = pow(level, 0.7) * exp(b.age / 10.0);
  return vec4(mix(waveColor.rgb, vec3(1.0, 0.36, 0.23), pull), 1.0);
}`,
  },
  {
    name: 'Loudness',
    about: 'Each bar colored by its own height: quiet bars cool, loud ones hot.',
    glsl: `vec3 ramp(float t) {
  vec3 c = mix(vec3(0.26, 0.22, 0.85), vec3(0.95, 0.28, 0.32), smoothstep(0.0, 0.6, t));
  return mix(c, vec3(1.0, 0.82, 0.42), smoothstep(0.6, 1.0, t));
}
vec4 shade(Bar b) {
  vec3 c = ramp(b.amp);
  return vec4(b.played ? c : mix(waveColor.rgb, c, 0.3), 1.0);
}`,
  },
]

const BARS = {
  wide: { barWidth: 6, barGap: 3, barRadius: 3 },
  thin: { barWidth: 3, barGap: 2, barRadius: 1 },
} as const
type Bars = keyof typeof BARS

const wave = 'h-[120px] [--wave-color:var(--color-track)] [--wave-progress:var(--color-ink)]'
const row = 'm-0 grid gap-2.5'
const caption = (l: { name: string; about: string }) => (
  <figcaption><b className="mr-2 font-semibold">{l.name}</b> <span className={meta}>{l.about}</span></figcaption>
)

export function ShaderLab() {
  const { peaks } = usePeaks(MUSIC_PEAKS)
  const player = useSitePlayer(MUSIC, 'lab')
  const [bars, setBars] = useState<Bars>('wide')
  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={transport}><PlayButton player={player} label={MUSIC_TITLE} /><PlayerTime player={player} /></div>
        <Seg label="Bars" value={bars} onChange={setBars} options={[{ value: 'wide', label: 'Wide' }, { value: 'thin', label: 'Thin' }]} small />
      </div>
      {PARTICLE_LOOKS.map((l) => (
        <figure key={l.name} className={row}>
          {caption(l)}
          {/* Room above the bars for the particles. */}
          <Waveform.Root peaks={peaks} player={player} {...BARS[bars]} contrast={2} className={`${wave} mt-14`}>
            <Waveform.Skeleton className={skeleton} />
            <Waveform.GL fragment={l.glsl} />
            <Particles look={l.look} />
            <Waveform.Hover className={hoverLine} />
          </Waveform.Root>
        </figure>
      ))}
      {LOOKS.map((l) => (
        <figure key={l.name} className={row}>
          {caption(l)}
          <Waveform.Root peaks={peaks} player={player} {...BARS[bars]} contrast={2} className={wave}>
            <Waveform.Skeleton className={skeleton} />
            <Waveform.GL fragment={l.glsl} />
            <Waveform.Hover className={hoverLine} />
          </Waveform.Root>
          <pre className="mt-1 overflow-x-auto rounded-[10px] bg-plate px-3.5 py-3 font-mono text-[12px]/[1.6] text-ink-2">{l.glsl}</pre>
        </figure>
      ))}
    </div>
  )
}
