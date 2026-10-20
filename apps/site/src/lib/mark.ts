// The mark: a record with one groove and a center hole, cut out of a disc so it
// works on any background. Drawn in currentColor. `id` keeps mask ids unique on a page.
const cuts = '<rect width="32" height="32" fill="white"/><circle cx="16" cy="16" r="11" fill="black"/><circle cx="16" cy="16" r="9.4" fill="white"/><circle cx="16" cy="16" r="4" fill="black"/>'

export const markSvg = (id: string, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><mask id="${id}">${cuts}</mask><circle cx="16" cy="16" r="16" fill="currentColor" mask="url(#${id})"/></svg>`
