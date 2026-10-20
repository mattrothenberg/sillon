import { MUSICS, musicSrc } from '../music'
import { meta } from '../cls'

/** Switches the demo music while a version is being chosen. Development only. */
export function DevMusic() {
  return (
    <label className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-[10px] bg-card py-1.5 pr-1.5 pl-3 shadow-[0_4px_16px_rgb(0_0_0/0.1),var(--shadow-lift)]">
      <span className={meta}>Music (dev)</span>
      <select
        className="rounded-[7px] border-0 bg-plate px-1.5 py-[3px] text-[13px] text-ink"
        defaultValue={musicSrc().slice(7, -4)}
        onChange={(e) => { try { localStorage.setItem('music', e.target.value) } catch {} location.reload() }}
      >
        {MUSICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </label>
  )
}
