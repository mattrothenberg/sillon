import { useEffect, useRef } from 'react'
import { Waveform, formatTime, useRecorder, useWaveformStore } from '@sillon/react'
import { PlayButton, PlayerTime, useSitePlayer } from '../ui'
import { HEIGHT, RECORD, RECORD_WINDOW } from '../snippets'
import { cursor, meta, play, skeleton, transport } from '../cls'

// The Recording demo: the snippet's code, plus this site's buttons and a time readout.
export function Recording() {
  const rec = useRecorder()
  const recording = rec.state === 'recording'
  const player = useSitePlayer(rec.url ?? '', 'recording')
  const store = useWaveformStore()

  useEffect(() => rec.peaks?.subscribe(() => {
    const end = rec.peaks!.duration
    if (rec.peaks!.complete) store.setView(0, null)
    else store.setView(Math.max(0, end - RECORD_WINDOW), Math.max(RECORD_WINDOW, end))
  }), [rec.peaks, store])

  // The recording's length while it records, written as text without a render per frame.
  const time = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const p = rec.peaks, el = time.current
    if (!p || !el) return
    let last = ''
    return p.subscribe(() => { const t = formatTime(p.duration); if (t !== last) el.textContent = last = t })
  }, [rec.peaks])

  const status = rec.error
    ? (rec.error.name === 'NotAllowedError' ? 'The microphone is blocked for this page.' : `Couldn't record: ${rec.error.message}`)
    : recording ? 'Recording' : rec.state === 'starting' ? 'Asking for the microphone…' : rec.url ? 'Your recording. It stays on this page.' : 'Records from your microphone. It stays on this page.'

  return (
    <div className="grid gap-5">
      <Waveform.Root
        store={store}
        peaks={rec.peaks}
        player={rec.url ? player : null}
        progressive
        barWidth={2}
        barGap={1}
        barRadius={1}
        className={HEIGHT.record}
        aria-label="Seek in your recording"
      >
        <Waveform.Skeleton className={skeleton} />
        <Waveform.Shape>
          <Waveform.Track className={recording ? RECORD.live : RECORD.track} />
          <Waveform.Progress className={RECORD.played} />
        </Waveform.Shape>
        {rec.url && <Waveform.Cursor className={cursor} />}
      </Waveform.Root>
      <div className={transport}>
        <button
          className={`${play} ${recording ? 'bg-accent' : ''}`}
          onClick={() => void (recording ? rec.stop() : rec.start())}
          disabled={rec.state === 'starting'}
          aria-label={recording ? 'Stop recording' : 'Record'}
        >
          {recording ? (
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden><circle cx="8" cy="8" r="5" /></svg>
          )}
        </button>
        <PlayButton player={player} label="your recording" disabled={!rec.url || recording} />
        {rec.url && !recording ? <PlayerTime player={player} known={rec.peaks?.duration ?? 0} /> : <span className={meta} ref={time}>0:00</span>}
      </div>
      {/* One line, always: a longer message never moves the page. */}
      <p className={`${meta} -mt-1 h-[1.5em] truncate`} role="status">{status}</p>
    </div>
  )
}
