/*
 * Page-matched themes: component names in blue, attributes in plum,
 * keywords in raspberry, values in a warm brown. Only punctuation recedes
 * to gray. Every color clears 4.5:1 against the code background.
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

export const light = makeTheme('sillon-light', 'light', {
  ink: '#1d1c1a', muted: '#6e6b66', tag: '#1f55c9', attr: '#7b3fa8', keyword: '#b8264f', value: '#a24a0a',
})
export const dark = makeTheme('sillon-dark', 'dark', {
  ink: '#ecebe7', muted: '#9d9a94', tag: '#8fb3ff', attr: '#d3a8f5', keyword: '#ff8fab', value: '#eab27a',
})
