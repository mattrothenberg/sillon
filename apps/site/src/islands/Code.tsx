// Code arrives already highlighted (at build time), so nothing here loads a highlighter.

export function Code({ html }: { html: string }) {
  return <div data-code="" dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * Every option's code in one grid cell, only the current one visible: the box keeps
 * the tallest one's height, so switching never changes the page's length.
 */
export function CodeStack<K extends string>({ code, current }: { code: Record<K, string[]>; current: K }) {
  return (
    <div className="grid">
      {(Object.keys(code) as K[]).map((k) => (
        <div key={k} className="invisible col-start-1 row-start-1 grid content-start gap-3 data-on:visible" data-on={k === current ? '' : undefined} aria-hidden={k !== current}>
          {code[k].map((html, i) => <Code key={i} html={html} />)}
        </div>
      ))}
    </div>
  )
}
