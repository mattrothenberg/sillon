// Vite aliases from the package names to their TypeScript source, for the apps in
// this repo: edits to the library hot-reload with no build step, and the apps never
// run a stale dist. Published packages resolve to dist as usual.
import { fileURLToPath } from 'node:url'

const src = (path) => fileURLToPath(new URL(path, import.meta.url))

export const sourceAliases = [
  { find: /^@sillon\/core$/, replacement: src('./core/src/index.ts') },
  { find: /^@sillon\/core\/mp3$/, replacement: src('./core/src/mp3.ts') },
  { find: /^@sillon\/react$/, replacement: src('./react/src/index.ts') },
]
