import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { dark, light } from './shiki-themes'

export type Lang = 'tsx' | 'css' | 'json' | 'javascript' | 'bash' | 'glsl'

// Runs at build time only: the page ships colored HTML and no highlighter.
const highlighter = await createHighlighterCore({
  themes: [light, dark],
  langs: [import('shiki/langs/tsx.mjs'), import('shiki/langs/css.mjs'), import('shiki/langs/json.mjs'), import('shiki/langs/javascript.mjs'), import('shiki/langs/bash.mjs'), import('shiki/langs/glsl.mjs')],
  engine: createJavaScriptRegexEngine(),
})

export function highlight(code: string, lang: Lang = 'tsx'): string {
  const html = highlighter.codeToHtml(code, { lang, themes: { light: light.name, dark: dark.name }, defaultColor: false })
  // Lines render as blocks, so the newlines between them would add gaps.
  return html.replace(/<\/span>\n<span class="line">/g, '</span><span class="line">')
}
