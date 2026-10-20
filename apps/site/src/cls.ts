// Class lists used in more than one file. Anything used in one place stays inline there.

/** The page's one column: text, demos and code share its left edge. */
export const col = 'mx-auto w-full max-w-[calc(var(--container-col)+2*var(--gutter))] px-(--gutter)'

/** Small mono type, with no color: meta's, for text that needs another color. */
export const mono = 'font-mono text-[13px]/[1.5] font-normal tabular-nums'
/** Small mono text for times, labels and captions. */
export const meta = `${mono} text-ink-3 [&_b]:font-medium [&_b]:text-ink`

/** A numbered section, ruled off from the one before. */
export const section = 'mt-[88px] scroll-mt-[76px] border-t border-rule pt-[72px] narrow:mt-16 narrow:pt-14'
/** Room below the last section; the page has no footer. */
export const pageEnd = 'pb-[160px]'

/** A section's number, above its title. */
export const chapterN = 'mb-2.5 block font-mono text-[12px]/none text-accent tabular-nums'
/** A section's title and opening paragraph. */
export const lede = 'mb-9 max-w-text'
export const ledeTitle = 'm-0 text-[26px]/[1.25] font-semibold tracking-[-0.015em] text-ink'
export const ledeText = 'mt-3 text-ink-2 [&_code]:text-ink'

/** Code under a demo; code blocks stacked in it are 12px apart. */
export const demoCode = 'mt-8 [&>[data-code]+[data-code]]:mt-3'

/** Play button and time, side by side. */
export const transport = 'flex items-center gap-3.5'
export const play =
  'grid size-9 flex-none cursor-pointer place-items-center rounded-full border-0 bg-ink p-0 text-paper transition-[scale] duration-160 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-92 [&_svg]:block [&_svg]:size-[13px]'

/* Waveform parts, as most demos style them. */
/** Even, low bars while the file loads. */
export const skeleton = 'bg-track opacity-50 transition-opacity duration-180'
/** Put on every Waveform.Shape: hidden while loading, so the skeleton fades into the real bars. */
export const shape = 'transition-opacity duration-180 in-data-[state=loading]:opacity-0'
export const cursor = '-ml-px w-0.5 rounded-[1px] bg-accent'
export const hoverLine = '-ml-[0.5px] w-px bg-hover-line transition-opacity duration-120'
/** The time above the hover line. Above the bars, so it never covers anything below. */
export const hoverTip = `absolute bottom-[calc(100%+8px)] left-0 -translate-x-1/2 whitespace-nowrap ${mono} text-ink`

/** A floating card, without size or padding (Base UI popovers animate it in and out). */
export const card =
  'rounded-[10px] bg-card text-[14px]/[1.45] text-ink-2 shadow-[0_6px_24px_rgb(0_0_0/0.1),var(--shadow-lift)] transition-[opacity,scale] duration-120 data-ending-style:scale-96 data-ending-style:opacity-0 data-starting-style:scale-96 data-starting-style:opacity-0 motion-reduce:transition-none'
/** A small card of text: the wordmark's tooltip. */
export const tip = `${card} grid max-w-[240px] gap-1 px-3 py-2.5`

/* Comments on a waveform: an avatar under the bars, a count when several share it, a bubble for the newest. */
export const pin = 'pointer-events-none flex items-end'
export const face = 'pointer-events-auto cursor-pointer rounded-full border-0 bg-transparent p-0'
/** Set `--hue` on it, and give it one of `ring`. */
export const avatar =
  'grid size-[22px] place-items-center rounded-full bg-[oklch(0.5_0.12_var(--hue))] font-sans text-[11px]/none font-medium text-white'
/** A gap in the paper color around avatars on the page, plus an accent ring on the comment being played. */
export const ring = {
  on: 'shadow-[0_0_0_2px_var(--color-paper)]',
  live: 'shadow-[0_0_0_2px_var(--color-paper),0_0_0_4px_var(--color-accent)]',
}
export const count = 'grid h-4 min-w-4 place-items-center rounded-lg bg-ink px-1 font-mono text-[10px]/none font-medium text-paper'
/** How the bubble looks; where it sits is up to its waveform. */
export const bubble =
  'absolute m-0 whitespace-nowrap rounded-[10px] bg-card px-3 py-1.5 text-[14px]/[1.4] text-ink-2 shadow-lift [&_b]:mr-1 [&_b]:font-medium [&_b]:text-ink'

export const btn = 'cursor-pointer rounded-full border-0 bg-plate px-3.5 py-1.5 text-[14px] text-ink hover:bg-plate-2 disabled:cursor-default disabled:opacity-45'
