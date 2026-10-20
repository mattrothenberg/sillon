import type { ReactNode } from 'react'
import { Tabs } from '@base-ui/react/tabs'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'

// One pill-shaped row of choices, in two roles: tabs when each choice shows a different
// demo (Looks), a toggle group when it only sets a value (Seg).
// Scrolls sideways on its own when the choices are wider than the screen, rather than widening the page.
const row = 'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-plate p-[3px] [scrollbar-width:none]'
const choice = (small?: boolean) =>
  `shrink-0 cursor-pointer whitespace-nowrap rounded-full border-0 bg-transparent text-ink-2 hover:text-ink ${small ? 'px-[11px] py-[3px] text-[13px]/[1.4]' : 'px-3.5 py-[5px] text-[14px]/[1.4] tiny:px-2.5 tiny:text-[13px]/[1.4]'}`

interface Option<T> { value: T; label: ReactNode }

/**
 * Looks of one demo, as tabs; the demo is their panel. Each look's `note` sits at
 * the other end of the tab row. Keep the panel's height the same for every look
 * (see CodeStack), or switching changes the page's length and the rail jumps.
 */
export function Looks<T extends string>({ value, options, onChange, label, children }: {
  value: T
  options: readonly (Option<T> & { note: ReactNode })[]
  onChange: (v: T) => void
  label: string
  children: ReactNode
}) {
  return (
    <Tabs.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Tabs.List className={row} aria-label={label}>
          {options.map((o) => (
            <Tabs.Tab key={o.value} value={o.value} className={`${choice()} data-active:bg-card data-active:text-ink data-active:shadow-lift`}>
              {o.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {/* Every note in one cell, as with the code: a longer one wrapping can't move the page. */}
        <span className="grid justify-items-end narrow:justify-items-start">
          {options.map((o) => (
            <span key={o.value} className="invisible col-start-1 row-start-1 data-on:visible" data-on={o.value === value ? '' : undefined} aria-hidden={o.value !== value}>
              {o.note}
            </span>
          ))}
        </span>
      </div>
      <Tabs.Panel value={value} className="focus-visible:outline-offset-8">{children}</Tabs.Panel>
    </Tabs.Root>
  )
}

/** Picks one value; pressing the picked one again keeps it. */
export function Seg<T extends string>({ value, options, onChange, label, small }: {
  value: T
  options: readonly Option<T>[]
  onChange: (v: T) => void
  label: string
  small?: boolean
}) {
  return (
    <ToggleGroup value={value ? [value] : []} onValueChange={(v) => v.length && onChange(v[0] as T)} className={row} aria-label={label}>
      {options.map((o) => (
        <Toggle key={o.value} value={o.value} className={`${choice(small)} data-pressed:bg-card data-pressed:text-ink data-pressed:shadow-lift`}>
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
