import { Dialog } from '@base-ui/react/dialog'
import { Code } from './Code'
import { btn } from '../cls'

/** Who wrote and played the song, and the Strudel pattern that played it, in a dialog so the page never moves. */
export function Credit({ pattern }: { pattern: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="mt-4 cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] text-ink-2 underline decoration-edge underline-offset-[3px] hover:decoration-current">
        Aphex Twin, <i>Avril 14th</i>, played by Strudel
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none dark:bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-48px)] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 rounded-2xl bg-paper p-6 text-ink shadow-[0_24px_64px_rgb(0_0_0/0.25),var(--shadow-lift)] transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0 motion-reduce:transition-none narrow:p-4">
          <Dialog.Title className="m-0 text-[20px]/[1.3] font-semibold tracking-[-0.01em]">
            Aphex Twin, <i>Avril 14th</i>, played by Strudel
          </Dialog.Title>
          <Dialog.Description className="m-0 text-[15px] text-ink-2">
            Notes after Nicola Ariutti's <a href="https://sccode.org/1-5d0">SuperCollider transcription</a>. This is the{' '}
            <a href="https://strudel.cc">Strudel</a> pattern that played it, rendered once to MP3.
          </Dialog.Description>
          <div className="min-h-0 overflow-y-auto rounded-xl [&_pre]:min-h-full">
            <Code html={pattern} />
          </div>
          <Dialog.Close className={`${btn} justify-self-end`}>Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
