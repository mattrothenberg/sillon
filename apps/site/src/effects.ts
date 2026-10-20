// The effects shown on the site: GLSL for Waveform.GL's `fragment`, and looks for
// the Particles component. Each reads the waveform or the audio, so it follows the
// music, and each moves only while the song plays.
import type { ParticleLook } from './islands/Particles'

/** Played bars glow just behind the playhead and cool down over a few seconds. */
export const AFTERGLOW = `vec4 shade(Bar b) {
  if (!b.played) return waveColor;
  float heat = exp(-b.age / 14.0);
  vec3 ember = mix(vec3(1.0, 0.3, 0.12), vec3(1.0, 0.85, 0.55), b.uv.y * heat);
  return vec4(mix(progressColor.rgb, ember, heat), 1.0);
}`

/** The tips of the played bars light up with how loud the song is right now. */
export const BREATHING = `vec4 shade(Bar b) {
  if (!b.played) return waveColor;
  float lit = smoothstep(1.0 - level * 1.4, 1.0, b.uv.y);
  return vec4(mix(progressColor.rgb, vec3(1.0, 0.36, 0.23), lit), 1.0);
}`

/** Bars ahead of the playhead brighten with each loud moment, fading with distance. */
export const LOOKAHEAD = `vec4 shade(Bar b) {
  if (b.played) return progressColor;
  float pull = pow(level, 0.7) * exp(b.age / 10.0);
  return vec4(mix(waveColor.rgb, vec3(1.0, 0.36, 0.23), pull), 1.0);
}`

export const SPARKS: ParticleLook = { rate: 520, life: [0.45, 1.1], rise: [140, 360], drift: [-110, 20], gravity: 560, size: [1, 2.2], fromTip: 0.8, color: '#ffb36b', glow: true }
export const DUST: ParticleLook = { rate: 220, life: [1.8, 3.6], rise: [14, 46], drift: [-26, 8], gravity: -8, size: [0.8, 1.8], fromTip: 0, color: '--color-ink-2' }

export const EFFECTS = {
  embers: { label: 'Embers', note: 'Afterglow, plus sparks where the playhead meets the bars.', glsl: AFTERGLOW, particles: SPARKS },
  dust: { label: 'Dust', note: 'Faint motes lift off the bar being played.', glsl: null, particles: DUST },
  afterglow: { label: 'Afterglow', note: 'Played bars cool down after the playhead passes.', glsl: AFTERGLOW, particles: null },
  breathing: { label: 'Breathing', note: 'Played tips light up with the loudness right now.', glsl: BREATHING, particles: null },
  lookahead: { label: 'Look-ahead', note: 'Bars ahead brighten with each loud moment.', glsl: LOOKAHEAD, particles: null },
} as const
export type Effect = keyof typeof EFFECTS

const lookName = (l: ParticleLook) => (l === SPARKS ? 'sparks' : 'dust')
const lookSource = (l: ParticleLook) => [
  `const ${lookName(l)} = {`,
  `  rate: ${l.rate}, // particles per second, at full loudness`,
  `  life: [${l.life.join(', ')}], // seconds`,
  `  rise: [${l.rise.join(', ')}], // px/s upward`,
  `  drift: [${l.drift.join(', ')}], // px/s sideways`,
  `  gravity: ${l.gravity},`,
  `  size: [${l.size.join(', ')}],`,
  `  fromTip: ${l.fromTip},`,
  `  color: '${l.color}',${l.glow ? '\n  glow: true,' : ''}`,
  `}`,
].join('\n')

/** The colors Waveform.GL reads, as custom properties on the root. */
export const GL_COLORS = '[--wave-color:var(--color-track)] [--wave-progress:var(--color-ink)]'
/** The Effects demo's Root: its height and GL colors. */
export const EFFECT_ROOT = `h-28 ${GL_COLORS}`
/** The Effects demo's bars: wide and rounded, with quiet passages pushed down. */
export const EFFECT_GEOMETRY = { barWidth: 6, barGap: 3, barRadius: 3, contrast: 2 } as const
const PARTICLES_SRC = 'https://github.com/mattrothenberg/sillon/blob/main/apps/site/src/islands/Particles.tsx'

/** The JSX shown for an effect, matching what the demo renders. */
export function effectJsx(e: Effect): string {
  const x = EFFECTS[e]
  const g = EFFECT_GEOMETRY
  const lines = [
    x.particles ? `// Particles is this site's component, not part of @sillon/react:\n// ${PARTICLES_SRC}\n${lookSource(x.particles)}\n` : '',
    `<Waveform.Root`,
    `  peaks={peaks}`,
    `  player={player}`,
    `  barWidth={${g.barWidth}}`,
    `  barGap={${g.barGap}}`,
    `  barRadius={${g.barRadius}}`,
    `  contrast={${g.contrast}}`,
    `  className="${EFFECT_ROOT}"`,
    `>`,
    `  <Waveform.GL${x.glsl ? ` fragment={${e === 'embers' ? 'afterglow' : e}}` : ''} />`,
    x.particles ? `  <Particles look={${lookName(x.particles)}} />` : '',
    `</Waveform.Root>`,
  ]
  return lines.filter(Boolean).join('\n')
}

/* ------------------------------------------------------------ Visualizer looks */

/** Rays colored around the wheel, brighter toward their tips. */
export const VIS_SUNBURST = `vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
vec4 shade(Ray r) {
  float side = 1.0 - smoothstep(1.1, 2.1, r.across);
  float len = step(r.inner, r.radius) * (1.0 - smoothstep(r.reach - 0.006, r.reach, r.radius));
  float tip = mix(0.35, 1.0, (r.radius - r.inner) / max(r.reach - r.inner, 0.001));
  return vec4(hue(r.angle) * tip, side * len);
}`

export const VIS_LOOKS = {
  rays: { label: 'Rays', glsl: null },
  sunburst: { label: 'Sunburst', glsl: VIS_SUNBURST },
} as const
export type VisLook = keyof typeof VIS_LOOKS
