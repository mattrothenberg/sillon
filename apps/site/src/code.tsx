import { useMemo, useState } from 'react'
import type { HighlighterCore } from 'shiki/core'

export type Lang = 'tsx' | 'css' | 'json' | 'javascript'

/*
 * Page-matched themes: component names in blue, attributes in plum,
 * keywords in raspberry, values in a warm brown. Only punctuation recedes
 * to grey. Every colour clears 4.5:1 against the code background.
 */
type Palette = { ink: string; muted: string; tag: string; attr: string; keyword: string; value: string }

const makeTheme = (name: string, type: 'light' | 'dark', c: Palette) => ({
  name,
  type,
  colors: { 'editor.foreground': c.ink, 'editor.background': '#00000000' },
  settings: [
    { settings: { foreground: c.ink } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: c.muted } },
    { scope: ['keyword', 'storage', 'keyword.control'], settings: { foreground: c.keyword } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: c.attr } },
    { scope: ['entity.name.tag', 'support.class.component', 'entity.name.type'], settings: { foreground: c.tag } },
    { scope: ['string', 'constant.numeric', 'constant.language', 'constant.other'], settings: { foreground: c.value } },
    // Quotes belong to the value they surround.
    { scope: ['punctuation.definition.string', 'string punctuation'], settings: { foreground: c.value } },
    // CSS: selectors read like components, properties like attributes.
    { scope: ['entity.other.attribute-name.class.css', 'entity.name.tag.css'], settings: { foreground: c.tag } },
    { scope: ['support.type.property-name', 'variable.css', 'variable.argument.css'], settings: { foreground: c.attr } },
    { scope: ['support.constant', 'support.function', 'keyword.other.unit'], settings: { foreground: c.value } },
    // JSON keys like attributes.
    { scope: ['support.type.property-name.json'], settings: { foreground: c.attr } },
    { scope: ['comment'], settings: { foreground: c.muted, fontStyle: 'italic' } },
  ],
})

const light = makeTheme('sillon-light', 'light', {
  ink: '#1d1c1a', muted: '#6e6b66', tag: '#1f55c9', attr: '#7b3fa8', keyword: '#b8264f', value: '#a24a0a',
})
const dark = makeTheme('sillon-dark', 'dark', {
  ink: '#ecebe7', muted: '#9d9a94', tag: '#8fb3ff', attr: '#d3a8f5', keyword: '#ff8fab', value: '#eab27a',
})

/*
 * Only the languages the site shows, our own themes, and the JavaScript
 * regex engine (no WebAssembly). main.tsx awaits this before the first
 * render, so code is never shown plain and then recoloured.
 */
let highlighter: HighlighterCore | null = null
export async function loadHighlighter() {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ])
  highlighter = await createHighlighterCore({
    themes: [light, dark],
    langs: [import('shiki/langs/tsx.mjs'), import('shiki/langs/css.mjs'), import('shiki/langs/json.mjs'), import('shiki/langs/javascript.mjs')],
    engine: createJavaScriptRegexEngine(),
  })
}

function highlight(code: string, lang: Lang): string | null {
  if (!highlighter) return null
  const html = highlighter.codeToHtml(code, { lang, themes: { light: light.name, dark: dark.name }, defaultColor: false })
  // Lines render as blocks, so the newlines between them would add gaps.
  return html.replace(/<\/span>\n<span class="line">/g, '</span><span class="line">')
}

export function Code({ children, lang = 'tsx' }: { children: string; lang?: Lang }) {
  const html = useMemo(() => highlight(children, lang), [children, lang])
  return html
    ? <div className="code" dangerouslySetInnerHTML={{ __html: html }} />
    : <pre className="code shiki"><code>{children}</code></pre>
}

export interface Tab { label: string; lang: Lang; code: string }

/** Several snippets for one demo, usually JSX and CSS, behind small tabs. */
export function CodeTabs({ tabs }: { tabs: Tab[] }) {
  const [i, setI] = useState(0)
  const tab = tabs[Math.min(i, tabs.length - 1)]
  return (
    <div className="code-tabs">
      {tabs.length > 1 && (
        <div className="code-tab-bar" role="tablist">
          {tabs.map((t, k) => (
            <button key={t.label} role="tab" aria-selected={k === i} onClick={() => setI(k)}>{t.label}</button>
          ))}
        </div>
      )}
      <Code lang={tab.lang}>{tab.code}</Code>
    </div>
  )
}
